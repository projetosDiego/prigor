# Backup do Doces Prigor OS

O backup salva **o banco inteiro** (pedidos, clientes, financeiro, boletos, tudo) e a
**configuração** (`.env`, que guarda as chaves e o certificado do Sicoob), tudo
**criptografado**, e envia uma cópia para a **nuvem**, fora da VPS.

> Antes só havia backup no próprio servidor. Se a VPS se perdesse, os backups iam junto.

## Visão geral

| Item | Onde fica | Por quanto tempo |
|---|---|---|
| Cópia local (criptografada) | `/opt/prigor/backups` na VPS | 14 dias |
| Cópia na nuvem (criptografada) | Backblaze B2 ou Cloudflare R2 | 90 dias |
| Chave de criptografia | `/opt/prigor/.backup-key` **e uma cópia sua, fora da VPS** | para sempre |

**A chave é o ponto mais importante.** Sem ela ninguém abre o backup (nem você, nem eu).
Guarde uma cópia no gerenciador de senhas e outra num pen drive ou e-mail seu.

## 1. Criar a conta da nuvem (uma vez)

Escolha uma (as duas têm 10 GB grátis, mais que suficiente):

- **Backblaze B2**: crie conta em backblaze.com, depois *B2 Cloud Storage → Buckets → Create a Bucket*
  (nome `prigor-backups`, privado). Em *Application Keys*, crie uma chave só para esse bucket e
  anote o `keyID` e a `applicationKey`.
- **Cloudflare R2**: no painel da Cloudflare, *R2 → Create bucket* (`prigor-backups`), depois
  *Manage API tokens* com permissão de leitura e escrita nesse bucket. Anote o `Access Key ID`,
  o `Secret` e o endereço do endpoint.

## 2. Instalar e configurar o rclone na VPS (uma vez)

```bash
ssh SEU_USUARIO@IP_DA_VPS
curl https://rclone.org/install.sh | sudo bash
rclone config
```

No assistente: `n` (novo), nome `prigor-b2` (ou `prigor-r2`), escolha o tipo
(`Backblaze B2` ou `Amazon S3 Compliant → Cloudflare`), cole as chaves e finalize.

Teste:

```bash
rclone lsd prigor-b2:
```

## 3. Criar a chave de criptografia (uma vez)

```bash
cd /opt/prigor
openssl rand -base64 48 > .backup-key
chmod 600 .backup-key
cat .backup-key
```

**Copie o texto que apareceu e guarde fora da VPS agora.**

## 4. Ligar a nuvem no .env

```bash
nano /opt/prigor/.env
```

Acrescente (troque pelo nome do seu remoto e do bucket):

```
RCLONE_REMOTE=prigor-b2:prigor-backups
# Opcional: aviso se o backup parar de rodar (veja o passo 7)
# HEALTHCHECK_URL=https://hc-ping.com/SEU-CODIGO
```

## 5. Rodar o primeiro backup

```bash
cd /opt/prigor && ./backup.sh
rclone ls prigor-b2:prigor-backups
```

Devem aparecer dois arquivos `.enc` (banco e configuração) tanto na VPS quanto na nuvem.

## 6. Agendar todo dia

```bash
crontab -e
```

```cron
20 3 * * * cd /opt/prigor && ./backup.sh >> /opt/prigor/backups/backup.log 2>&1
```

Se quiser mais de um por dia (recomendado em dias de muito movimento), acrescente
`20 13 * * *` com o mesmo comando.

## 7. Aviso quando o backup falhar (recomendado)

O serviço gratuito healthchecks.io avisa por e-mail se o backup não rodar. Crie um
"check" com período de 1 dia, copie o endereço de ping e coloque em `HEALTHCHECK_URL` no `.env`.
O `backup.sh` já avisa sozinho no sucesso e na falha.

## 8. Testar a restauração (todo mês)

Backup que nunca foi testado não é backup. Este comando restaura num banco de teste,
mostra as maiores tabelas e apaga o teste, sem tocar na produção:

```bash
cd /opt/prigor
./restore.sh backups/prigor-AAAAMMDD-HHMMSS.sql.gz.enc
```

Para restaurar um backup que está só na nuvem:

```bash
rclone copy prigor-b2:prigor-backups/prigor-AAAAMMDD-HHMMSS.sql.gz.enc /opt/prigor/backups/
```

## 9. Se acontecer o pior (restaurar em produção)

```bash
cd /opt/prigor
docker compose -f docker-compose.prod.yml --env-file .env stop
./restore.sh backups/prigor-AAAAMMDD-HHMMSS.sql.gz.enc --aplicar
docker compose -f docker-compose.prod.yml --env-file .env up -d
```

O script pede para digitar `RESTAURAR` e antes faz um backup de segurança do estado atual.

Em uma VPS nova: instale Docker, clone o projeto, baixe o `-config.tar.gz.enc` e o
`.sql.gz.enc` da nuvem, decifre o `.env` com a chave e siga o `docs/DEPLOY.md`:

```bash
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass file:.backup-key \
  -in prigor-AAAAMMDD-HHMMSS-config.tar.gz.enc | tar -xz -C /opt/prigor
```

## Cópia no seu computador (opcional)

No PowerShell do Windows, um comando por vez:

```
mkdir C:\backups-prigor
```
```
scp SEU_USUARIO@IP_DA_VPS:/opt/prigor/backups/*.enc C:\backups-prigor\
```

## Esquema da restauração em resumo

1. Parar o app.
2. `./restore.sh arquivo.sql.gz.enc --aplicar`.
3. Subir o app.
4. Conferir pedidos e financeiro na tela.
