import { describe, expect, it } from 'vitest';

import { resolveUnitPrice } from '@/server/domain/pricing';
import { formatBRL, money, percentOf, sumMoney, toNumber } from '@/server/domain/money';

const n = (d: { toNumber(): number }): number => d.toNumber();

const produto = {
  salePrice: '20.00',
  wholesalePrice: '15.00',
  minWholesaleQty: '10',
};

describe('resolveUnitPrice', () => {
  it('usa preço de atacado para cliente revendedor', () => {
    expect(n(resolveUnitPrice(produto, 1, { isReseller: true }))).toBe(15);
  });

  it('usa preço de venda para cliente comum abaixo da quantidade mínima', () => {
    expect(n(resolveUnitPrice(produto, 5, { isReseller: false }))).toBe(20);
  });

  it('usa preço de atacado quando a quantidade atinge o mínimo', () => {
    expect(n(resolveUnitPrice(produto, 10, { isReseller: false }))).toBe(15);
  });

  it('usa preço de venda quando não há preço de atacado configurado', () => {
    const semAtacado = { salePrice: '20.00', wholesalePrice: '0', minWholesaleQty: '10' };
    expect(n(resolveUnitPrice(semAtacado, 100, { isReseller: true }))).toBe(20);
  });

  it('ignora a quantidade mínima quando ela é zero', () => {
    const semMinimo = { salePrice: '20.00', wholesalePrice: '15.00', minWholesaleQty: '0' };
    expect(n(resolveUnitPrice(semMinimo, 999, { isReseller: false }))).toBe(20);
  });

  it('trata pedido sem cliente informado', () => {
    expect(n(resolveUnitPrice(produto, 1, null))).toBe(20);
  });
});

describe('money', () => {
  it('arredonda para 2 casas com HALF_UP', () => {
    expect(n(money('1.005'))).toBe(1.01);
    expect(n(money('1.004'))).toBe(1);
    expect(n(money('2.675'))).toBe(2.68);
  });

  it('trata nulo, vazio e lixo como zero em vez de NaN', () => {
    expect(n(money(null))).toBe(0);
    expect(n(money(undefined))).toBe(0);
    expect(n(money(''))).toBe(0);
    expect(n(money('abc'))).toBe(0);
  });

  it('percentOf calcula percentual sobre valor', () => {
    expect(n(percentOf('200.00', '7.5'))).toBe(15);
  });

  it('sumMoney não acumula erro de float', () => {
    const centavos = Array.from({ length: 3 }, () => '0.10');
    expect(n(sumMoney(centavos))).toBe(0.3);
  });

  it('toNumber devolve number para transporte na API', () => {
    expect(toNumber('12.34')).toBe(12.34);
  });

  it('formatBRL formata em real', () => {
    expect(formatBRL('1234.5')).toContain('1.234,50');
  });
});
