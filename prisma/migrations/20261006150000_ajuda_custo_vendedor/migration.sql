-- AlterTable vendedores: ajuda de custo mensal fixa (R$)
ALTER TABLE "vendedores" ADD COLUMN IF NOT EXISTS "ajuda_custo" DECIMAL(12,2) NOT NULL DEFAULT 0;
