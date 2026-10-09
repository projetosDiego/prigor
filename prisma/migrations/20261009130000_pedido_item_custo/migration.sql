-- Custo unitario do produto no momento do pedido (margem real). Idempotente.
ALTER TABLE "pedido_itens" ADD COLUMN IF NOT EXISTS "custo_unitario" DECIMAL(12,4);
