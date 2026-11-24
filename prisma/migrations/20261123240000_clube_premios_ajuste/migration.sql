-- Clube Prigor: sai o "compre 2 leve 3"; caneta passa a ter estoque de 20 por ponto. Idempotente.
UPDATE "clube_premios" SET "ativo" = false, "peso_sorteio" = 0 WHERE "codigo" = 'compre2leve3';
UPDATE "clube_premios" SET "peso_sorteio" = 450 WHERE "codigo" = 'compre1leve2';
UPDATE "clube_premios" SET "peso_sorteio" = 340 WHERE "codigo" = 'brownie_gratis';
UPDATE "clube_premios"
   SET "peso_sorteio" = 200, "estoque_por_ponto" = 20, "conferir_balcao" = true, "validade_dias" = 15, "custo_pontos" = NULL,
       "descricao" = 'Uma caneta exclusiva da Doces Prigor. Unidades limitadas por ponto.'
 WHERE "codigo" = 'caneta';
UPDATE "clube_premios"
   SET "titulo" = 'Copo Prigor', "descricao" = 'Copo exclusivo da Doces Prigor. Unidades limitadas por ponto.'
 WHERE "codigo" = 'copo_termico';
UPDATE "clube_cupons" SET "titulo" = 'Copo Prigor' WHERE "tipo" = 'copo_termico' AND "status" = 'disponivel';
