-- Várias empresas (CNPJs) emitindo NF e boleto. Idempotente.
-- A empresa principal nasce dos dados do emitente já cadastrados em
-- config_fiscal; NF e boletos já emitidos ficam vinculados a ela.

CREATE TABLE IF NOT EXISTS "empresas_emissoras" (
  "id"                 TEXT NOT NULL,
  "nome"               TEXT NOT NULL,
  "razao_social"       TEXT NOT NULL,
  "nome_fantasia"      TEXT,
  "cnpj"               TEXT NOT NULL,
  "inscricao_estadual" TEXT,
  "endereco"           TEXT,
  "numero"             TEXT,
  "complemento"        TEXT,
  "bairro"             TEXT,
  "cidade"             TEXT,
  "codigo_ibge_cidade" TEXT,
  "uf"                 TEXT,
  "cep"                TEXT,
  "telefone"           TEXT,
  "email"              TEXT,
  "prefixo_config"     TEXT NOT NULL DEFAULT '',
  "padrao"             BOOLEAN NOT NULL DEFAULT false,
  "ativa"              BOOLEAN NOT NULL DEFAULT true,
  "limite_anual"       DECIMAL(12,2) NOT NULL DEFAULT 81000,
  "criado_em"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "empresas_emissoras_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "empresas_emissoras_cnpj_key" ON "empresas_emissoras"("cnpj");
CREATE UNIQUE INDEX IF NOT EXISTS "empresas_emissoras_prefixo_config_key" ON "empresas_emissoras"("prefixo_config");

-- Empresa principal a partir do emitente atual (só se a tabela está vazia).
INSERT INTO "empresas_emissoras" (
  "id", "nome", "razao_social", "nome_fantasia", "cnpj", "inscricao_estadual",
  "endereco", "numero", "complemento", "bairro", "cidade", "codigo_ibge_cidade", "uf", "cep",
  "telefone", "email", "prefixo_config", "padrao", "ativa", "atualizado_em"
)
SELECT
  gen_random_uuid()::text, 'Principal', COALESCE(NULLIF(cf."razao_social", ''), 'EMPRESA PRINCIPAL'), cf."nome_fantasia",
  regexp_replace(cf."cnpj", '\D', '', 'g'), cf."inscricao_estadual",
  cf."endereco", cf."numero", cf."complemento", cf."bairro", cf."cidade", cf."codigo_ibge_cidade", cf."uf", cf."cep",
  cf."telefone", cf."email", '', true, true, CURRENT_TIMESTAMP
FROM "config_fiscal" cf
WHERE COALESCE(regexp_replace(cf."cnpj", '\D', '', 'g'), '') <> ''
  AND NOT EXISTS (SELECT 1 FROM "empresas_emissoras")
LIMIT 1;

-- Vínculos.
ALTER TABLE "clientes"      ADD COLUMN IF NOT EXISTS "empresa_padrao_id" TEXT;
ALTER TABLE "pedidos"       ADD COLUMN IF NOT EXISTS "empresa_id" TEXT;
ALTER TABLE "boletos"       ADD COLUMN IF NOT EXISTS "empresa_id" TEXT;
ALTER TABLE "notas_fiscais" ADD COLUMN IF NOT EXISTS "empresa_id" TEXT;

CREATE INDEX IF NOT EXISTS "pedidos_empresa_id_idx" ON "pedidos"("empresa_id");
CREATE INDEX IF NOT EXISTS "boletos_empresa_id_idx" ON "boletos"("empresa_id");
CREATE INDEX IF NOT EXISTS "notas_fiscais_empresa_id_idx" ON "notas_fiscais"("empresa_id");

DO $$ BEGIN
  ALTER TABLE "clientes" ADD CONSTRAINT "clientes_empresa_padrao_id_fkey"
    FOREIGN KEY ("empresa_padrao_id") REFERENCES "empresas_emissoras"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_empresa_id_fkey"
    FOREIGN KEY ("empresa_id") REFERENCES "empresas_emissoras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "boletos" ADD CONSTRAINT "boletos_empresa_id_fkey"
    FOREIGN KEY ("empresa_id") REFERENCES "empresas_emissoras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "notas_fiscais" ADD CONSTRAINT "notas_fiscais_empresa_id_fkey"
    FOREIGN KEY ("empresa_id") REFERENCES "empresas_emissoras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- O que já foi emitido é da empresa principal.
UPDATE "boletos" SET "empresa_id" = (SELECT "id" FROM "empresas_emissoras" WHERE "prefixo_config" = '')
WHERE "empresa_id" IS NULL;
UPDATE "notas_fiscais" SET "empresa_id" = (SELECT "id" FROM "empresas_emissoras" WHERE "prefixo_config" = '')
WHERE "empresa_id" IS NULL;
UPDATE "pedidos" p SET "empresa_id" = (SELECT "id" FROM "empresas_emissoras" WHERE "prefixo_config" = '')
WHERE p."empresa_id" IS NULL
  AND (EXISTS (SELECT 1 FROM "boletos" b WHERE b."pedido_id" = p."id")
    OR EXISTS (SELECT 1 FROM "notas_fiscais" n WHERE n."pedido_id" = p."id"));
