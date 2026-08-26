import { describe, expect, it } from 'vitest';

import {
  calculateRecipeCost,
  planManualMovement,
  planOrderStockMovements,
  type StockProduct,
} from '@/server/domain/stock';
import { dec } from '@/server/domain/money';

const n = (d: { toNumber(): number }): number => d.toNumber();

function catalog(...products: StockProduct[]): Map<string, StockProduct> {
  return new Map(products.map((p) => [p.id, p]));
}

const brownie: StockProduct = {
  id: 'brownie',
  name: 'Brownie Recheado',
  stock: 100,
  trackStock: true,
  recipe: [
    { ingredientId: 'chocolate', quantity: '0.2' },
    { ingredientId: 'farinha', quantity: '0.15' },
  ],
};

const chocolate: StockProduct = { id: 'chocolate', name: 'Chocolate', stock: 50, trackStock: true };
const farinha: StockProduct = { id: 'farinha', name: 'Farinha', stock: 30, trackStock: true };

describe('planOrderStockMovements — consumo', () => {
  it('baixa o produto acabado', () => {
    const movements = planOrderStockMovements({
      orderNumber: 7,
      items: [{ productId: 'brownie', quantity: 10 }],
      products: catalog({ ...brownie, recipe: [] }),
      direction: 'consume',
    });

    expect(movements).toHaveLength(1);
    expect(movements[0].type).toBe('saida_venda');
    expect(n(movements[0].stockBefore)).toBe(100);
    expect(n(movements[0].stockAfter)).toBe(90);
    expect(movements[0].observation).toContain('#7');
  });

  it('explode a receita e baixa os insumos', () => {
    // Este é o caminho que nunca rodava no backend anterior: a leitura da
    // receita usava um atributo inexistente e estourava AttributeError.
    const movements = planOrderStockMovements({
      orderNumber: 1,
      items: [{ productId: 'brownie', quantity: 10 }],
      products: catalog(brownie, chocolate, farinha),
      direction: 'consume',
    });

    expect(movements).toHaveLength(3);

    const chocolateMove = movements.find((m) => m.productId === 'chocolate');
    expect(chocolateMove?.type).toBe('baixa_insumo');
    expect(n(chocolateMove!.quantity)).toBe(2); // 10 * 0.2
    expect(n(chocolateMove!.stockAfter)).toBe(48);

    const farinhaMove = movements.find((m) => m.productId === 'farinha');
    expect(n(farinhaMove!.quantity)).toBe(1.5); // 10 * 0.15
    expect(n(farinhaMove!.stockAfter)).toBe(28.5);
  });

  it('acumula corretamente quando dois itens usam o mesmo insumo', () => {
    const cookie: StockProduct = {
      id: 'cookie',
      name: 'Cookie',
      stock: 40,
      trackStock: true,
      recipe: [{ ingredientId: 'chocolate', quantity: '0.1' }],
    };

    const movements = planOrderStockMovements({
      orderNumber: 2,
      items: [
        { productId: 'brownie', quantity: 10 },
        { productId: 'cookie', quantity: 20 },
      ],
      products: catalog(brownie, cookie, chocolate, farinha),
      direction: 'consume',
    });

    const chocolateMoves = movements.filter((m) => m.productId === 'chocolate');
    expect(chocolateMoves).toHaveLength(2);
    // 50 - 2 = 48, depois 48 - 2 = 46. O saldo encadeia.
    expect(n(chocolateMoves[0].stockAfter)).toBe(48);
    expect(n(chocolateMoves[1].stockBefore)).toBe(48);
    expect(n(chocolateMoves[1].stockAfter)).toBe(46);
  });

  it('ignora produto que não movimenta estoque', () => {
    const servico: StockProduct = {
      id: 'servico',
      name: 'Taxa de entrega',
      stock: 0,
      trackStock: false,
    };

    const movements = planOrderStockMovements({
      orderNumber: 3,
      items: [{ productId: 'servico', quantity: 1 }],
      products: catalog(servico),
      direction: 'consume',
    });

    expect(movements).toHaveLength(0);
  });

  it('ignora item cujo produto não existe mais no catálogo', () => {
    const movements = planOrderStockMovements({
      orderNumber: 4,
      items: [{ productId: 'fantasma', quantity: 5 }],
      products: catalog(brownie),
      direction: 'consume',
    });

    expect(movements).toHaveLength(0);
  });
});

