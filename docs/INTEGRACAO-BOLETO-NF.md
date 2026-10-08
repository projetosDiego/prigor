# Plano de integração — Boleto (Sicoob) + Nota Fiscal

> Status: **fase 1 entregue** (05/10/2026) · próximas: fase 2 (boleto no sandbox)
> Objetivo: dois caminhos **independentes e manuais** no pedido — **Emitir NF-e** e **Gerar boleto**
> (Pix híbrido) —, acionados só pela gerência. Nada é emitido automaticamente ao mudar o status.
> O que é automático: a **baixa no financeiro** quando o boleto é pago.

---

## 1. Visão geral do fluxo

```
Vendedor lança pedido  ──►  NADA é emitido
                              │
          Gerência abre o pedido e decide, caso a caso:
          ┌───────────────────┴───────────────────┐
   [Emitir NF-e]                            [Gerar boleto]
   provedor fiscal → SEFAZ-RJ               API Sicoob Cobrança v3
   XML + DANFE no pedido                    linha digitável + Pix + PDF
   [Enviar ao cliente] (opcional)           [Enviar ao cliente] (opcional)
                                                   │
                         Cliente paga ─► webhook Sicoob ─► confirma na API
                                                   └─► lançamento "Vendas" = pago
```

- Um pedido pode ter **só NF**, **só boleto**, **os dois** ou **nenhum**.
- Os dois caminhos não dependem um do outro nem do status do pedido (exceto: pedido
  `cancelado` não emite nada).
- **Vendedor nunca emite.** Ele lança o pedido; vê NF/boleto dos próprios pedidos depois
  que a gerência emitiu.

---

## 2. Pré-requisitos (Igor — fora do código)

| # | Item | Por quê |
|---|------|---------|
| P1 | **Conta PJ no Sicoob no CNPJ do MEI** | NF e boleto saindo no mesmo nome; um único certificado serve para tudo |
| P2 | **Convênio de Cobrança Bancária** habilitado pelo gerente + número do cliente/beneficiário, conta e modalidade | Sem convênio a API recusa o registro |
| P3 | **Certificado A1 e-CNPJ** (.pfx + senha) | mTLS no Sicoob e assinatura da NF-e |
| P4 | **App no portal Sicoob** (APIs: Cobrança Bancária v3 + Pix) → **Client ID** | Autenticação OAuth2 |
| P5 | **Inscrição Estadual** e **credenciamento como emissor de NF-e na SEFAZ-RJ** | Venda de produto (brownie) é NF-e modelo 55 |
| P6 | **Contador**: NCM, CFOP (dentro/fora do estado), CSOSN e CRT do MEI para os brownies | Dados fiscais dos produtos |
| P7 | **Escolher o provedor fiscal** (Focus NFe, Nuvem Fiscal, PlugNotas, NFE.io) | Ver §6 |

---

## 3. Arquitetura (segue as invariantes do projeto)

```
src/server/
  domain/
    billing.ts        # puro: quando emitir, montar dados do boleto, transições de status
    invoice.ts        # puro: pedido + cliente + produtos → payload da NF; validações fiscais
  integrations/       # NOVO — único lugar que fala HTTP com terceiros
    sicoob/
      client.ts       # mTLS (undici Agent + pfx), token OAuth2 com cache até expirar
      boletos.ts      # incluir, consultar, alterar vencimento, baixar, segunda via (PDF)
      webhook.ts      # cadastro do webhook na API
    fiscal/
      provider.ts     # interface FiscalProvider (emitir, consultar, cancelar, cartaCorrecao)
      <escolhido>.ts  # adapter do provedor escolhido
  services/
    boletos.ts        # orquestra: transação + idempotência + financeiro
    invoices.ts       # orquestra a NF
    billing-sync.ts   # reconciliação diária (fallback do webhook)
src/app/api/
  orders/[id]/boleto            POST emitir · DELETE baixar/cancelar
  orders/[id]/invoice           POST emitir · DELETE cancelar
  webhooks/sicoob               POST (público, validado)
  webhooks/fiscal               POST (público, validado)
```

