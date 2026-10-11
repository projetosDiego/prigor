-- Favoritos, composicao de produtos (relatorios) e Pix recebidos. Idempotente.
CREATE TABLE IF NOT EXISTS "favoritos" (
  "id" TEXT NOT NULL,
  "tipo" TEXT NOT NULL,
  "ref_id" TEXT NOT NULL,
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "favoritos_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "favoritos_tipo_ref_id_key" ON "favoritos"("tipo", "ref_id");

CREATE TABLE IF NOT EXISTS "produto_componentes" (
  "id" TEXT NOT NULL,
  "produto_id" TEXT NOT NULL,
  "componente_id" TEXT NOT NULL,
  "quantidade" DECIMAL(12,3) NOT NULL,
  CONSTRAINT "produto_componentes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "produto_componentes_produto_id_componente_id_key" ON "produto_componentes"("produto_id", "componente_id");
CREATE INDEX IF NOT EXISTS "produto_componentes_componente_id_idx" ON "produto_componentes"("componente_id");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'produto_componentes_produto_id_fkey') THEN
    ALTER TABLE "produto_componentes" ADD CONSTRAINT "produto_componentes_produto_id_fkey"
      FOREIGN KEY ("produto_id") REFERENCES "produtos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'produto_componentes_componente_id_fkey') THEN
    ALTER TABLE "produto_componentes" ADD CONSTRAINT "produto_componentes_componente_id_fkey"
      FOREIGN KEY ("componente_id") REFERENCES "produtos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "pix_recebidos" (
  "id" TEXT NOT NULL,
  "id_externo" TEXT NOT NULL,
  "valor" DECIMAL(12,2) NOT NULL,
  "recebido_em" TIMESTAMP(3) NOT NULL,
  "pagador_nome" TEXT,
  "pagador_documento" TEXT,
  "descricao" TEXT,
  "origem" TEXT NOT NULL DEFAULT 'extrato',
  "status" TEXT NOT NULL DEFAULT 'novo',
  "lancamento_id" TEXT,
  "conciliado_em" TIMESTAMP(3),
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pix_recebidos_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "pix_recebidos_id_externo_key" ON "pix_recebidos"("id_externo");
CREATE INDEX IF NOT EXISTS "pix_recebidos_status_recebido_em_idx" ON "pix_recebidos"("status", "recebido_em");
