import { describe, expect, it } from 'vitest';

import { planProduction, type PlanModel } from '@/server/domain/production';

const model: PlanModel = {
  ingredients: [
    { id: 'choc', name: 'Chocolate', unit: 'gramas', purchaseQty: 1000, purchasePrice: 40, lossPct: 0 },
    { id: 'ovo', name: 'Ovo', unit: 'unidades', purchaseQty: 30, purchasePrice: 18, lossPct: 10 },
  ],
  resources: [{ id: 'forno', name: 'Forno' }],
  sheets: [
    {
      id: 'massa',
      name: 'Massa',
      kind: 'massa',
      yieldQty: 1000,
      yieldUnit: 'gramas',
      lossPct: 0,
      lines: [
        { ingredientId: 'choc', quantity: 400 },
        { ingredientId: 'ovo', quantity: 9 },
        { resourceId: 'forno', quantity: 30 },
      ],
    },
    {
      id: 'brownie',
      name: 'Brownie',
      kind: 'produto',
      yieldQty: 10,
      yieldUnit: 'unidades',
      lossPct: 0,
      lines: [{ subSheetId: 'massa', quantity: 500 }],
    },
  ],
};

describe('planProduction', () => {
  it('desce da venda até insumos e minutos', () => {
    // 20 brownies = 2 lotes = 1000 g de massa = 1 lote de massa.
    const r = planProduction(model, [{ sheetId: 'brownie', units: 20 }]);
    expect(r.products[0]).toMatchObject({ name: 'Brownie', units: 20, batches: 2 });
    expect(r.preparations[0]).toMatchObject({ name: 'Massa', units: 1000, batches: 1 });
    const choc = r.ingredients.find((i) => i.id === 'choc')!;
    expect(choc.quantity).toBeCloseTo(400);
    expect(choc.packages).toBe(1);
    expect(r.resources[0]).toMatchObject({ id: 'forno', minutes: 30 });
  });

  it('aplica a perda do insumo na quantidade e arredonda embalagens para cima', () => {
    const r = planProduction(model, [{ sheetId: 'brownie', units: 20 }]);
    const ovo = r.ingredients.find((i) => i.id === 'ovo')!;
    expect(ovo.quantity).toBeCloseTo(10); // 9 / 0,9
    expect(ovo.packages).toBe(1);
    const r2 = planProduction(model, [{ sheetId: 'brownie', units: 200 }]);
    expect(r2.ingredients.find((i) => i.id === 'ovo')!.packages).toBe(4); // 100 ovos / 30
  });

  it('soma demandas repetidas e ignora quantidade zero', () => {
    const r = planProduction(model, [
      { sheetId: 'brownie', units: 10 },
      { sheetId: 'brownie', units: 10 },
      { sheetId: 'brownie', units: 0 },
    ]);
    expect(r.products[0].units).toBe(20);
  });

  it('não entra em loop com ficha circular', () => {
    const circular: PlanModel = {
      ...model,
      sheets: [
        { id: 'a', name: 'A', kind: 'produto', yieldQty: 1, yieldUnit: 'unidades', lossPct: 0, lines: [{ subSheetId: 'b', quantity: 1 }] },
        { id: 'b', name: 'B', kind: 'massa', yieldQty: 1, yieldUnit: 'unidades', lossPct: 0, lines: [{ subSheetId: 'a', quantity: 1 }] },
      ],
    };
    const r = planProduction(circular, [{ sheetId: 'a', units: 1 }]);
    expect(r.warnings.length).toBeGreaterThan(0);
  });
});
