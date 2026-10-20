-- Caixa: contas, fornecedores, compras, despesas recorrentes. Idempotente.
CREATE TABLE IF NOT EXISTS "contas_financeiras" (
  "id" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "tipo" TEXT NOT NULL DEFAULT 'banco',
  "saldo_inicial" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "data_saldo" DATE NOT NULL DEFAULT CURRENT_DATE,
  "padrao" BOOLEAN NOT NULL DEFAULT false,
  "ativa" BOOLEAN NOT NULL DEFAULT true,
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "contas_financeiras_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "fornecedores" (
  "id" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "documento" TEXT,
  "telefone" TEXT,
  "observacoes" TEXT,
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fornecedores_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "compras" (
  "id" TEXT NOT NULL,
  "fornecedor_id" TEXT,
  "conta_id" TEXT,
  "data" DATE NOT NULL,
  "documento" TEXT,
  "categoria" TEXT NOT NULL DEFAULT 'Ingredientes',
  "total" DECIMAL(14,2) NOT NULL,
  "parcelas" INTEGER NOT NULL DEFAULT 1,
  "observacoes" TEXT,
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "compras_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "compras_data_idx" ON "compras"("data");
CREATE INDEX IF NOT EXISTS "compras_fornecedor_id_idx" ON "compras"("fornecedor_id");

CREATE TABLE IF NOT EXISTS "compra_itens" (
  "id" TEXT NOT NULL,
  "compra_id" TEXT NOT NULL,
  "descricao" TEXT NOT NULL,
  "quantidade" DECIMAL(14,3) NOT NULL,
  "unidade" TEXT,
  "preco_unitario" DECIMAL(14,4) NOT NULL,
  "total" DECIMAL(14,2) NOT NULL,
  CONSTRAINT "compra_itens_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "compra_itens_compra_id_idx" ON "compra_itens"("compra_id");

CREATE TABLE IF NOT EXISTS "despesas_recorrentes" (
  "id" TEXT NOT NULL,
  "descricao" TEXT NOT NULL,
  "categoria" TEXT NOT NULL,
  "valor" DECIMAL(12,2) NOT NULL,
  "dia_vencimento" INTEGER NOT NULL,
  "fornecedor_id" TEXT,
  "conta_id" TEXT,
  "ativa" BOOLEAN NOT NULL DEFAULT true,
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "despesas_recorrentes_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "lancamentos" ADD COLUMN IF NOT EXISTS "conta_id" TEXT;
ALTER TABLE "lancamentos" ADD COLUMN IF NOT EXISTS "fornecedor_id" TEXT;
ALTER TABLE "lancamentos" ADD COLUMN IF NOT EXISTS "compra_id" TEXT;
ALTER TABLE "lancamentos" ADD COLUMN IF NOT EXISTS "recorrente_id" TEXT;
ALTER TABLE "lancamentos" ADD COLUMN IF NOT EXISTS "competencia" TEXT;
ALTER TABLE "lancamentos" ADD COLUMN IF NOT EXISTS "parcela" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "lancamentos_recorrente_id_competencia_key" ON "lancamentos"("recorrente_id", "competencia");
CREATE INDEX IF NOT EXISTS "lancamentos_conta_id_idx" ON "lancamentos"("conta_id");
CREATE INDEX IF NOT EXISTS "lancamentos_compra_id_idx" ON "lancamentos"("compra_id");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'compras_fornecedor_id_fkey') THEN
    ALTER TABLE "compras" ADD CONSTRAINT "compras_fornecedor_id_fkey" FOREIGN KEY ("fornecedor_id") REFERENCES "fornecedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'compras_conta_id_fkey') THEN
    ALTER TABLE "compras" ADD CONSTRAINT "compras_conta_id_fkey" FOREIGN KEY ("conta_id") REFERENCES "contas_financeiras"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'compra_itens_compra_id_fkey') THEN
    ALTER TABLE "compra_itens" ADD CONSTRAINT "compra_itens_compra_id_fkey" FOREIGN KEY ("compra_id") REFERENCES "compras"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'despesas_recorrentes_fornecedor_id_fkey') THEN
    ALTER TABLE "despesas_recorrentes" ADD CONSTRAINT "despesas_recorrentes_fornecedor_id_fkey" FOREIGN KEY ("fornecedor_id") REFERENCES "fornecedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'despesas_recorrentes_conta_id_fkey') THEN
    ALTER TABLE "despesas_recorrentes" ADD CONSTRAINT "despesas_recorrentes_conta_id_fkey" FOREIGN KEY ("conta_id") REFERENCES "contas_financeiras"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lancamentos_conta_id_fkey') THEN
    ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_conta_id_fkey" FOREIGN KEY ("conta_id") REFERENCES "contas_financeiras"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lancamentos_fornecedor_id_fkey') THEN
    ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_fornecedor_id_fkey" FOREIGN KEY ("fornecedor_id") REFERENCES "fornecedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lancamentos_compra_id_fkey') THEN
    ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_compra_id_fkey" FOREIGN KEY ("compra_id") REFERENCES "compras"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lancamentos_recorrente_id_fkey') THEN
    ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_recorrente_id_fkey" FOREIGN KEY ("recorrente_id") REFERENCES "despesas_recorrentes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
