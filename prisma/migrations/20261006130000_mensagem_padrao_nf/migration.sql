-- Mensagem padrão das informações complementares da NF-e (editável por pedido).
ALTER TABLE "config_fiscal" ADD COLUMN IF NOT EXISTS "mensagem_nf" TEXT;
UPDATE "config_fiscal" SET "mensagem_nf" = 'Obrigado pela preferência! Doces Prigor agradece a parceria.' WHERE "mensagem_nf" IS NULL;
