-- Endereços de entrega do cliente + endereço de entrega no pedido.
CREATE TABLE "enderecos_cliente" (
  "id" TEXT NOT NULL,
  "cliente_id" TEXT NOT NULL,
  "apelido" TEXT,
  "endereco" TEXT,
  "numero" TEXT,
  "complemento" TEXT,
  "bairro" TEXT,
  "cidade" TEXT,
  "estado" TEXT,
  "cep" TEXT,
  "padrao" BOOLEAN NOT NULL DEFAULT false,
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "enderecos_cliente_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "enderecos_cliente_cliente_id_idx" ON "enderecos_cliente"("cliente_id");
ALTER TABLE "enderecos_cliente" ADD CONSTRAINT "enderecos_cliente_cliente_id_fkey"
  FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pedidos" ADD COLUMN "endereco_entrega_id" TEXT;
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_endereco_entrega_id_fkey"
  FOREIGN KEY ("endereco_entrega_id") REFERENCES "enderecos_cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;
