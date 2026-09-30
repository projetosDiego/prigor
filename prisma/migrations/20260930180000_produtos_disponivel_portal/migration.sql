-- Adicionar flag para produtos disponiveis no portal de autoatendimento
ALTER TABLE "produtos" ADD COLUMN IF NOT EXISTS "disponivel_portal" BOOLEAN NOT NULL DEFAULT false;
