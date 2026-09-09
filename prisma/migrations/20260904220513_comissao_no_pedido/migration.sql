-- Comissão específica do pedido. NULL = herda o percentual do vendedor.
-- Escrita à mão: o autogerador do Prisma incluía mudanças destrutivas por
-- divergência antiga entre o banco e o schema; aqui aplicamos só a coluna.
ALTER TABLE "pedidos" ADD COLUMN IF NOT EXISTS "comissao_pct" DECIMAL(5,2);
