-- Tentativa de NF rejeitada/com erro descartada pelo usuário (antes virava "cancelada", o que confundia).
ALTER TYPE "InvoiceStatus" ADD VALUE IF NOT EXISTS 'descartada';
