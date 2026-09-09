-- Modulo Custos & Equipe: funcionarios (diarista/mensalista/motoboy) e faltas.

CREATE TABLE "funcionarios" (
  "id" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "funcao" TEXT,
  "tipo_pagamento" TEXT NOT NULL,
  "valor_diaria" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "salario_mensal" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "passagem_dia" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "dias_semana" TEXT NOT NULL DEFAULT '',
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "funcionarios_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "funcionarios_ativo_idx" ON "funcionarios"("ativo");

CREATE TABLE "faltas_funcionarios" (
  "id" TEXT NOT NULL,
  "funcionario_id" TEXT NOT NULL,
  "data" DATE NOT NULL,
  "observacao" TEXT,
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "faltas_funcionarios_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "faltas_funcionarios_funcionario_id_data_key" ON "faltas_funcionarios"("funcionario_id","data");
CREATE INDEX "faltas_funcionarios_funcionario_id_idx" ON "faltas_funcionarios"("funcionario_id");

ALTER TABLE "faltas_funcionarios"
  ADD CONSTRAINT "faltas_funcionarios_funcionario_id_fkey"
  FOREIGN KEY ("funcionario_id") REFERENCES "funcionarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
