# Deploy na VPS

O Prigor entra na **mesma VPS Hostinger onde o ActPost já roda**, aproveitando
a infraestrutura que já está lá. Isso significa: sem segundo nginx, sem segundo
Postgres, sem certbot próprio.

---

## Como fica

```
┌───────────────────────────────────────────────────────────────┐
│  VPS Hostinger KVM 1 (4GB)                                    │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ nginx-proxy (80/443)  ← já existe, do ActPost           │  │
│  │ roteia por domínio, via VIRTUAL_HOST dos containers      │  │
│  └──┬──────────────┬───────────────┬──────────────────────┘  │
│     │              │               │                          │
│  ┌──┴────┐   ┌─────┴──────┐  ┌────┴──────────┐               │
│  │landing│   │ actpost-app│  │  prigor-app   │  ← novo       │
│  │       │   │ Spring 21  │  │  Next.js 16   │               │
│  └───────┘   └─────┬──────┘  └────┬──────────┘               │
│                    │              │                           │
│              ┌─────┴──────────────┴─────┐                     │
│              │ actpost-postgres (16)    │  ← já existe        │
│              │   actpost_prod           │                     │
│              │   actpost_staging        │                     │
│              │   prigor          ← novo │                     │
│              └──────────────────────────┘                     │
│                                                               │
│  + acme-companion  ← já existe, emite e renova os certs       │
└───────────────────────────────────────────────────────────────┘
```

**Domínios:**

| Domínio | Vai para |
|---|---|
| `docesprigor.com.br` | prigor-app |
| `www.docesprigor.com.br` | prigor-app |

O roteamento e o certificado saem sozinhos das variáveis `VIRTUAL_HOST` e
`LETSENCRYPT_HOST` no `docker-compose.prod.yml` — é assim que o nginx-proxy
descobre um container novo. Não há arquivo de configuração de nginx para
editar.

**Por que reaproveitar o Postgres do ActPost:** a VPS tem 4GB e o Spring Boot
já ocupa 768MB de heap. Uma segunda instância de Postgres custaria uns 250MB
sem trazer nada — o isolamento que importa (banco e usuário separados) se
obtém dentro da mesma instância. O contra é real e vale saber: reiniciar
aquele Postgres derruba os dois sistemas.

---

## 1. DNS

No painel do registrador do `docesprigor.com.br`, aponte para o IP da VPS:

| Tipo | Nome | Valor |
|---|---|---|
| A | `@` | IP da VPS |
| A | `www` | IP da VPS |

Confira antes de continuar — o Let's Encrypt falha se o DNS ainda não
propagou:

```bash
dig +short docesprigor.com.br
dig +short www.docesprigor.com.br
```

Os dois têm que devolver o IP da VPS.

## 2. Clonar na VPS

```bash
ssh SEU_USUARIO@IP_DA_VPS

sudo mkdir -p /opt/prigor
sudo chown "$USER":"$USER" /opt/prigor
git clone https://github.com/projetosDiego/prigor.git /opt/prigor
cd /opt/prigor
```

## 3. Criar o banco do Prigor (uma vez só)

O script de init do Postgres só roda no primeiro boot do container, e aquele
Postgres já foi inicializado há tempos. Então o banco e o usuário do Prigor são
criados à mão, uma única vez.

Gere a senha primeiro e guarde — ela vai para o `.env` no passo seguinte:

```bash
openssl rand -base64 32
```

Depois, substituindo `SENHA_AQUI`:

```bash
docker exec -i actpost-postgres psql -U actpost -d actpost_prod <<'SQL'
CREATE USER prigor WITH PASSWORD 'SENHA_AQUI';
CREATE DATABASE prigor OWNER prigor;
GRANT ALL PRIVILEGES ON DATABASE prigor TO prigor;
SQL
```

> Se o usuário do Postgres do ActPost não for `actpost`, confira em
> `/opt/actpost/.env`, na variável `POSTGRES_USER`.

Confirme:

```bash
docker exec -it actpost-postgres psql -U prigor -d prigor -c '\conninfo'
```

## 4. Configurar

```bash
cd /opt/prigor
cp .env.prod.example .env
nano .env
```

Preencha, no mínimo:

```env
APP_DOMAIN=docesprigor.com.br
LETSENCRYPT_EMAIL=voce@docesprigor.com.br

PRIGOR_DB_PASSWORD=<a senha gerada no passo 3>
JWT_SECRET=<openssl rand -hex 32>
GOOGLE_MAPS_API_KEY=<chave real do Google Places>

# só nesta primeira subida:
RUN_SEED=true
ADMIN_EMAIL=voce@docesprigor.com.br
ADMIN_PASSWORD=<senha forte, mínimo 12 caracteres>
```

> A aplicação **se recusa a subir** se `JWT_SECRET` tiver menos de 32
> caracteres, se `GOOGLE_MAPS_API_KEY` estiver vazia ou for de
> desenvolvimento, ou se `ALLOW_MOCK_PLACES` estiver ligado. É proposital:
> subir mal configurado é pior do que não subir.