Regras:
- **Domínio puro** decide; `integrations/` só transporta; serviço orquestra. Rota não calcula.
- **Dinheiro em `Decimal`** até o adapter; convertido para o formato da API só na borda.
- **Webhook nunca é confiável sozinho:** ao receber, o serviço **consulta o boleto/NF na API**
  e só então atualiza o banco.
- **Idempotência:** `seuNumero` do boleto = `PRG-<numero do pedido>-<sequência>`; reemissão
  gera sequência nova. Evento de webhook é gravado com chave única do provedor.
- Rotas de emissão: só `ADMIN`/`MANAGER` (checagem no guard da rota **e** no serviço).
  Vendedor **vê** boleto/NF dos próprios pedidos (consulta com `sellerScope`), nunca emite.

### Autorização por cliente
Dois campos novos em `Customer`, editáveis só pela gerência:
- `boletoAllowed` (`boleto_liberado`, padrão **false**) — cliente liberado para pagar no boleto.
- `invoiceRequired` (`exige_nf`, padrão **false**) — lembrete de que esse cliente pede nota.

Efeitos:
- Vendedor só consegue escolher forma de pagamento "Boleto…" para cliente com `boletoAllowed`;
  para os demais, as opções de boleto nem aparecem (validação também na API).
- Gerência pode gerar boleto mesmo para cliente não liberado, com confirmação explícita
  ("Cliente não está liberado para boleto. Gerar mesmo assim?") registrada no `AuditLog`.
- `invoiceRequired` só sinaliza: badge "Pede NF" no pedido e entra na fila (§8).

---

## 4. Banco de dados (migration à mão — `migrate deploy`)

```prisma
enum BoletoStatus { pendente_registro registrado pago baixado cancelado erro }
enum InvoiceStatus { processando autorizada rejeitada cancelada erro }

model Boleto {                       // @@map("boletos")
  id, orderId, transactionId?        // FK pedido + lançamento a receber
  seuNumero        String @unique    // idempotência
  nossoNumero      String?
  linhaDigitavel   String?
  codigoBarras     String?
  pixCopiaECola    String?
  value            Decimal(12,2)
  dueDate          Date
  status           BoletoStatus
  paidAt           Date?
  paidValue        Decimal(12,2)?
  pdfPath          String?
  lastError        String?
  raw              Json?             // última resposta da API (auditoria)
  createdAt, updatedAt
}

model Invoice {                      // @@map("notas_fiscais")
  id, orderId
  providerRef      String @unique    // id/referência no provedor fiscal
  number           Int?   series Int?
  accessKey        String? @unique   // chave de 44 dígitos
  status           InvoiceStatus
  xmlPath, danfePath  String?
  rejectionReason  String?
  authorizedAt, canceledAt  DateTime?
  raw              Json?
  createdAt, updatedAt
}

model IntegrationEvent {             // @@map("eventos_integracao")
  id, provider, externalId, type, payload Json, processedAt?, error?
  @@unique([provider, externalId])
}

model FiscalSettings {               // @@map("config_fiscal") — linha única
  cnpj, ie, legalName, tradeName, crt, address...
  nfeSeries Int, nfeEnvironment ('homologacao'|'producao')
  defaultCfopInState, defaultCfopOutState, defaultCsosn
  boletoInstructions String?         // mensagem impressa no boleto
  finePct, interestMonthPct Decimal? // multa e juros do boleto
}
```

Campos já existentes reaproveitados: `Product.ncm/cfop/origin/cest`, `Customer.cnpj/cpf/ie/ieIndicator`,
`Order.dueDate` (vem do `PaymentOption.netDays`), `FinancialTransaction`.

---

## 5. Boleto — regras de negócio

- Emite **somente** pelo botão "Gerar boleto" no pedido (gerência). Status do pedido não dispara nada.
- **Vencimento** = `Order.dueDate`. Valor = `Order.total`.
- **Boleto híbrido** (QR Code Pix) sempre que o convênio permitir.
- **Pedido mudou de valor** com boleto `registrado` → baixa o antigo e emite outro.
  Boleto `pago` é intocável (mesma regra do `financial-sync.ts`: estornar primeiro).
