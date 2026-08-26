import { describe, expect, it } from 'vitest';

import {
  calculateOrder,
  generatesCommissionPayable,
  generatesReceivable,
  movesStock,
  itemGross,
} from '@/server/domain/orders';

const n = (d: { toNumber(): number }): number => d.toNumber();

describe('calculateOrder — subtotal', () => {
  it('multiplica quantidade por preço e subtrai o desconto do item', () => {
    const result = calculateOrder([
      { productId: 'p1', quantity: 3, unitPrice: '10.00', discountItem: '5.00' },
    ]);

    expect(n(result.items[0].subtotal)).toBe(25);
    expect(n(result.subtotal)).toBe(25);
    expect(n(result.total)).toBe(25);
  });

  it('soma vários itens', () => {
    const result = calculateOrder([
      { productId: 'p1', quantity: 2, unitPrice: '7.50' },
      { productId: 'p2', quantity: 1, unitPrice: '12.30' },
    ]);

    expect(n(result.subtotal)).toBe(27.3);
  });

  it('não deixa o subtotal do item ficar negativo quando o desconto excede o bruto', () => {
    const result = calculateOrder([
      { productId: 'p1', quantity: 1, unitPrice: '10.00', discountItem: '50.00' },
    ]);

    expect(n(result.items[0].subtotal)).toBe(0);
    expect(n(result.total)).toBe(0);
  });

  it('mantém a precisão em centavos que o float quebraria', () => {
    // 0.1 + 0.2 !== 0.3 em float binário.
    const result = calculateOrder([
      { productId: 'p1', quantity: 1, unitPrice: '0.10' },
      { productId: 'p2', quantity: 1, unitPrice: '0.20' },
    ]);

    expect(n(result.subtotal)).toBe(0.3);
  });

  it('arredonda HALF_UP, não banker rounding', () => {
    // 2.675 -> 2.68 (HALF_UP). O Python devolvia 2.67.
    expect(n(itemGross(1, '2.675'))).toBe(2.68);
  });

  it('soma 1000 itens de um centavo sem acumular erro', () => {
    const items = Array.from({ length: 1000 }, (_, i) => ({
      productId: `p${i}`,
      quantity: 1,
      unitPrice: '0.01',
    }));

    expect(n(calculateOrder(items).subtotal)).toBe(10);
  });
});

describe('calculateOrder — total', () => {
  it('aplica desconto do pedido, frete e outros custos nessa ordem', () => {
    const result = calculateOrder(
      [{ productId: 'p1', quantity: 1, unitPrice: '100.00' }],
      { discount: '10.00', shipping: '15.00', otherCosts: '5.00' },
    );

    expect(n(result.total)).toBe(110);
  });

  it('limita o desconto do pedido ao subtotal, sem total negativo', () => {
    const result = calculateOrder(
      [{ productId: 'p1', quantity: 1, unitPrice: '50.00' }],
      { discount: '999.00' },
    );

    expect(n(result.discount)).toBe(50);
    expect(n(result.total)).toBe(0);
  });

  it('trata pedido sem itens', () => {
    const result = calculateOrder([], { shipping: '10.00' });

    expect(n(result.subtotal)).toBe(0);
    expect(n(result.total)).toBe(10);
    expect(n(result.commissionVal)).toBe(0);
  });
});

describe('calculateOrder — comissão', () => {
  it('não calcula comissão quando o pedido não tem vendedor', () => {
    const result = calculateOrder([
      { productId: 'p1', quantity: 1, unitPrice: '100.00', productCommissionPct: '10' },
    ]);

    expect(n(result.commissionVal)).toBe(0);
  });

  it('usa o percentual do vendedor quando o produto não define um', () => {
    const result = calculateOrder(
      [{ productId: 'p1', quantity: 1, unitPrice: '100.00' }],
      { sellerCommissionPct: '5' },
    );

    expect(n(result.commissionVal)).toBe(5);
  });

  it('o percentual do produto tem precedência sobre o do vendedor', () => {
    const result = calculateOrder(
      [{ productId: 'p1', quantity: 1, unitPrice: '100.00', productCommissionPct: '12' }],
      { sellerCommissionPct: '5' },
    );

    expect(n(result.commissionVal)).toBe(12);
  });

  it('percentual zero explícito no produto zera a comissão daquele item', () => {
    const result = calculateOrder(
      [
        { productId: 'p1', quantity: 1, unitPrice: '100.00', productCommissionPct: 0 },
        { productId: 'p2', quantity: 1, unitPrice: '100.00' },
      ],
      { sellerCommissionPct: '10' },
    );

    expect(n(result.commissionVal)).toBe(10);
  });

  it('NÃO paga comissão sobre frete nem outros custos', () => {
    // Regressão da regra antiga: fator = total/subtotal fazia o frete
    // aumentar a comissão.
    const result = calculateOrder(
      [{ productId: 'p1', quantity: 1, unitPrice: '100.00' }],
      { sellerCommissionPct: '10', shipping: '900.00', otherCosts: '100.00' },
    );

    expect(n(result.total)).toBe(1100);
    expect(n(result.commissionVal)).toBe(10);
  });

  it('reduz a comissão proporcionalmente ao desconto do pedido', () => {
    const result = calculateOrder(
      [{ productId: 'p1', quantity: 1, unitPrice: '100.00' }],
      { sellerCommissionPct: '10', discount: '50.00' },
    );

    // Base cai pela metade → comissão cai pela metade.
    expect(n(result.commissionVal)).toBe(5);
  });

  it('nunca devolve comissão negativa', () => {
    const result = calculateOrder(
      [{ productId: 'p1', quantity: 1, unitPrice: '100.00' }],
      { sellerCommissionPct: '10', discount: '100.00' },
    );

    expect(n(result.commissionVal)).toBe(0);
  });
});

describe('transições de status', () => {
  it('define quais status movimentam estoque', () => {
    expect(movesStock('novo')).toBe(false);
    expect(movesStock('cancelado')).toBe(false);
    expect(movesStock('confirmado')).toBe(true);
    expect(movesStock('em_producao')).toBe(true);
    expect(movesStock('entregue')).toBe(true);
    expect(movesStock('faturado')).toBe(true);
  });

  it('define quais status geram conta a receber', () => {
    expect(generatesReceivable('novo')).toBe(false);
    expect(generatesReceivable('em_producao')).toBe(false);
    expect(generatesReceivable('confirmado')).toBe(true);
    expect(generatesReceivable('faturado')).toBe(true);
  });

  it('só gera comissão a pagar quando faturado', () => {
    expect(generatesCommissionPayable('entregue')).toBe(false);
    expect(generatesCommissionPayable('faturado')).toBe(true);
  });
});