## 5. Subir

```bash
./deploy.sh
```

O `deploy.sh` confere que as redes `actpost-proxy` e `actpost-internal` existem
e que o `actpost-postgres` está no ar antes de qualquer coisa — sem isso o
container subiria órfão, sem roteamento e sem banco. Depois faz `git pull`,
build, `up -d`, limpa imagem e cache antigos, e espera o healthcheck.

O primeiro build leva uns 3–5 minutos. O certificado sai ~30 segundos depois
que o container sobe:

```bash
docker logs -f acme-companion
```

Quando aparecer `Reload Nginx server`, abra <https://docesprigor.com.br>.

## 6. Depois da primeira subida

No `.env`, volte `RUN_SEED=false` e **apague `ADMIN_PASSWORD`** — ela já criou
o usuário e não tem por que continuar em disco:

```bash
nano .env
docker compose -f docker-compose.prod.yml --env-file .env up -d
```

## 7. Backup

O ActPost já tem o backup dele; este é o do Prigor, no mesmo formato.

```bash
crontab -e
```

Adicione (3h20, vinte minutos depois do ActPost, para os dois não disputarem
disco ao mesmo tempo):

```cron
20 3 * * * cd /opt/prigor && ./backup.sh >> /opt/prigor/backups/backup.log 2>&1
```

Teste agora:

```bash
cd /opt/prigor && ./backup.sh && ls -lh backups/
```

Restaurar:

```bash
gunzip -c backups/prigor-AAAAMMDD-HHMMSS.sql.gz | \
  docker exec -i actpost-postgres psql -U prigor -d prigor
```

**Leve os backups para fora da VPS.** Backup no mesmo disco do banco não
protege contra perda do disco:

```bash
# da sua máquina, semanalmente
rsync -avz SEU_USUARIO@IP_DA_VPS:/opt/prigor/backups/ ~/backups-prigor/
```

## 8. Deploy automático (opcional)

O repositório já tem `.github/workflows/deploy-prod.yml`: todo push em `main`
roda a verificação (tipos, uso do Prisma, lint, testes) e, se passar, conecta
na VPS e executa `/opt/prigor/deploy.sh`.

Para ligar, crie os segredos em **Settings → Secrets and variables → Actions**:

| Segredo | Valor |
|---|---|
| `VPS_HOST` | IP da VPS |
| `VPS_USER` | usuário de deploy |
| `VPS_SSH_KEY` | chave privada com acesso a esse usuário |

São os mesmos que o ActPost já usa. Se o repositório do ActPost estiver na
mesma conta, dá para reaproveitar a mesma chave.

Diferença em relação ao workflow do ActPost: aqui o deploy só acontece depois
de `npm run verify` passar. Um erro de tipo ou um teste vermelho não chega em
produção.

---

## Operação

### Deploy de uma versão nova

```bash
cd /opt/prigor && ./deploy.sh
```

### Logs

Uma linha JSON por evento:

```bash
docker logs -f prigor-app
docker logs prigor-app | grep '"level":"error"'
```

Quando um usuário relatar erro, peça o código que apareceu na tela:

```bash
docker logs prigor-app | grep '<código>'
```

### Banco

```bash
docker exec -it actpost-postgres psql -U prigor -d prigor
```

### Reiniciar só o Prigor

```bash
docker restart prigor-app
```

Não afeta o ActPost.

### Saúde

```bash
curl -s https://docesprigor.com.br/api/health
# {"status":"ok","database":"ok",...}
```

---

## Quando algo dá errado

| Sintoma | Onde olhar |
|---|---|
| `Rede 'actpost-proxy' não existe` | O stack do ActPost está parado. `cd /opt/actpost && ./deploy.sh` |
| Container sobe e morre | `docker logs prigor-app` — quase sempre é `.env` incompleto; a mensagem diz qual variável falta |
| `Can't reach database server` | Senha errada no `.env`, ou o banco do passo 3 não foi criado |
| Site não abre, sem certificado | `docker logs acme-companion`. Confira o DNS com `dig +short docesprigor.com.br` |
| 502 no navegador | O container está fora ou unhealthy: `docker ps` e `docker logs prigor-app` |
| Erro 401 em tudo após deploy | `JWT_SECRET` mudou — as sessões abertas caíram. Basta refazer login |
| VPS com pouca memória | `docker stats`. O Prigor tem teto de 768MB; se estiver batendo, investigue antes de subir o limite |

### Rollback

```bash
cd /opt/prigor
git log --oneline -5
git checkout <commit-anterior>
docker compose -f docker-compose.prod.yml --env-file .env up -d --build
```

Atenção: rollback do código **não desfaz migration**. Se a versão com problema
aplicou uma migration, restaure o backup do banco antes de voltar o código.