- **Pedido cancelado** → baixa o boleto aberto.
- **Pago** (webhook confirmado ou reconciliação) → lançamento "Vendas" = `pago`,
  `paymentDate` = data do crédito, registra no `AuditLog`/timeline do pedido.
- **Pago com valor diferente** (juros/multa ou parcial) → registra `paidValue` e sinaliza
  no financeiro para conferência; não fecha automaticamente se for menor.
- **Reconciliação diária** (`billing-sync`): consulta todos os `registrado` vencidos ou com
  vencimento próximo, para cobrir webhook perdido.
- PDF do pedido passa a mostrar linha digitável e QR Pix.

## 6. Nota fiscal — regras de negócio

- Emite **somente** pelo botão "Emitir NF-e" no pedido (gerência), com prévia dos dados antes
  de confirmar.
- Integração via **provedor fiscal** (não direto com a SEFAZ): ele assina com o A1,
  transmite, guarda XML por 5 anos e devolve DANFE. Código atrás da interface
  `FiscalProvider` para trocar de provedor sem mexer no resto.
- **Critério de escolha:** API REST com webhook, ambiente de homologação gratuito, NF-e
  modelo 55 para MEI, preço por nota/mês, suporte em português.
- **Validação antes de emitir** (domínio `invoice.ts`, testada): cliente com CNPJ/CPF e
  endereço completo (CEP, cidade, UF, IBGE), indicador de IE; todo item com NCM e CFOP;
  totais batendo. Falta de dado = erro claro na tela, **não** chamada à API.
- Emissão é **assíncrona**: status `processando` → webhook/consulta → `autorizada` ou
  `rejeitada` (motivo exibido no pedido).
- **Cancelamento** só dentro do prazo legal (24h na NF-e); depois disso, botão desabilitado
  com explicação.
- Venda a consumidor PF: opcional para MEI — configurável em `FiscalSettings`.

---

## 7. Configuração e segredos (.env)

```
# Sicoob
SICOOB_ENV="sandbox"                 # sandbox | production
SICOOB_CLIENT_ID=""
SICOOB_CERT_PATH="/run/secrets/certificado.pfx"
SICOOB_CERT_PASSWORD=""
SICOOB_NUMERO_CLIENTE=""
SICOOB_CONTA_CORRENTE=""
SICOOB_MODALIDADE="1"                # confirmar com o gerente
SICOOB_SANDBOX_TOKEN=""              # só no sandbox

# Fiscal
FISCAL_PROVIDER=""                   # focus | nuvemfiscal | plugnotas
FISCAL_API_TOKEN=""
FISCAL_ENV="homologacao"             # homologacao | producao
FISCAL_WEBHOOK_SECRET=""
```

- O `.pfx` **nunca** entra no git nem no banco: fica na VPS, montado no container como
  arquivo somente leitura. `check-env.mjs` passa a validar essas variáveis quando a
  integração estiver ligada.
- Webhooks em `https://docesprigor.com.br/api/webhooks/*` (nginx-proxy já existente).

---

## 8. Fases de entrega

| Fase | Entrega | Depende de |
|------|---------|-----------|
| **F1 — Fundação** | Migration, `FiscalSettings` + tela, campos `boletoAllowed`/`invoiceRequired` no cliente, cliente Sicoob com mTLS/token, interface fiscal, testes de domínio | — (começa no sandbox) |
| **F2 — Caminho do boleto** | Botão "Gerar boleto" (gerência), PDF/linha digitável/Pix, baixa, reemissão, bloqueio de boleto para vendedor em cliente não liberado | F1 · P4 (sandbox) |
| **F3 — Pagamento automático** | Webhook Sicoob + reconciliação diária + baixa no financeiro + timeline | F2 |
| **F4 — Caminho da NF-e** | Botão "Emitir NF-e" com prévia, validações, homologação, DANFE/XML no pedido, cancelamento | F1 · P5 P6 P7 |
| **F5 — Painel de emissão** | Tela "Faturamento" para a gerência: pedidos com filtros *sem NF*, *sem boleto*, *pede NF*, *boleto vencido*; ações em lote opcionais; botão "Enviar ao cliente" (e-mail com DANFE/boleto) | F2 · F4 |
| **F6 — Produção** | Certificado real, `production`, 1º boleto e 1ª NF reais acompanhados, monitoramento | P1 P2 P3 |

