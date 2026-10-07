-- Modulo Precificacao (metodo PrecoFacil). Idempotente.

CREATE TABLE IF NOT EXISTS "precificacao_config" (
  "id" TEXT NOT NULL,
  "kwh_preco" DECIMAL(12,4) NOT NULL DEFAULT 1,
  "botijao_preco" DECIMAL(12,2) NOT NULL DEFAULT 110,
  "botijao_kg" DECIMAL(8,2) NOT NULL DEFAULT 13,
  "dias_uteis_mes" INTEGER NOT NULL DEFAULT 24,
  "horas_dia" DECIMAL(5,2) NOT NULL DEFAULT 8,
  "taxa_ifood_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "taxa_cartao_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "imposto_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "margem_alvo_pct" DECIMAL(5,2) NOT NULL DEFAULT 40,
  "meses_media_receita" INTEGER NOT NULL DEFAULT 3,
  "receita_manual" DECIMAL(14,2),
  "atualizado_em" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "precificacao_config_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "precificacao_custos_fixos" (
  "id" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "valor_mensal" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "ordem" INTEGER NOT NULL DEFAULT 0,
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "precificacao_custos_fixos_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "precificacao_recursos" (
  "id" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "tipo" TEXT NOT NULL,
  "potencia_w" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "gas_kg_hora" DECIMAL(10,4) NOT NULL DEFAULT 0,
  "salario_mensal" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "encargos_pct" DECIMAL(6,2) NOT NULL DEFAULT 0,
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "atualizado_em" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "precificacao_recursos_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "precificacao_recursos_nome_key" ON "precificacao_recursos"("nome");

CREATE TABLE IF NOT EXISTS "precificacao_insumos" (
  "id" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "categoria" TEXT NOT NULL DEFAULT 'materia_prima',
  "unidade" TEXT NOT NULL DEFAULT 'gramas',
  "qtd_compra" DECIMAL(14,4) NOT NULL DEFAULT 1,
  "preco_compra" DECIMAL(14,4) NOT NULL DEFAULT 0,
  "perda_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "preco_atualizado_em" DATE,
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "atualizado_em" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "precificacao_insumos_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "precificacao_insumos_nome_key" ON "precificacao_insumos"("nome");

CREATE TABLE IF NOT EXISTS "precificacao_fichas" (
  "id" TEXT NOT NULL,
  "tipo" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "rendimento" DECIMAL(14,4) NOT NULL DEFAULT 1,
  "unidade_rendimento" TEXT NOT NULL DEFAULT 'unidades',
  "perda_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "markup_pct" DECIMAL(8,2) NOT NULL DEFAULT 100,
  "peso_total_g" DECIMAL(14,3) NOT NULL DEFAULT 0,
  "observacoes" TEXT,
  "produto_id" TEXT,
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "precificacao_fichas_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "precificacao_fichas_tipo_nome_key" ON "precificacao_fichas"("tipo","nome");
CREATE INDEX IF NOT EXISTS "precificacao_fichas_produto_id_idx" ON "precificacao_fichas"("produto_id");

CREATE TABLE IF NOT EXISTS "precificacao_fichas_itens" (
  "id" TEXT NOT NULL,
  "ficha_id" TEXT NOT NULL,
  "ordem" INTEGER NOT NULL DEFAULT 0,
  "insumo_id" TEXT,
  "recurso_id" TEXT,
  "sub_ficha_id" TEXT,
  "quantidade" DECIMAL(14,4) NOT NULL DEFAULT 0,
  CONSTRAINT "precificacao_fichas_itens_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "precificacao_fichas_itens_ficha_id_idx" ON "precificacao_fichas_itens"("ficha_id");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'precificacao_fichas_produto_id_fkey') THEN
    ALTER TABLE "precificacao_fichas" ADD CONSTRAINT "precificacao_fichas_produto_id_fkey"
      FOREIGN KEY ("produto_id") REFERENCES "produtos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'precificacao_fichas_itens_ficha_id_fkey') THEN
    ALTER TABLE "precificacao_fichas_itens" ADD CONSTRAINT "precificacao_fichas_itens_ficha_id_fkey"
      FOREIGN KEY ("ficha_id") REFERENCES "precificacao_fichas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'precificacao_fichas_itens_insumo_id_fkey') THEN
    ALTER TABLE "precificacao_fichas_itens" ADD CONSTRAINT "precificacao_fichas_itens_insumo_id_fkey"
      FOREIGN KEY ("insumo_id") REFERENCES "precificacao_insumos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'precificacao_fichas_itens_recurso_id_fkey') THEN
    ALTER TABLE "precificacao_fichas_itens" ADD CONSTRAINT "precificacao_fichas_itens_recurso_id_fkey"
      FOREIGN KEY ("recurso_id") REFERENCES "precificacao_recursos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'precificacao_fichas_itens_sub_ficha_id_fkey') THEN
    ALTER TABLE "precificacao_fichas_itens" ADD CONSTRAINT "precificacao_fichas_itens_sub_ficha_id_fkey"
      FOREIGN KEY ("sub_ficha_id") REFERENCES "precificacao_fichas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
