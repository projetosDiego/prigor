-- Tentativas descartadas antes desta versão ficaram como "cancelada" sem nunca terem sido autorizadas.
UPDATE "notas_fiscais" SET "status" = 'descartada' WHERE "status" = 'cancelada' AND "autorizada_em" IS NULL;
