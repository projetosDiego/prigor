-- Meta mensal de faturamento (R$) por vendedor, para o relatório de metas.
ALTER TABLE "vendedores" ADD COLUMN "meta_faturamento" DECIMAL(12,2) NOT NULL DEFAULT 0;
