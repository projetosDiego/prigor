-- Faturamento: boleto (Sicoob) e nota fiscal — fundação (fase 1).
-- Ver docs/INTEGRACAO-BOLETO-NF.md. Idempotente: pode rodar de novo sem erro.

-- ─── Enums ──────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "BoletoStatus" AS ENUM ('pendente_registro','registrado','pago','baixado','cancelado','erro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "InvoiceStatus" AS ENUM ('processando','autorizada','rejeitada','cancelada','erro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Cliente: autorização de boleto e lembrete de NF ────────────────────────
-- Na criação da coluna, quem JÁ comprou no boleto (pedido não cancelado) entra
-- liberado — senão, no dia seguinte ao deploy, nenhum vendedor conseguiria
-- lançar boleto para os clientes que hoje pagam assim. A gerência revoga depois.
-- O backfill roda só uma vez (quando a coluna nasce), para não reliberar
-- quem a gerência bloqueou.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clientes' AND column_name = 'boleto_liberado'
  ) THEN
    ALTER TABLE "clientes" ADD COLUMN "boleto_liberado" BOOLEAN NOT NULL DEFAULT false;
    UPDATE "clientes" SET "boleto_liberado" = true
    WHERE "id" IN (
      SELECT DISTINCT "cliente_id" FROM "pedidos"
      WHERE "status" <> 'cancelado' AND lower("forma_pagamento") LIKE '%boleto%'
    );
  END IF;
END $$;
ALTER TABLE "clientes" ADD COLUMN IF NOT EXISTS "exige_nf" BOOLEAN NOT NULL DEFAULT false;

-- ─── Boletos ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "boletos" (
  "id"              TEXT NOT NULL,
  "pedido_id"       TEXT NOT NULL,
  "lancamento_id"   TEXT,
  "seu_numero"      TEXT NOT NULL,
  "nosso_numero"    TEXT,
  "linha_digitavel" TEXT,
  "codigo_barras"   TEXT,
  "pix_copia_cola"  TEXT,
  "valor"           DECIMAL(12,2) NOT NULL,
  "data_vencimento" DATE NOT NULL,
  "status"          "BoletoStatus" NOT NULL DEFAULT 'pendente_registro',
  "data_pagamento"  DATE,
  "valor_pago"      DECIMAL(12,2),
  "pdf_caminho"     TEXT,
  "ultimo_erro"     TEXT,
  "resposta_api"    JSONB,
  "criado_por_id"   TEXT,
  "criado_em"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "boletos_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "boletos_seu_numero_key" ON "boletos"("seu_numero");
CREATE INDEX IF NOT EXISTS "boletos_pedido_id_idx" ON "boletos"("pedido_id");
CREATE INDEX IF NOT EXISTS "boletos_status_data_vencimento_idx" ON "boletos"("status","data_vencimento");

DO $$ BEGIN
  ALTER TABLE "boletos" ADD CONSTRAINT "boletos_pedido_id_fkey"
    FOREIGN KEY ("pedido_id") REFERENCES "pedidos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "boletos" ADD CONSTRAINT "boletos_lancamento_id_fkey"
    FOREIGN KEY ("lancamento_id") REFERENCES "lancamentos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Notas fiscais ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "notas_fiscais" (
  "id"              TEXT NOT NULL,
  "pedido_id"       TEXT NOT NULL,
  "referencia"      TEXT NOT NULL,
  "numero"          INTEGER,
  "serie"           INTEGER,
  "chave_acesso"    TEXT,
  "status"          "InvoiceStatus" NOT NULL DEFAULT 'processando',
  "xml_caminho"     TEXT,
  "danfe_caminho"   TEXT,
  "motivo_rejeicao" TEXT,
  "autorizada_em"   TIMESTAMP(3),
  "cancelada_em"    TIMESTAMP(3),
  "resposta_api"    JSONB,
  "criado_por_id"   TEXT,
  "criado_em"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notas_fiscais_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "notas_fiscais_referencia_key" ON "notas_fiscais"("referencia");
CREATE UNIQUE INDEX IF NOT EXISTS "notas_fiscais_chave_acesso_key" ON "notas_fiscais"("chave_acesso");
CREATE INDEX IF NOT EXISTS "notas_fiscais_pedido_id_idx" ON "notas_fiscais"("pedido_id");
CREATE INDEX IF NOT EXISTS "notas_fiscais_status_idx" ON "notas_fiscais"("status");

DO $$ BEGIN
  ALTER TABLE "notas_fiscais" ADD CONSTRAINT "notas_fiscais_pedido_id_fkey"
    FOREIGN KEY ("pedido_id") REFERENCES "pedidos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Eventos de integração (webhooks) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS "eventos_integracao" (
  "id"            TEXT NOT NULL,
  "provedor"      TEXT NOT NULL,
  "id_externo"    TEXT NOT NULL,
  "tipo"          TEXT NOT NULL,
  "payload"       JSONB NOT NULL,
  "processado_em" TIMESTAMP(3),
  "erro"          TEXT,
  "criado_em"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "eventos_integracao_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "eventos_integracao_provedor_id_externo_key" ON "eventos_integracao"("provedor","id_externo");
CREATE INDEX IF NOT EXISTS "eventos_integracao_processado_em_idx" ON "eventos_integracao"("processado_em");

-- ─── Configuração fiscal (linha única) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS "config_fiscal" (
  "id"                        TEXT NOT NULL,
  "cnpj"                      TEXT,
  "inscricao_estadual"        TEXT,
  "razao_social"              TEXT,
  "nome_fantasia"             TEXT,
  "crt"                       INTEGER NOT NULL DEFAULT 4,
  "endereco"                  TEXT,
  "numero"                    TEXT,
  "complemento"               TEXT,
  "bairro"                    TEXT,
  "cidade"                    TEXT,
  "codigo_ibge_cidade"        TEXT,
  "uf"                        TEXT,
  "cep"                       TEXT,
  "telefone"                  TEXT,
  "email"                     TEXT,
  "serie_nfe"                 INTEGER NOT NULL DEFAULT 1,
  "ambiente_nfe"              TEXT NOT NULL DEFAULT 'homologacao',
  "cfop_padrao_estadual"      TEXT,
  "cfop_padrao_interestadual" TEXT,
  "csosn_padrao"              TEXT,
  "emitir_nf_consumidor"      BOOLEAN NOT NULL DEFAULT false,
  "instrucoes_boleto"         TEXT,
  "multa_boleto_pct"          DECIMAL(5,2),
  "juros_mes_boleto_pct"      DECIMAL(5,2),
  "atualizado_em"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "config_fiscal_pkey" PRIMARY KEY ("id")
);
