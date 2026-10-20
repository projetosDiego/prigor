-- Credito do cliente e trocas/devolucoes parciais. Idempotente.
CREATE TABLE IF NOT EXISTS "creditos_cliente" (
  "id" TEXT NOT NULL,
  "cliente_id" TEXT NOT NULL,
  "valor_original" DECIMAL(12,2) NOT NULL,
  "saldo" DECIMAL(12,2) NOT NULL,
  "origem" TEXT NOT NULL,
  "observacao" TEXT,
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "creditos_cliente_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "creditos_cliente_cliente_id_idx" ON "creditos_cliente"("cliente_id");

CREATE TABLE IF NOT EXISTS "pedido_devolucoes" (
  "id" TEXT NOT NULL,
  "pedido_id" TEXT NOT NULL,
  "cliente_id" TEXT NOT NULL,
  "item_id" TEXT,
  "produto_id" TEXT NOT NULL,
  "produto_base_id" TEXT,
  "tipo" TEXT NOT NULL,
  "unidades" DECIMAL(12,3) NOT NULL,
  "qtd_item" DECIMAL(12,4) NOT NULL,
  "valor" DECIMAL(12,2) NOT NULL,
  "custo" DECIMAL(12,2) NOT NULL,
  "motivo" TEXT,
  "credito_id" TEXT,
  "criado_por" TEXT,
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pedido_devolucoes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "pedido_devolucoes_pedido_id_idx" ON "pedido_devolucoes"("pedido_id");
CREATE INDEX IF NOT EXISTS "pedido_devolucoes_cliente_id_idx" ON "pedido_devolucoes"("cliente_id");
CREATE INDEX IF NOT EXISTS "pedido_devolucoes_criado_em_idx" ON "pedido_devolucoes"("criado_em");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'creditos_cliente_cliente_id_fkey') THEN
    ALTER TABLE "creditos_cliente" ADD CONSTRAINT "creditos_cliente_cliente_id_fkey"
      FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pedido_devolucoes_pedido_id_fkey') THEN
    ALTER TABLE "pedido_devolucoes" ADD CONSTRAINT "pedido_devolucoes_pedido_id_fkey"
      FOREIGN KEY ("pedido_id") REFERENCES "pedidos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pedido_devolucoes_cliente_id_fkey') THEN
    ALTER TABLE "pedido_devolucoes" ADD CONSTRAINT "pedido_devolucoes_cliente_id_fkey"
      FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pedido_devolucoes_credito_id_fkey') THEN
    ALTER TABLE "pedido_devolucoes" ADD CONSTRAINT "pedido_devolucoes_credito_id_fkey"
      FOREIGN KEY ("credito_id") REFERENCES "creditos_cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
