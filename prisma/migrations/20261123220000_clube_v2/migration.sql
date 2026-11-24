-- Clube Prigor v2: prêmios sorteados, estoque por ponto, tarefas, pontos e login por PIN. Idempotente.

-- Membros: PIN e indicação
ALTER TABLE "clube_membros" ADD COLUMN IF NOT EXISTS "pin_hash" TEXT;
ALTER TABLE "clube_membros" ADD COLUMN IF NOT EXISTS "codigo_indicacao" TEXT;
ALTER TABLE "clube_membros" ADD COLUMN IF NOT EXISTS "indicado_por_id" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "clube_membros_codigo_indicacao_key" ON "clube_membros"("codigo_indicacao");
CREATE INDEX IF NOT EXISTS "clube_membros_indicado_por_id_idx" ON "clube_membros"("indicado_por_id");

-- Catálogo de prêmios
CREATE TABLE IF NOT EXISTS "clube_premios" (
  "id" TEXT NOT NULL,
  "codigo" TEXT NOT NULL,
  "titulo" TEXT NOT NULL,
  "descricao" TEXT,
  "unidades_bonus" DECIMAL(12,3) NOT NULL DEFAULT 0,
  "peso_sorteio" INTEGER NOT NULL DEFAULT 0,
  "custo_pontos" INTEGER,
  "estoque_por_ponto" INTEGER,
  "conferir_balcao" BOOLEAN NOT NULL DEFAULT false,
  "validade_dias" INTEGER,
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "ordem" INTEGER NOT NULL DEFAULT 0,
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "clube_premios_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "clube_premios_codigo_key" ON "clube_premios"("codigo");

CREATE TABLE IF NOT EXISTS "clube_estoque_ponto" (
  "id" TEXT NOT NULL,
  "cliente_id" TEXT NOT NULL,
  "premio_id" TEXT NOT NULL,
  "quantidade" INTEGER NOT NULL,
  "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "clube_estoque_ponto_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "clube_estoque_ponto_cliente_id_premio_id_key" ON "clube_estoque_ponto"("cliente_id", "premio_id");

-- Cupons: ligação com o catálogo, reserva de estoque, validade, segunda via
ALTER TABLE "clube_cupons" ADD COLUMN IF NOT EXISTS "premio_id" TEXT;
ALTER TABLE "clube_cupons" ADD COLUMN IF NOT EXISTS "origem" TEXT NOT NULL DEFAULT 'boas_vindas';
ALTER TABLE "clube_cupons" ADD COLUMN IF NOT EXISTS "chave_unica" TEXT;
ALTER TABLE "clube_cupons" ADD COLUMN IF NOT EXISTS "conferir_balcao" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "clube_cupons" ADD COLUMN IF NOT EXISTS "ponto_reservado_id" TEXT;
ALTER TABLE "clube_cupons" ADD COLUMN IF NOT EXISTS "valido_ate" TIMESTAMP(3);
ALTER TABLE "clube_cupons" ADD COLUMN IF NOT EXISTS "segunda_via_de_id" TEXT;
ALTER TABLE "clube_cupons" ADD COLUMN IF NOT EXISTS "observacao" TEXT;
UPDATE "clube_cupons" SET "chave_unica" = 'boas_vindas:' || "membro_id" WHERE "tipo" = 'boas_vindas' AND "chave_unica" IS NULL;
DROP INDEX IF EXISTS "clube_cupons_membro_id_tipo_key";
CREATE UNIQUE INDEX IF NOT EXISTS "clube_cupons_chave_unica_key" ON "clube_cupons"("chave_unica");
CREATE INDEX IF NOT EXISTS "clube_cupons_membro_id_idx" ON "clube_cupons"("membro_id");
CREATE INDEX IF NOT EXISTS "clube_cupons_premio_id_ponto_reservado_id_idx" ON "clube_cupons"("premio_id", "ponto_reservado_id");

-- Tarefas
CREATE TABLE IF NOT EXISTS "clube_tarefas" (
  "id" TEXT NOT NULL,
  "codigo" TEXT NOT NULL,
  "titulo" TEXT NOT NULL,
  "descricao" TEXT,
  "pontos" INTEGER NOT NULL,
  "link" TEXT,
  "texto_botao" TEXT,
  "comprovacao" TEXT NOT NULL DEFAULT 'print',
  "intervalo_dias" INTEGER,
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "ordem" INTEGER NOT NULL DEFAULT 0,
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "clube_tarefas_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "clube_tarefas_codigo_key" ON "clube_tarefas"("codigo");

CREATE TABLE IF NOT EXISTS "clube_envios" (
  "id" TEXT NOT NULL,
  "membro_id" TEXT NOT NULL,
  "tarefa_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pendente',
  "imagem" BYTEA,
  "imagem_tipo" TEXT,
  "observacao_cliente" TEXT,
  "observacao_analise" TEXT,
  "pontos" INTEGER NOT NULL DEFAULT 0,
  "analisado_em" TIMESTAMP(3),
  "analisado_por" TEXT,
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "clube_envios_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "clube_envios_status_criado_em_idx" ON "clube_envios"("status", "criado_em");
CREATE INDEX IF NOT EXISTS "clube_envios_membro_id_tarefa_id_idx" ON "clube_envios"("membro_id", "tarefa_id");

CREATE TABLE IF NOT EXISTS "clube_pontos" (
  "id" TEXT NOT NULL,
  "membro_id" TEXT NOT NULL,
  "pontos" INTEGER NOT NULL,
  "motivo" TEXT NOT NULL,
  "descricao" TEXT,
  "envio_id" TEXT,
  "cupom_id" TEXT,
  "indicado_id" TEXT,
  "criado_por" TEXT,
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "clube_pontos_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "clube_pontos_envio_id_key" ON "clube_pontos"("envio_id");
CREATE UNIQUE INDEX IF NOT EXISTS "clube_pontos_indicado_id_key" ON "clube_pontos"("indicado_id");
CREATE INDEX IF NOT EXISTS "clube_pontos_membro_id_criado_em_idx" ON "clube_pontos"("membro_id", "criado_em");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clube_membros_indicado_por_id_fkey') THEN
    ALTER TABLE "clube_membros" ADD CONSTRAINT "clube_membros_indicado_por_id_fkey"
      FOREIGN KEY ("indicado_por_id") REFERENCES "clube_membros"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clube_estoque_ponto_cliente_id_fkey') THEN
    ALTER TABLE "clube_estoque_ponto" ADD CONSTRAINT "clube_estoque_ponto_cliente_id_fkey"
      FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clube_estoque_ponto_premio_id_fkey') THEN
    ALTER TABLE "clube_estoque_ponto" ADD CONSTRAINT "clube_estoque_ponto_premio_id_fkey"
      FOREIGN KEY ("premio_id") REFERENCES "clube_premios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clube_cupons_premio_id_fkey') THEN
    ALTER TABLE "clube_cupons" ADD CONSTRAINT "clube_cupons_premio_id_fkey"
      FOREIGN KEY ("premio_id") REFERENCES "clube_premios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clube_cupons_ponto_reservado_id_fkey') THEN
    ALTER TABLE "clube_cupons" ADD CONSTRAINT "clube_cupons_ponto_reservado_id_fkey"
      FOREIGN KEY ("ponto_reservado_id") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clube_envios_membro_id_fkey') THEN
    ALTER TABLE "clube_envios" ADD CONSTRAINT "clube_envios_membro_id_fkey"
      FOREIGN KEY ("membro_id") REFERENCES "clube_membros"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clube_envios_tarefa_id_fkey') THEN
    ALTER TABLE "clube_envios" ADD CONSTRAINT "clube_envios_tarefa_id_fkey"
      FOREIGN KEY ("tarefa_id") REFERENCES "clube_tarefas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clube_pontos_membro_id_fkey') THEN
    ALTER TABLE "clube_pontos" ADD CONSTRAINT "clube_pontos_membro_id_fkey"
      FOREIGN KEY ("membro_id") REFERENCES "clube_membros"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clube_pontos_envio_id_fkey') THEN
    ALTER TABLE "clube_pontos" ADD CONSTRAINT "clube_pontos_envio_id_fkey"
      FOREIGN KEY ("envio_id") REFERENCES "clube_envios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clube_pontos_cupom_id_fkey') THEN
    ALTER TABLE "clube_pontos" ADD CONSTRAINT "clube_pontos_cupom_id_fkey"
      FOREIGN KEY ("cupom_id") REFERENCES "clube_cupons"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Prêmios padrão (pesos somam 1000 → 0,1% por ponto de peso). Editáveis no painel.
INSERT INTO "clube_premios" ("id","codigo","titulo","descricao","unidades_bonus","peso_sorteio","custo_pontos","estoque_por_ponto","conferir_balcao","validade_dias","ordem") VALUES
  (gen_random_uuid()::text,'compre1leve2','Compre 1 brownie e leve 2','Na compra de 1 brownie, o segundo é presente.',1,350,NULL,NULL,false,NULL,1),
  (gen_random_uuid()::text,'compre2leve3','Compre 2 brownies e leve 3','Na compra de 2 brownies, o terceiro é presente.',1,250,NULL,NULL,false,NULL,2),
  (gen_random_uuid()::text,'brownie_gratis','1 brownie de presente','Retire 1 brownie grátis no ponto.',1,240,100,NULL,false,NULL,3),
  (gen_random_uuid()::text,'caneta','Caneta Doces Prigor','Uma caneta exclusiva da Doces Prigor.',0,150,NULL,NULL,true,NULL,4),
  (gen_random_uuid()::text,'bolsa_termica','Bolsa térmica Doces Prigor','Bolsa térmica exclusiva. Unidades limitadas por ponto.',0,5,NULL,10,true,15,5),
  (gen_random_uuid()::text,'copo_termico','Copo térmico Doces Prigor','Copo térmico exclusivo. Unidades limitadas por ponto.',0,5,NULL,10,true,15,6)
ON CONFLICT ("codigo") DO NOTHING;

UPDATE "clube_cupons" c SET "premio_id" = p."id" FROM "clube_premios" p
  WHERE c."premio_id" IS NULL AND c."tipo" = 'boas_vindas' AND p."codigo" = 'compre1leve2';

INSERT INTO "clube_tarefas" ("id","codigo","titulo","descricao","pontos","link","texto_botao","comprovacao","intervalo_dias","ordem") VALUES
  (gen_random_uuid()::text,'indicar','Indique um amigo','Seu amigo se cadastra pelo seu link e ganha um cupom. Quando ele usar o cupom num ponto Prigor, você ganha os pontos.',50,NULL,NULL,'indicacao',NULL,1),
  (gen_random_uuid()::text,'avaliar_google','Avalie a Doces Prigor no Google','Conte como foi a sua experiência. Vale a sua opinião sincera, qualquer nota.',50,'https://g.page/r/CZcqBBYM3EAYEAE/review','Avaliar no Google','print',NULL,2),
  (gen_random_uuid()::text,'post_instagram','Poste uma foto com seu brownie','Publique no feed ou stories marcando @docesprigor e mande o print.',40,'https://www.instagram.com/docesprigor/','Abrir o Instagram','print',7,3),
  (gen_random_uuid()::text,'seguir_instagram','Siga a @docesprigor no Instagram','Siga nosso perfil e mande o print.',20,'https://www.instagram.com/docesprigor/','Abrir o Instagram','print',NULL,4),
  (gen_random_uuid()::text,'comentar_post','Comente numa publicação nossa','Comente em qualquer post recente da @docesprigor e mande o print.',10,'https://www.instagram.com/docesprigor/','Abrir o Instagram','print',7,5)
ON CONFLICT ("codigo") DO NOTHING;
