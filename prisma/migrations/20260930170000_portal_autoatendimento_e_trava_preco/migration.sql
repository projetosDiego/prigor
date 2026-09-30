-- Código do vendedor para pedidos de autoatendimento
ALTER TABLE "vendedores" ADD COLUMN IF NOT EXISTS "codigo" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "vendedores_codigo_key" ON "vendedores"("codigo");

-- Campos de controle de aprovação e preço negociado no pedido
ALTER TABLE "pedidos" ADD COLUMN IF NOT EXISTS "preco_negociado" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "pedidos" ADD COLUMN IF NOT EXISTS "aprovado_gerencia" BOOLEAN NOT NULL DEFAULT true;