Cada fase fecha com `npm run verify` verde e roteiro de teste em `docs/TESTE-LOCAL.md`.

------|---------|-----------|
| **F1 — Fundação** | Migration, `FiscalSettings` + tela, cliente Sicoob com mTLS/token, interface fiscal, testes de domínio | — (começa no sandbox) |
| **F2 — Boleto manual** | Botão "Gerar boleto" no pedido, PDF/linha digitável/Pix, baixa, reemissão | F1 · P4 (sandbox) |
| **F3 — Pagamento automático** | Webhook Sicoob + reconciliação diária + baixa no financeiro + timeline | F2 |
| **F4 — NF-e** | Validações, emissão em homologação, DANFE/XML no pedido, cancelamento | F1 · P5 P6 P7 |
| **F5 — Automação** | Faturar = NF + boleto automáticos; e-mail ao cliente com tudo anexado | F3 · F4 |
| **F6 — Produção** | Certificado real, `production`, 1º boleto e 1ª NF reais acompanhados, monitoramento | P1 P2 P3 |

Cada fase fecha com `npm run verify` verde e roteiro de teste em `docs/TESTE-LOCAL.md`.

---

## 9. Riscos e decisões em aberto

- **Titularidade:** app Sicoob hoje criado em conta PF (Priscilla). Decisão pendente:
  migrar para conta PJ do MEI (recomendado) antes de F6.
- **Modalidade/instruções do boleto** (multa, juros, protesto, desconto): definir com o gerente.
- **Provedor fiscal:** escolher antes de F4.
- **Custo por emissão** (tarifa de boleto no Sicoob + provedor fiscal): levantar e registrar aqui.
- **Validade do A1 (12 meses):** alerta no sistema 30 dias antes de vencer.

---

## 10. Registro de entregas

### Fase 1 — Fundação (05/10/2026)
- **Banco** (`20261005120000_faturamento_boleto_nf`): tabelas `boletos`, `notas_fiscais`,
  `eventos_integracao`, `config_fiscal`; colunas `clientes.boleto_liberado` e `clientes.exige_nf`.
  Na criação da coluna, **clientes que já tinham pedido no boleto entram liberados** (para os
  vendedores não travarem no dia seguinte ao deploy). Migration idempotente, testada num Postgres limpo.
- **Domínio** (`domain/billing.ts`, `domain/invoice.ts`) + testes: regra do boleto liberado,
  `seuNumero`/referência da NF, ciclo de vida do boleto, conferência fiscal antes de emitir.
- **Cliente**: campos "Boleto liberado" e "Pede nota fiscal" no cadastro (só gerência altera;
  valor enviado por vendedor é descartado). Selos na lista de clientes.
- **Pedido**: vendedor e portal só veem/aceitam forma "Boleto…" para cliente liberado (tela e
  servidor). Gerência pode lançar mesmo assim; a exceção vai para a timeline do pedido.
- **Configuração Fiscal** (Admin › Configuração Fiscal): dados do emitente, CFOP/CSOSN/CRT padrão,
  multa/juros do boleto e painel de situação das integrações (sem expor segredo).
- **Integrações**: `integrations/config.ts` (variáveis opcionais, `BILLING_ENABLED`),
  `integrations/http.ts` (HTTPS com mTLS), `integrations/sicoob/client.ts` (token OAuth2 com
  cache, sandbox com token fixo), `integrations/fiscal/provider.ts` (contrato `FiscalProvider`).
- **Correção encontrada no caminho:** `customerUpdateSchema` usava `.partial()`, que no zod 4
  mantém os `.default()` — editar um cliente sem mandar `creditLimit` zerava o limite de crédito.
  Agora usa `partialWithoutDefaults`. **Os outros `.partial()` do projeto (vendedor, usuário,
  forma de pagamento, endereço, equipe) têm o mesmo risco** — revisar numa tarefa à parte.

