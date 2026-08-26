# Subir em produção (VPS)

Alvo: um servidor pequeno rodando Docker. Testado com Ubuntu 22.04+.
Um VPS de 2 vCPU e 4 GB dá conta com folga.

---

## 1. Antes de começar

Você vai precisar de:

- uma VPS com IP público
- um domínio apontando para esse IP (registro A)
- uma chave da Google Places API com faturamento ativo

---

## 2. Preparar o servidor

```bash
ssh root@SEU_IP

# Docker
curl -fsSL https://get.docker.com | sh

# Firewall: só SSH e web
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable

# Usuário sem root para a aplicação
adduser --disabled-password --gecos "" prigor
usermod -aG docker prigor
```

## 3. Colocar o código no servidor

```bash
su - prigor
git clone SEU_REPOSITORIO prigor && cd prigor
```

## 4. Configurar

```bash
cp .env.example .env.prod
nano .env.prod
```

Preencha, no mínimo:

```env
POSTGRES_USER=prigor
POSTGRES_PASSWORD=<gere: openssl rand -base64 24>
POSTGRES_DB=prigor

JWT_SECRET=<gere: openssl rand -hex 32>
APP_URL=https://erp.seudominio.com.br
GOOGLE_MAPS_API_KEY=<sua chave real>

# Só na primeira subida, para criar o administrador:
RUN_SEED=true
ADMIN_EMAIL=voce@seudominio.com.br
ADMIN_PASSWORD=<senha forte, mínimo 12 caracteres>

COMPANY_NAME=Doces Prigor
COMPANY_LEGAL_NAME=...
COMPANY_CNPJ=...
```

Depois troque o domínio no nginx:

```bash
sed -i 's/SEU_DOMINIO/erp.seudominio.com.br/g' docker/nginx.conf
```

> A aplicação **se recusa a subir** se `JWT_SECRET` tiver menos de 32
> caracteres, se `ALLOW_MOCK_PLACES` estiver ligado ou se a chave do Google for
> de desenvolvimento. É proposital: subir mal configurado é pior que não subir.

## 5. Certificado HTTPS

O nginx não sobe sem o certificado, e o certbot precisa do nginx no ar. Quebre
o ciclo emitindo o certificado antes:

```bash
mkdir -p certbot/www certbot/conf
docker run --rm -p 80:80 \
  -v "$PWD/certbot/conf:/etc/letsencrypt" \
  -v "$PWD/certbot/www:/var/www/certbot" \
  certbot/certbot certonly --standalone \
  -d erp.seudominio.com.br \
  --email voce@seudominio.com.br --agree-tos --no-eff-email
```

A renovação depois é automática: o serviço `certbot` do compose tenta a cada
12 horas.

## 6. Subir

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

Na subida o container aplica as migrations (`prisma migrate deploy`) e, se
`RUN_SEED=true`, cria o administrador.

Confira:

```bash
docker compose -f docker-compose.prod.yml ps
curl -s https://erp.seudominio.com.br/api/health
# {"status":"ok","database":"ok",...}
```

## 7. Depois da primeira subida

Volte `RUN_SEED=false` e **apague `ADMIN_PASSWORD` do `.env.prod`** — ela já
cumpriu o papel e não deve continuar em disco.

```bash
nano .env.prod
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

---

## Operação

### Atualizar a aplicação

```bash
cd ~/prigor && git pull
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

As migrations pendentes são aplicadas sozinhas. `migrate deploy` só executa
migrations já versionadas — nunca altera o schema por conta própria.

### Logs

O log é uma linha JSON por evento:

```bash
docker compose -f docker-compose.prod.yml logs -f app
docker compose -f docker-compose.prod.yml logs app | grep '"level":"error"'
```

Quando um usuário reportar um erro, peça o código que apareceu na tela e
procure por ele:

```bash
docker compose -f docker-compose.prod.yml logs app | grep '<código>'
```

### Backup

O serviço `backup` gera um dump comprimido por dia em `./backups/` e mantém 14
dias. **Copie essa pasta para fora do servidor** — backup que mora no mesmo
disco não é backup:

```bash
# da sua máquina
rsync -avz prigor@SEU_IP:~/prigor/backups/ ~/backups-prigor/
```

Restaurar:

```bash
gunzip -c backups/prigor-AAAAMMDD-HHMM.sql.gz | \
  docker compose -f docker-compose.prod.yml exec -T db psql -U prigor prigor
```

### Acesso ao banco

O Postgres **não** expõe porta para a internet: só a rede interna do compose o
alcança. Para consultar:

```bash
docker compose -f docker-compose.prod.yml exec db psql -U prigor prigor
```

---

## Se algo der errado

| Sintoma | Onde olhar |
|---|---|
| App não sobe | `docker compose logs app` — quase sempre é `.env.prod` incompleto; a mensagem diz qual variável falta |
| `/api/health` responde 503 | Banco fora do ar ou credencial errada: `docker compose logs db` |
| Erro 401 em tudo, logo após deploy | `JWT_SECRET` mudou — as sessões existentes foram invalidadas; basta refazer login |
| Prospecção falha | Chave do Google ausente/inválida, ou a API foi pausada por atingir o teto de custo (veja em Configurações → Consumo de API) |
| Certificado expirado | `docker compose logs certbot` |
