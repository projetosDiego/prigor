# Decisões de arquitetura e mudanças de comportamento

Registro do que mudou na reconstrução para produção, e por quê. Leia antes de
alterar cálculo financeiro ou estoque.

---

## 1. Um sistema, um banco, uma linguagem

**Antes:** dois sistemas. Um ERP em Python/FastAPI e um painel em Next.js. O
painel era a casca; as telas de ERP passavam por um proxy `/api/erp/[...path]`
que repassava para o FastAPI.

**Agora:** só Next.js + Prisma. O backend Python foi aposentado e o proxy
deletado. Todas as rotas são nativas.

**Por quê:** as mesmas tabelas estavam declaradas duas vezes — em
`models.py` (SQLAlchemy) e em `schema.prisma`. Toda alteração de coluna tinha
que ser feita nos dois lados, na ordem certa, e o FastAPI ainda rodava
`aplicar_migracoes()` no boot competindo com as migrations do Prisma. Além
disso, os dois apontavam para **bancos diferentes** (Supabase e Postgres local),
então o dado de um não existia no outro.

Hoje `prisma/schema.prisma` é a única fonte de verdade.

---

## 2. Regra de negócio pura, separada de tudo

`src/server/domain/` não importa Prisma, Next nem HTTP. Recebe dado simples,
devolve dado simples.

Antes, o cálculo de um pedido vivia dentro do handler HTTP, misturado com
acesso ao banco — não dava para testar sem subir a aplicação inteira, e não
dava para ler a regra sem ler SQL junto. Agora `calculateOrder`,
`planOrderStockMovements` e `resolveUnitPrice` são funções puras cobertas por
teste.

---

## 3. Dinheiro deixou de ser `float`

**Antes:** todas as colunas de valor eram `DOUBLE PRECISION` e a conta era feita
em float de JavaScript/Python.

**Agora:** `DECIMAL(12,2)` no banco, `decimal.js` no cálculo, quantidade em
`DECIMAL(12,3)`.

**Por quê:** float binário não representa `0,10`. Somar cem itens de dez
centavos dava `9,999999999999998`. Num sistema que calcula comissão e conta a
receber, esse erro vira divergência de caixa.

Junto veio a troca de arredondamento: o Python usava *banker's rounding*
(`round(2.675, 2)` → `2.67`). Agora é **HALF_UP** (`2.68`), que é o que a
contabilidade e o usuário esperam.

---

## 4. Comissão não incide mais sobre frete

**Antes:** a comissão era rateada por `fator = total / subtotal`. Como o total
inclui frete e outros custos, um pedido de R$ 100 com R$ 900 de frete pagava
comissão como se a venda tivesse sido de R$ 1.000.

**Agora:** a base é `subtotal − desconto`. Frete e outros custos ficam fora.

**Impacto:** valores de comissão mudam para pedidos com frete. É uma mudança
deliberada de regra de negócio — se a intenção da empresa for realmente pagar
comissão sobre entrega, é só alterar `calculateOrder` em
`src/server/domain/orders.ts` (e o teste que fixa esse comportamento).

---

## 5. Baixa de insumo passou a funcionar

**Antes:** `estoque.py` lia `ing.ingredient`, atributo que não existia no modelo
(o certo era `ing.insumo`). Qualquer produto com ficha técnica lançava
`AttributeError` e virava erro 500. Na prática **a baixa de insumo nunca rodou**.

**Agora:** a receita é explodida de verdade. Vender 10 brownies com 0,2 kg de
chocolate cada baixa 2 kg de chocolate, registra a movimentação e atualiza o
saldo. Quando dois itens do mesmo pedido usam o mesmo insumo, os saldos
encadeiam corretamente.

Também mudou: **saída que deixaria o saldo negativo é recusada**. Antes o
estoque ia a negativo em silêncio, mascarando erro de contagem.

---

## 6. Número de pedido por sequence

**Antes:** `SELECT MAX(numero) + 1` sem lock, com a gravação acontecendo só no
commit — janela larga. Duas requisições simultâneas geravam o mesmo número e a
segunda estourava erro 500.

**Agora:** `nextval('pedidos_numero_seq')` como default da coluna. O Postgres
resolve a concorrência.

---

## 7. Financeiro acompanha o pedido

**Antes:** o lançamento era criado uma vez e nunca mais atualizado. Alterar
itens, desconto ou frete de um pedido confirmado recalculava o total do pedido
e deixava a conta a receber com o valor antigo — o financeiro divergia da venda
sem nenhum aviso.

**Agora** (`src/server/services/financial-sync.ts`):

- lançamento **pendente** acompanha o pedido: valor, vencimento e descrição são
  atualizados junto;