### Pendências técnicas para a fase 6 (produção)
- Repassar as variáveis `SICOOB_*`, `FISCAL_*` e `BILLING_ENABLED` no `docker-compose.prod.yml`
  e montar o `.pfx` como volume somente leitura no container.
- Conferir no portal Sicoob as URLs de token/API e os escopos usados em `sicoob/client.ts`.


### Aplicativo Sicoob criado (05/10/2026)
- App **PRIGOR-COBRANCA**, conta 37.228-5 (titular: e-CNPJ da Prigor, 64.189.960/0001-24), cooperativa 3236.
- APIs: Cobrança Bancária v3 (`https://api.sicoob.com.br/cobranca-bancaria/v3`) e Pix Recebimentos
  (`https://api.sicoob.com.br/pix/api/v2`). Token: `https://auth.sicoob.com.br/auth/realms/cooperado/protocol/openid-connect/token`
  — conferem com `integrations/sicoob/client.ts`. Secret não é usado (autenticação por certificado).
- Status: **pendente de aprovação no Sicoobnet**. Depois de aprovar: `npm run sicoob:testar` (só pede token, não altera nada).
- Certificado A1 em formato antigo (RC2-40): `npm run cert:setup` gera cópia `-moderno.pfx` (AES-256) e o `certificado-publico.pem`.
- Pendências com o gerente: número do cliente no convênio de cobrança (`SICOOB_NUMERO_CLIENTE`) e modalidade.

### Fase 2 — Caminho do boleto (05/10/2026, aguardando teste real)
- Pedidos (admin) › ícone de banco (Faturamento): **Gerar boleto**, linha digitável e Pix copia e cola
  (copiar), **PDF** (segunda via sob demanda, não guardado), **Atualizar status** (se pago, baixa o
  lançamento a receber do pedido) e **Dar baixa** (cancela no banco). Tentativa com erro pode ser descartada.
- Serviço `services/boletos.ts`; API: `GET/POST /api/orders/[id]/boletos`, `POST /api/boletos/[id]/atualizar`,
  `POST /api/boletos/[id]/baixar`, `GET /api/boletos/[id]/pdf`. Emitir/atualizar/baixar: só gerência.
- Mapeamento Sicoob puro e testado em `integrations/sicoob/boletos.ts` (payload, emissão, situação).
  Itens marcados **CONFERIR** (códigos de emissão/distribuição, Pix no boleto, caminho da baixa,
  campos do histórico de pagamento) são validados no primeiro boleto real.
- Ligar: `SICOOB_ENV="production"`, `SICOOB_NUMERO_CLIENTE`, `SICOOB_MODALIDADE` (gerente) e `BILLING_ENABLED="true"`.
- Roteiro do 1º teste real: cliente com cadastro completo → pedido de valor baixo com vencimento futuro →
  Gerar boleto → conferir PDF/linha digitável → Dar baixa → conferir no Sicoobnet.

### Fase 4 — Caminho da NF-e via Notaas (06/10/2026, aguardando teste em homologação)
- Provedor escolhido: **Notaas** (plano Free, 50 notas/mês; NF-e modelo 55). Emitente, IE (16.100.96-0) e
  certificado A1 cadastrados no painel da Notaas; chave da API gravada com `npm run fiscal:setup`.
- Modal Faturamento do pedido ganhou a seção **Nota fiscal**: Emitir NF-e (confere cadastro do cliente,
  NCM/CFOP dos produtos e CSOSN padrão antes de enviar), Atualizar status, DANFE, XML, Cancelar (até 24h,
  motivo ≥ 15 caracteres) e Descartar tentativa com erro. Notas de homologação aparecem marcadas "(TESTE)".
- Código IBGE do município do cliente é buscado pelo CEP (ViaCEP) na hora da emissão.
- Produtos: campos NCM e CFOP na tela de produtos (antes a tela apagava esses campos ao salvar).
- **Bloqueado por enquanto:** pedido com desconto, frete ou outros custos — validar campos na Notaas em
  homologação antes de liberar. Cliente sem CNPJ só se "Permitir NF para consumidor" estiver ligado.
