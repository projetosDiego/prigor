-- Clube Prigor: fidelização do cliente final dos pontos de revenda. Idempotente.
ALTER TABLE "clientes" ADD COLUMN IF NOT EXISTS "codigo_clube" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "clientes_codigo_clube_key" ON "clientes"("codigo_clube");

CREATE TABLE IF NOT EXISTS "clube_membros" (
  "id" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "celular" TEXT NOT NULL,
  "bairro" TEXT,
  "aceita_whatsapp" BOOLEAN NOT NULL DEFAULT false,
  "aceite_em" TIMESTAMP(3),
  "sessao_hash" TEXT,
  "ponto_cadastro_id" TEXT,
  "whatsapp_confirmado_em" TIMESTAMP(3),
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "clube_membros_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "clube_membros_celular_key" ON "clube_membros"("celular");
CREATE UNIQUE INDEX IF NOT EXISTS "clube_membros_sessao_hash_key" ON "clube_membros"("sessao_hash");
CREATE INDEX IF NOT EXISTS "clube_membros_ponto_cadastro_id_idx" ON "clube_membros"("ponto_cadastro_id");
CREATE INDEX IF NOT EXISTS "clube_membros_criado_em_idx" ON "clube_membros"("criado_em");

CREATE TABLE IF NOT EXISTS "clube_cupons" (
  "id" TEXT NOT NULL,
  "membro_id" TEXT NOT NULL,
  "tipo" TEXT NOT NULL,
  "titulo" TEXT NOT NULL,
  "unidades_bonus" DECIMAL(12,3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'disponivel',
  "usado_em" TIMESTAMP(3),
  "ponto_resgate_id" TEXT,
  "reposto_em" TIMESTAMP(3),
  "pedido_reposicao_id" TEXT,
  "reposto_por" TEXT,
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "clube_cupons_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "clube_cupons_membro_id_tipo_key" ON "clube_cupons"("membro_id", "tipo");
CREATE INDEX IF NOT EXISTS "clube_cupons_status_idx" ON "clube_cupons"("status");
CREATE INDEX IF NOT EXISTS "clube_cupons_ponto_resgate_id_reposto_em_idx" ON "clube_cupons"("ponto_resgate_id", "reposto_em");
CREATE INDEX IF NOT EXISTS "clube_cupons_usado_em_idx" ON "clube_cupons"("usado_em");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clube_membros_ponto_cadastro_id_fkey') THEN
    ALTER TABLE "clube_membros" ADD CONSTRAINT "clube_membros_ponto_cadastro_id_fkey"
      FOREIGN KEY ("ponto_cadastro_id") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clube_cupons_membro_id_fkey') THEN
    ALTER TABLE "clube_cupons" ADD CONSTRAINT "clube_cupons_membro_id_fkey"
      FOREIGN KEY ("membro_id") REFERENCES "clube_membros"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clube_cupons_ponto_resgate_id_fkey') THEN
    ALTER TABLE "clube_cupons" ADD CONSTRAINT "clube_cupons_ponto_resgate_id_fkey"
      FOREIGN KEY ("ponto_resgate_id") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clube_cupons_pedido_reposicao_id_fkey') THEN
    ALTER TABLE "clube_cupons" ADD CONSTRAINT "clube_cupons_pedido_reposicao_id_fkey"
      FOREIGN KEY ("pedido_reposicao_id") REFERENCES "pedidos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
