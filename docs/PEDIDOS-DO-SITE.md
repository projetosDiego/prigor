# Pedidos do site oficial → ERP

O site (`C:\projetos\PRIGOR\site`) tem o cardápio de Natal com carrinho e
finalização (`/natal2026`). Cada pedido feito lá é gravado no banco do site e
enviado para cá.

## Como chega

`POST /api/public/site-orders`

- Autenticação: `X-Prigor-Timestamp` + `X-Prigor-Signature: sha256=HMAC(SITE_ORDERS_SECRET, "<timestamp>.<corpo>")`.
  Assinatura com mais de 10 minutos é recusada. Sem `SITE_ORDERS_SECRET` o endpoint responde 503.
- Idempotente: o código do site (`NAT-0007`) vira `eventos_integracao (provedor = site)`. Reenviar devolve o mesmo pedido.
- O ERP refaz a conta (quantidade × preço − % de desconto da linha, meio para cima) e recusa se o total
  não bater ao centavo com o que o cliente viu (`domain/site-order.ts`).

## O que é gravado

| ERP | Origem |
|---|---|
| Cliente | Procurado por CNPJ (PJ) ou CPF (PF). Se não existe, é criado com categoria "Cliente do site". Cliente existente só tem celular/e-mail atualizados. |
| Endereço de entrega | Novo endereço do cliente, rótulo "Entrega site NAT-xxxx". |
| Produto | Pelo `sku` (ex.: `NATAL-GUIRLANDA-MINI`). Se não existir, é criado com o preço do site, categoria "Natal 2026" e sem controle de estoque. |
| Pedido | Status `novo`, sem vendedor/comissão, forma de pagamento Pix ou Cartão de crédito, data de entrega escolhida, desconto por item. |
| Observações | Origem, entrega/retirada, sinal ou total a pagar e as escolhas (recheio/sabor) de cada item. |

Confirmar o pagamento (sinal/total) continua sendo tarefa da gerência, como nos demais pedidos.

## Ligar

1. Gere um segredo: `openssl rand -hex 32`.
2. VPS: `SITE_ORDERS_SECRET=<segredo>` no `/opt/prigor/.env` e `docker compose -f docker-compose.prod.yml --env-file .env up -d`.
3. Painel do site → Configurações → ERP: endereço `https://<domínio do ERP>/api/public/site-orders` e o mesmo segredo.
4. Faça um pedido de teste e confira em Pedidos (site) o número do ERP.

Código: `domain/site-order.ts` (regras puras + testes em `tests/domain/site-order.test.ts`),
`validation/site-order.ts`, `integrations/site.ts` (assinatura), `services/site-orders.ts`, rota em `app/api/public/site-orders`.
