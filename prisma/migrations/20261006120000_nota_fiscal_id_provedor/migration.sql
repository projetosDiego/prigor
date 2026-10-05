-- Id da nota no provedor fiscal (Notaas devolve o próprio invoiceId).
ALTER TABLE "notas_fiscais" ADD COLUMN IF NOT EXISTS "id_provedor" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "notas_fiscais_id_provedor_key" ON "notas_fiscais"("id_provedor");
