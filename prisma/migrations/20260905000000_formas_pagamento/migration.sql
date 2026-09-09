-- Formas de pagamento configuráveis pelo admin.
CREATE TABLE "formas_pagamento" (
  "id" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "ordem" INTEGER NOT NULL DEFAULT 0,
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "formas_pagamento_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "formas_pagamento_nome_key" ON "formas_pagamento"("nome");

-- Semeia com as formas que já existiam no sistema.
INSERT INTO "formas_pagamento" ("id","nome","ordem") VALUES
  (gen_random_uuid()::text,'Dinheiro',1),
  (gen_random_uuid()::text,'Pix',2),
  (gen_random_uuid()::text,'Cartão de Débito',3),
  (gen_random_uuid()::text,'Cartão de Crédito',4),
  (gen_random_uuid()::text,'Boleto',5),
  (gen_random_uuid()::text,'Transferência',6);

-- O pedido passa a guardar a forma de pagamento como texto (nome da forma),
-- para aceitar formas novas criadas pelo admin.
ALTER TABLE "pedidos" ALTER COLUMN "forma_pagamento" DROP DEFAULT;
ALTER TABLE "pedidos" ALTER COLUMN "forma_pagamento" TYPE TEXT USING "forma_pagamento"::text;
ALTER TABLE "pedidos" ALTER COLUMN "forma_pagamento" SET DEFAULT 'Pix';
