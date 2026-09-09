-- Prazo (dias) na forma de pagamento — vencimento automatico a partir da previsao de entrega.
ALTER TABLE "formas_pagamento" ADD COLUMN "prazo_dias" INTEGER;

-- Opcoes de boleto com prazo (nao recria se ja existir pelo nome unico).
INSERT INTO "formas_pagamento" ("id","nome","ativo","ordem","prazo_dias","criado_em","atualizado_em")
VALUES
  (gen_random_uuid(),'Boleto 7 dias',  true, 50,  7, now(), now()),
  (gen_random_uuid(),'Boleto 15 dias', true, 51, 15, now(), now())
ON CONFLICT ("nome") DO NOTHING;