- lançamento **já baixado** é intocável — se o pedido muda de valor, a operação
  é recusada com a mensagem pedindo para estornar a baixa antes;
- se o pedido sai do status que gera o lançamento, o pendente é removido.

Foi criado também o **estorno de baixa** (`POST /api/financial/transactions/{id}/reverse`),
que não existia: uma vez baixado, não havia como voltar atrás.

---

## 8. Vendedor só enxerga a própria carteira

**Antes:** as telas "Meus Clientes" e "Meus Pedidos" chamavam a listagem sem
filtro nenhum, e o backend também não filtrava. Todo vendedor via a base
inteira da empresa. Outras rotas (bairros, regiões, WhatsApp do lead, mapa,
atividades) não checavam permissão alguma.

**Agora:** `sellerScope(session)` entra no `where` de cada consulta e
`assertOwnedBySeller` protege a alteração de registro específico. Gestão
continua vendo tudo.

Corrigido junto: o pedido lançado pela tela do vendedor não mandava
`vendedor_id` (a tela assumia que o backend deduzia do token, e ele não
deduzia). Todo pedido de campo ficava sem vendedor — e sem comissão. Agora o
servidor usa o vendedor da sessão e ignora o que vier no corpo.

---

## 9. Prospecção simulada deixou de ser silenciosa

A `GOOGLE_MAPS_API_KEY` configurada era literalmente
`AIzaSyMockKeyForDevelopmentOnlyPrigor2026`. Sem chave válida, o código caía num
gerador de estabelecimentos fictícios e gravava os leads no banco como se
fossem prospecção real.

**Agora:** sem chave, a prospecção **para** com erro explicativo. Para rodar
simulado é preciso ligar `ALLOW_MOCK_PLACES=true` de propósito; nesse caso os
leads vêm marcados com `[SIMULADO]` no nome e com a coluna `simulado`, e a
execução fica registrada como `SUCCESS_SIMULADO`. Em produção a flag é
recusada no boot.

Corrigido junto: o teto **diário** de custo existia na configuração mas nunca
era comparado com nada — só o mensal pausava a API. Agora os dois valem.

---

## 10. Segurança

| Item | Antes | Agora |
|---|---|---|
| Segredo do JWT | Dois valores diferentes entre Next e FastAPI (todas as telas de ERP davam 401); fallback embutido no código | Um valor, validado no boot, mínimo 32 caracteres, sem fallback |
| Verificação do token | Duas implementações independentes (rotas e proxy) | Uma só, em `src/server/auth/session.ts` |
| Senha de admin | `prigor2025` embutida no código e impressa no log | Vem de variável de ambiente; nunca é logada; seed recusa senha curta |
| Custo do bcrypt | 10 | 12, configurável |
| Login | Sem limite de tentativas | Limite por IP na aplicação e no nginx; resposta e tempo iguais para usuário inexistente e senha errada |
| Validação de entrada | 17 rotas liam o corpo cru | Zod em toda entrada |
| Erro | Mensagem interna vazava para o cliente | Formato único; detalhe interno só no log, com `traceId` correlacionando |
| Log | `console.log` com token e dados de cliente | Log estruturado com redação automática de campos sensíveis |

---

## 11. Contrato da API

- **Nomes:** tudo em camelCase inglês, igual ao schema. Antes convivia
  `preco_venda` (ERP) com `salePrice` (CRM), e havia campos que a tela lia mas o
  backend nunca mandava — por exemplo `comissao_pct`, que fazia a comissão por
  produto nunca ser aplicada, e `phone` no cadastro de cliente, que era
  descartado silenciosamente e perdia o telefone digitado.
- **Listagem:** sempre `{ data, page, pageSize, total, totalPages }`. Antes
  algumas rotas devolviam tudo sem limite e outras truncavam em 200 registros em
  silêncio.
- **Erro:** sempre `{ error: { code, message, details? }, detail }`. `detail` é
  alias de compatibilidade.
- **Status:** 201 na criação, 409 em conflito, 422 em validação, 429 em excesso
  de tentativas. Antes tudo era 200 ou 500.

---

## 12. Limitação conhecida do ambiente de escrita

O código foi escrito num ambiente sem acesso ao servidor de binários do Prisma,
então `prisma generate` não pôde rodar lá. Consequências:

- as regras de negócio, os tipos e o lint foram verificados (0 erro, 54 testes);
- a **migration foi aplicada num Postgres real** e conferida coluna a coluna
  contra o `schema.prisma`;
- o que **não** foi executado ali: `prisma generate`, `prisma migrate` e o build
  completo do Next (ele compila e passa no TypeScript, e para na etapa que
  precisa do client do Prisma).

Por isso o primeiro comando a rodar na sua máquina é `npm run setup`, seguido de
`npm run verify`.
