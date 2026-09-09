-- Limite de credito por cliente.
-- 0 (padrao) significa "sem limite" — o alerta so dispara quando limite > 0.
ALTER TABLE "clientes" ADD COLUMN "limite_credito" DECIMAL(12,2) NOT NULL DEFAULT 0;
