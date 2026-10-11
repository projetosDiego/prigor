import { describe, expect, it } from 'vitest';

import { expandSales, type ComponentLink } from '@/server/domain/composition';

const links = new Map<string, ComponentLink[]>([
  ['display12', [{ componentId: 'b75', quantity: 12 }]],
  ['display20', [{ componentId: 'b75', quantity: 20 }]],
  ['mix', [{ componentId: 'b75', quantity: 6 }, { componentId: 'b55', quantity: 6 }]],
]);

describe('expandSales', () => {
  it('multiplica displays pelo indicador e soma com a venda direta', () => {
    const r = expandSales(
      [
        { productId: 'b75', quantity: 1093 },
        { productId: 'display12', quantity: 82 },
        { productId: 'display20', quantity: 1 },
        { productId: 'b55', quantity: 110 },
      ],
      links,
    );
    expect(r.direct.get('b75')).toBe(1093);
    expect(r.viaKits.get('b75')).toBe(82 * 12 + 20);
    expect(r.direct.get('b55')).toBe(110);
    expect(r.perKit.get('display12')?.get('b75')).toBe(984);
  });

  it('kit misto reparte entre 7x5 e 5x5', () => {
    const r = expandSales([{ productId: 'mix', quantity: 10 }], links);
    expect(r.viaKits.get('b75')).toBe(60);
    expect(r.viaKits.get('b55')).toBe(60);
    expect(r.direct.size).toBe(0);
  });

  it('kit de kit e proteção contra ciclo', () => {
    const l = new Map<string, ComponentLink[]>([
      ['caixa', [{ componentId: 'display12', quantity: 2 }]],
      ['display12', [{ componentId: 'b75', quantity: 12 }]],
      ['a', [{ componentId: 'b', quantity: 1 }]],
      ['b', [{ componentId: 'a', quantity: 1 }]],
    ]);
    const r = expandSales([{ productId: 'caixa', quantity: 3 }, { productId: 'a', quantity: 1 }], l);
    expect(r.viaKits.get('b75')).toBe(72);
    expect(r.perKit.get('caixa')?.get('b75')).toBe(72);
    // ciclo não trava e conta como unidade
    expect([...r.viaKits.keys()]).toContain('a');
  });

  it('ignora quantidades zeradas ou negativas', () => {
    const r = expandSales([{ productId: 'b75', quantity: 0 }, { productId: 'b75', quantity: -2 }], links);
    expect(r.direct.size).toBe(0);
  });
});
