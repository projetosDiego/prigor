-- Lembretes de cobranca enviados por e-mail (um por boleto e etapa). Idempotente.
CREATE TABLE IF NOT EXISTS "cobranca_lembretes" (
  "id" TEXT NOT NULL,
  "boleto_id" TEXT NOT NULL,
  "etapa" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "enviado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cobranca_lembretes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "cobranca_lembretes_boleto_id_etapa_key" ON "cobranca_lembretes"("boleto_id", "etapa");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cobranca_lembretes_boleto_id_fkey') THEN
    ALTER TABLE "cobranca_lembretes"
      ADD CONSTRAINT "cobranca_lembretes_boleto_id_fkey"
      FOREIGN KEY ("boleto_id") REFERENCES "boletos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
