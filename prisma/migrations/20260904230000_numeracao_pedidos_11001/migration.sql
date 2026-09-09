-- Numeração dos pedidos passa a começar em 1101 (pedido do Igor).
-- Pedidos existentes mantêm seus números; o PRÓXIMO pedido criado será 1101.
ALTER SEQUENCE "pedidos_numero_seq" RESTART WITH 1101;