describe('planOrderStockMovements — estorno', () => {
  it('devolve produto e insumo com os tipos de entrada', () => {
    const movements = planOrderStockMovements({
      orderNumber: 9,
      items: [{ productId: 'brownie', quantity: 10 }],
      products: catalog(brownie, chocolate, farinha),
      direction: 'restore',
    });

    const produto = movements.find((m) => m.productId === 'brownie');
    expect(produto?.type).toBe('entrada_produto');
    expect(n(produto!.stockAfter)).toBe(110);

    const insumo = movements.find((m) => m.productId === 'chocolate');
    expect(insumo?.type).toBe('entrada_recheio');
    expect(n(insumo!.stockAfter)).toBe(52);
  });

  it('consumir e estornar a mesma quantidade devolve ao saldo original', () => {
    const consume = planOrderStockMovements({
      orderNumber: 1,
      items: [{ productId: 'brownie', quantity: 7 }],
      products: catalog(brownie, chocolate, farinha),
      direction: 'consume',
    });

    const afterConsume = catalog(
      ...['brownie', 'chocolate', 'farinha'].map((id) => {
        const base = [brownie, chocolate, farinha].find((p) => p.id === id)!;
        const move = consume.find((m) => m.productId === id);
        return { ...base, stock: move ? move.stockAfter : base.stock };
      }),
    );

    const restore = planOrderStockMovements({
      orderNumber: 1,
      items: [{ productId: 'brownie', quantity: 7 }],
      products: afterConsume,
      direction: 'restore',
    });

    expect(n(restore.find((m) => m.productId === 'brownie')!.stockAfter)).toBe(100);
    expect(n(restore.find((m) => m.productId === 'chocolate')!.stockAfter)).toBe(50);
    expect(n(restore.find((m) => m.productId === 'farinha')!.stockAfter)).toBe(30);
  });
});

describe('planManualMovement', () => {
  it('subtrai nas saídas', () => {
    const move = planManualMovement({
      product: chocolate,
      type: 'baixa_insumo',
      quantity: '3.5',
      observation: 'produção do dia',
    });

    expect(n(move.stockBefore)).toBe(50);
    expect(n(move.stockAfter)).toBe(46.5);
    expect(n(move.quantity)).toBe(3.5);
  });

  it('soma nas entradas', () => {
    const move = planManualMovement({ product: chocolate, type: 'entrada_recheio', quantity: 10 });
    expect(n(move.stockAfter)).toBe(60);
  });

  it('grava a quantidade sempre positiva, com o sinal implícito no tipo', () => {
    const move = planManualMovement({ product: chocolate, type: 'saida_venda', quantity: 5 });
    expect(move.quantity.isPositive()).toBe(true);
  });
});

describe('calculateRecipeCost', () => {
  it('soma custo de insumo vezes quantidade da receita', () => {
    const cost = calculateRecipeCost(
      [
        { ingredientId: 'chocolate', quantity: '0.2' },
        { ingredientId: 'farinha', quantity: '0.15' },
      ],
      new Map<string, string>([
        ['chocolate', '30.00'],
        ['farinha', '8.00'],
      ]),
    );

    // 0.2*30 + 0.15*8 = 6 + 1.2
    expect(n(cost)).toBe(7.2);
  });

  it('ignora insumo sem custo conhecido em vez de somar zero silenciosamente', () => {
    const cost = calculateRecipeCost(
      [
        { ingredientId: 'chocolate', quantity: '1' },
        { ingredientId: 'sumiu', quantity: '1' },
      ],
      new Map<string, string>([['chocolate', '10.00']]),
    );

    expect(n(cost)).toBe(10);
  });

  it('receita vazia custa zero', () => {
    expect(n(calculateRecipeCost([], new Map()))).toBe(0);
  });

  it('mantém precisão decimal', () => {
    const cost = calculateRecipeCost(
      [{ ingredientId: 'x', quantity: '3' }],
      new Map([['x', '0.10']]),
    );
    expect(cost.equals(dec('0.30'))).toBe(true);
  });
});
