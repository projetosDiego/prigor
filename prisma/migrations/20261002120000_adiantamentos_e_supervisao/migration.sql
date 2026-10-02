-- AlterTable vendedores: adiciona supervisor e porcentagem de comissao de supervisao
ALTER TABLE "vendedores" ADD COLUMN IF NOT EXISTS "supervisor_id" TEXT;
ALTER TABLE "vendedores" ADD COLUMN IF NOT EXISTS "supervisor_comissao_pct" DECIMAL(5,2) NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vendedores_supervisor_id_fkey'
  ) THEN
    ALTER TABLE "vendedores"
      ADD CONSTRAINT "vendedores_supervisor_id_fkey"
      FOREIGN KEY ("supervisor_id") REFERENCES "vendedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "vendedores_supervisor_id_idx" ON "vendedores"("supervisor_id");

-- CreateTable adiantamentos: vales e saidas antecipadas para funcionarios e vendedores
CREATE TABLE IF NOT EXISTS "adiantamentos" (
  "id" TEXT NOT NULL,
  "funcionario_id" TEXT,
  "vendedor_id" TEXT,
  "data" DATE NOT NULL,
  "valor" DECIMAL(12,2) NOT NULL,
  "motivo" TEXT,
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "adiantamentos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "adiantamentos_funcionario_id_idx" ON "adiantamentos"("funcionario_id");
CREATE INDEX IF NOT EXISTS "adiantamentos_vendedor_id_idx" ON "adiantamentos"("vendedor_id");
CREATE INDEX IF NOT EXISTS "adiantamentos_data_idx" ON "adiantamentos"("data");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'adiantamentos_funcionario_id_fkey'
  ) THEN
    ALTER TABLE "adiantamentos"
      ADD CONSTRAINT "adiantamentos_funcionario_id_fkey"
      FOREIGN KEY ("funcionario_id") REFERENCES "funcionarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'adiantamentos_vendedor_id_fkey'
  ) THEN
    ALTER TABLE "adiantamentos"
      ADD CONSTRAINT "adiantamentos_vendedor_id_fkey"
      FOREIGN KEY ("vendedor_id") REFERENCES "vendedores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
