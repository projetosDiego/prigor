-- Clube Prigor: confirmação do celular por SMS e PIN recuperável por SMS. Idempotente.
ALTER TABLE "clube_membros" ADD COLUMN IF NOT EXISTS "celular_verificado_em" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "clube_config" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "exigir_sms" BOOLEAN NOT NULL DEFAULT true,
  "sms_chave" TEXT,
  "sms_limite_diario" INTEGER NOT NULL DEFAULT 300,
  "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "clube_config_pkey" PRIMARY KEY ("id")
);
-- Confirmação por SMS obrigatória por padrão (pode desligar no painel).
INSERT INTO "clube_config" ("id", "exigir_sms") VALUES ('default', true) ON CONFLICT ("id") DO NOTHING;

CREATE TABLE IF NOT EXISTS "clube_codigos_sms" (
  "id" TEXT NOT NULL,
  "celular" TEXT NOT NULL,
  "finalidade" TEXT NOT NULL,
  "codigo_hash" TEXT NOT NULL,
  "tentativas" INTEGER NOT NULL DEFAULT 0,
  "expira_em" TIMESTAMP(3) NOT NULL,
  "usado_em" TIMESTAMP(3),
  "ip" TEXT,
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "clube_codigos_sms_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "clube_codigos_sms_celular_finalidade_criado_em_idx" ON "clube_codigos_sms"("celular", "finalidade", "criado_em");
CREATE INDEX IF NOT EXISTS "clube_codigos_sms_criado_em_idx" ON "clube_codigos_sms"("criado_em");
