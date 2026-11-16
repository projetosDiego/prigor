# Publicar o site oficial (docesprigor.com.br) junto com o sistema

O site oficial mora na pasta `site/` deste repositório e sobe na mesma VPS, pelo
mesmo `deploy.sh`. Depois de publicado:

| Endereço | O que abre |
| --- | --- |
| `https://docesprigor.com.br` | site oficial (container `prigor-site`) |
| `https://docesprigor.com.br/admin` | painel do site (conteúdo, Natal, pedidos do site) |
| `https://app.docesprigor.com.br` | sistema — CRM/ERP (container `prigor-app`) |
| `https://docesprigor.com.br/app` | atalho: encaminha para o sistema |

Os endereços que o sistema usava no domínio principal (`/login`, `/seller`,
`/pedido/...`, `/api/public/...` — links de boleto, nota e PDF já enviados a
clientes) continuam funcionando: o site encaminha para `app.docesprigor.com.br`.
Exceção: `docesprigor.com.br/admin` passa a ser o painel do **site**; o painel do
sistema fica em `app.docesprigor.com.br/admin`.

## Passo a passo (uma vez só)

1. **DNS** — no painel do domínio (Hostinger → Domínios → DNS), criar um registro
   `A` com nome `app` apontando para o IP da VPS (o mesmo do domínio principal).
2. **Enviar o código** — no computador, dois cliques em `C:\projetos\PRIGOR\publicar.cmd`.
   Ele copia a pasta do site para `prigor\site`, mostra o que vai enviar e faz
   commit + push. O deploy automático roda, mas **nada muda no ar ainda**: o site
   só entra quando o passo 3 for feito.
3. **Ligar o site** — na VPS:
   ```bash
   cd /opt/prigor && git pull && bash scripts/publicar-site.sh
   ```
   O script confere o DNS, pergunta e-mail e senha do painel do site, grava as
   variáveis no `.env` (com backup) e roda o deploy. Para voltar atrás:
   `bash scripts/publicar-site.sh --desfazer`.

Daí em diante, qualquer mudança no site ou no sistema vai ao ar com o
`publicar.cmd`.

## Como funciona

- `docker-compose.prod.yml` tem o serviço `site` no perfil `site`. O `deploy.sh`
  ativa o perfil quando `SITE_DOMAIN` existe no `.env`. Os builds rodam um de
  cada vez para caber na memória da VPS.
- Variáveis gravadas pelo script: `APP_DOMAIN` (vira `app.<domínio>`),
  `APP_HOSTS`, `SITE_DOMAIN`, `SITE_ADMIN_EMAIL`, `SITE_ADMIN_PASSWORD`,
  `SITE_SESSION_SECRET`, `SITE_ORDERS_SECRET`.
- Pedidos do site → sistema: o site chama `http://prigor-app:3000/api/public/site-orders`
  pela rede interna do Docker, assinado com `SITE_ORDERS_SECRET` (ver
  `PEDIDOS-DO-SITE.md`). Não precisa configurar nada no painel do site.
- Dados do site: SQLite + imagens enviadas, no volume `prigor-site-data`
  (`/data` no container). Na primeira subida o banco é criado pelas migrations
  e recebe produtos e pontos de venda de `site/docker/dados-iniciais.json`;
  depois disso, só o painel altera os dados. O `backup.sh` passa a guardar
  também `site-AAAAMMDD-HHMMSS.db.gz`.
- O build do site gera as páginas com um banco descartável; ao subir, o
  container pede para o site refazer as páginas com os dados reais
  (`site/docker/entrypoint.sh`).

## Conferir depois de publicar

```bash
docker ps --format '{{.Names}}\t{{.Status}}' | grep prigor
curl -sI https://docesprigor.com.br | head -1
curl -sI https://app.docesprigor.com.br/login | head -1
curl -sI https://docesprigor.com.br/app | grep -i location
```

Fazer um pedido de teste em `https://docesprigor.com.br/natal2026` e ver se ele
aparece no sistema como pedido novo (e em Painel do site → Pedidos como
"Enviado").

## Pendências que não são deste script

- Chave Pix do Natal: painel do site → Natal.
- Se houver tarefa agendada (crontab) chamando `https://docesprigor.com.br/api/...`,
  trocar para `https://app.docesprigor.com.br/api/...` — o script avisa se achar.
