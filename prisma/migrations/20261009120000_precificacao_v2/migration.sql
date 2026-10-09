-- Precificacao v2: comissao de revenda e preco praticado por ficha. Idempotente.
ALTER TABLE "precificacao_config" ADD COLUMN IF NOT EXISTS "comissao_revenda_pct" DECIMAL(5,2) NOT NULL DEFAULT 0;
ALTER TABLE "precificacao_fichas" ADD COLUMN IF NOT EXISTS "preco_praticado" DECIMAL(12,2);