- Migration `20261006120000_nota_fiscal_id_provedor` (coluna `notas_fiscais.id_provedor`).
- Adapter: `integrations/fiscal/notaas.ts` (payload e leitura de status testados). Webhook da Notaas
  (`nfe.issued/error/cancelled`, assinatura HMAC-SHA256) entra na fase 3.

### ✅ Primeira NF-e autorizada em homologação (06/10/2026)
- Pedido 1115 → NF-e nº 1 série 1, autorizada pela SEFAZ (ambiente de teste).
- Ajustes descobertos no caminho: MEI (CRT 4) + CSOSN 102 exige CFOP 5102/6102 (NT 2024.001);
  destinatário PJ precisa de `indicadorIE` (rejeição 232) → IE agora consultada pelo CNPJ (CNPJ.ws).
- Falta validar em homologação: DANFE, XML, cancelamento; pedido com desconto/frete.
- Para produção: confirmar NCM/CFOP/CSOSN com o contador, "Ativar Produção" no painel da Notaas,
  `FISCAL_ENV=producao` e `BILLING_ENABLED=true`.

### DANFE da Prigor e mensagem da nota (06/10/2026)
- DANFE próprio gerado do XML autorizado (`services/danfe-pdf.ts` + `domain/nfe-xml.ts` + `lib/barcode128.ts`):
  canhoto, logo, quadro DANFE, código de barras Code 128-C (validado contra python-barcode), destinatário,
  faturas/duplicatas, impostos com total em destaque, transportador, produtos (pagina sozinho), dados
  adicionais e marca d'água "SEM VALOR FISCAL" (homologação) / "CANCELADA". Falhou → usa o do provedor;
  `?modelo=provedor` força o da Notaas.
- Mensagem padrão (Configuração Fiscal › "Mensagem padrão na nota", coluna `config_fiscal.mensagem_nf`)
  vai em infCpl junto com o nº do pedido; na emissão dá para trocar a mensagem e incluir observação.
- Correção: o campo de informações complementares da Notaas é `infCpl` (antes era enviado com nome errado).
- Liberados na NF: desconto (por item + rateio do desconto do pedido) e frete (`valorFrete`, modFrete 0).
  Boleto com vencimento gera grupo de cobrança (fatura PED-<nº> + duplicata 001). "Outros custos" segue bloqueado.

## Vários CNPJs (empresas emissoras) — 08/10/2026

- Tabela `empresas_emissoras`: dados do emitente por CNPJ (razão social, IE, endereço, limite anual), `padrao`, `ativa` e `prefixo_config`.
  A migração cria a **principal** a partir de `config_fiscal` e vincula a ela os boletos/NF já emitidos.
- Credenciais **não** ficam no banco. Principal: variáveis de sempre (`SICOOB_*`, `FISCAL_*`).
  Demais: `EMPRESA_<PREFIXO>_<VARIÁVEL>` (ex.: `EMPRESA_PRISCILLA_SICOOB_CLIENT_ID`). Credencial nunca herda da principal;
  só ajustes gerais (`SICOOB_ENV`, `FISCAL_PROVIDER`, `FISCAL_ENV`, `BILLING_ENABLED`, `SICOOB_MODALIDADE`, `SICOOB_BOLETO_PIX`).
  `docker-compose.prod.yml` passa o `.env` inteiro (`env_file`) para o container aceitar esses nomes.
- Gerar o comando da VPS para uma empresa: `npm run empresa:comando-vps` (pergunta senha/chave em modo oculto; arquivo em `../certificado/`).
- Pedido: CNPJ escolhido no faturamento (padrão: o do cliente → empresa padrão). Com NF ou boleto **ativo**, fica travado.
- Cliente: campo "Faturar por (CNPJ padrão)".
- Relatório: Relatórios → **Faturamento por CNPJ** (NF autorizadas/canceladas, boletos emitidos/pagos/em aberto/vencidos,
  faturado no ano × limite com alerta 80%/95%, projeção, planilha CSV para o contador).
  "Faturado no ano" = pedidos não cancelados atribuídos ao CNPJ; pedidos sem nota/boleto aparecem à parte (sem CNPJ).
