import { describe, expect, it } from 'vitest';

import {
  averageRevenue,
  computePricing,
  fixedRatePct,
  ingredientUnitCost,
  markupForTargetMargin,
  resourceUnitCost,
  suggestedPrice,
  type PricingSettingsInput,
  type SheetInput,
} from '@/server/domain/precificacao';

import planilha from '../fixtures/precificacao-planilha.json';
import esperado from '../fixtures/precificacao-planilha-esperado.json';

const settings: PricingSettingsInput = {
  energyKwhPrice: 1.09,
  gasCylinderPrice: 110,
  gasCylinderKg: 13,
  workDaysPerMonth: 24,
  hoursPerDay: 8,
  ifoodFeePct: 15.5,
  cardFeePct: 3.38,
  taxPct: 4,
  targetMarginPct: 40,
};

describe('custos unitários', () => {
  it('insumo: preço ÷ volume ÷ (1 − perda)', () => {
    expect(ingredientUnitCost({ purchaseQty: 1000, purchasePrice: 10, lossPct: 0 })).toBeCloseTo(0.01, 8);
    expect(ingredientUnitCost({ purchaseQty: 1000, purchasePrice: 10, lossPct: 20 })).toBeCloseTo(0.0125, 8);
  });

  it('insumo com volume zero não explode', () => {
    expect(ingredientUnitCost({ purchaseQty: 0, purchasePrice: 10, lossPct: 0 })).toBe(0);
  });

  it('equipamento elétrico: kW × R$/kWh ÷ 60', () => {
    const forno = { id: 'f', name: 'Forno', kind: 'eletrico' as const, watts: 2500, gasKgPerHour: 0, monthlySalary: 0, chargesPct: 0 };
    expect(resourceUnitCost(forno, settings)).toBeCloseTo(0.0454167, 6);
  });

  it('equipamento a gás: R$/kg × kg/h ÷ 60', () => {
    const fogao = { id: 'g', name: 'Fogão', kind: 'gas' as const, watts: 0, gasKgPerHour: 0.2, monthlySalary: 0, chargesPct: 0 };
    expect(resourceUnitCost(fogao, settings)).toBeCloseTo(((110 / 13) * 0.2) / 60, 8);
  });

  it('mão de obra: salário com encargos ÷ minutos do mês', () => {
    const m = { id: 'm', name: 'Conf.', kind: 'mao_de_obra' as const, watts: 0, gasKgPerHour: 0, monthlySalary: 1500, chargesPct: 10 };
    expect(resourceUnitCost(m, settings)).toBeCloseTo((1500 * 1.1) / (24 * 8 * 60), 8);
  });
});

describe('preço e margem', () => {
  it('preço sugerido = custo × (1 + markup) ÷ (1 − taxas)', () => {
    expect(suggestedPrice(2, 100, 10)).toBeCloseTo(4.4444, 3);
  });

  it('markup para a margem alvo devolve exatamente essa margem', () => {
    const fee = 7.38;
    const markup = markupForTargetMargin(40, fee);
    const price = suggestedPrice(10, markup, fee);
    const mc = price - 10 - (fee / 100) * price;
    expect(mc / price).toBeCloseTo(0.4, 6);
  });

  it('alíquota de custo fixo = fixos ÷ receita; sem receita = 0', () => {
    expect(fixedRatePct(4450, 44500)).toBeCloseTo(10, 6);
    expect(fixedRatePct(4450, 0)).toBe(0);
  });

  it('média ignora meses sem venda', () => {
    expect(averageRevenue([1000, 0, 3000])).toBe(2000);
    expect(averageRevenue([])).toBe(0);
  });

  it('custo fixo entra no custo de fabricação', () => {
    const sheet: SheetInput = {
      id: 'p', kind: 'produto', name: 'P', yieldQty: 2, markupPct: 0, totalWeightG: 0, lossPct: 0,
      lines: [{ ingredientId: 'i', quantity: 100 }],
    };
    const base = { settings: { ...settings, cardFeePct: 0, taxPct: 0 }, ingredients: [{ id: 'i', name: 'i', unit: 'g', purchaseQty: 100, purchasePrice: 10, lossPct: 0 }], resources: [], sheets: [sheet] };
    const sem = computePricing({ ...base, fixedRatePct: 0 }).sheets.p;
    const com = computePricing({ ...base, fixedRatePct: 10 }).sheets.p;
    expect(sem.directCost).toBeCloseTo(10, 8);
    expect(com.manufacturingCost).toBeCloseTo(11, 8);
    expect(com.costPerUnit).toBeCloseTo(5.5, 8);
  });
});

describe('sub-fichas', () => {
  const massa: SheetInput = { id: 'm', kind: 'massa', name: 'Massa', yieldQty: 10, markupPct: 0, totalWeightG: 0, lossPct: 0, lines: [{ ingredientId: 'i', quantity: 100 }] };
  const ings = [{ id: 'i', name: 'i', unit: 'g', purchaseQty: 100, purchasePrice: 10, lossPct: 0 }];

  it('custo unitário da sub-ficha = total ÷ rendimento', () => {
    const prod: SheetInput = { id: 'p', kind: 'produto', name: 'P', yieldQty: 1, markupPct: 0, totalWeightG: 0, lossPct: 0, lines: [{ subSheetId: 'm', quantity: 3 }] };
    const r = computePricing({ settings, fixedRatePct: 0, ingredients: ings, resources: [], sheets: [massa, prod] });
    expect(r.sheets.m.unitCost).toBeCloseTo(1, 8);
    expect(r.sheets.p.directCost).toBeCloseTo(3, 8);
  });

  it('referência circular é sinalizada e não trava', () => {
    const a: SheetInput = { ...massa, id: 'a', lines: [{ subSheetId: 'b', quantity: 1 }] };
    const b: SheetInput = { ...massa, id: 'b', lines: [{ subSheetId: 'a', quantity: 1 }] };
    const r = computePricing({ settings, fixedRatePct: 0, ingredients: ings, resources: [], sheets: [a, b] });
    expect(JSON.stringify(r)).toContain('Referência circular');
  });
});

describe('planilha PreçoFácil importada', () => {
  type Line = { ingredient?: string; resource?: string; subSheet?: string; quantity: number };
  const ingredients = planilha.ingredients.map((i) => ({ id: `i:${i.name}`, name: i.name, unit: i.unit, purchaseQty: i.purchaseQty, purchasePrice: i.purchasePrice, lossPct: i.lossPct }));
  const resources = planilha.resources.map((r) => ({
    id: `r:${r.name}`, name: r.name, kind: r.kind as 'eletrico' | 'gas' | 'mao_de_obra',
    watts: (r as { watts?: number }).watts ?? 0, gasKgPerHour: (r as { gasKgPerHour?: number }).gasKgPerHour ?? 0,
    monthlySalary: (r as { monthlySalary?: number }).monthlySalary ?? 0, chargesPct: (r as { chargesPct?: number }).chargesPct ?? 0,
  }));
  const sheets: SheetInput[] = planilha.sheets.map((s) => ({
    id: `s:${s.name}`, kind: s.kind as SheetInput['kind'], name: s.name, yieldQty: s.yieldQty,
    markupPct: (s as { markupPct?: number | null }).markupPct ?? 0,
    totalWeightG: (s as { totalWeightG?: number }).totalWeightG ?? 0,
    lossPct: (s as { lossPct?: number }).lossPct ?? 0,
    lines: (s.lines as Line[]).map((l) => ({
      ingredientId: l.ingredient ? `i:${l.ingredient}` : null,
      resourceId: l.resource ? `r:${l.resource}` : null,
      subSheetId: l.subSheet ? `s:${l.subSheet}` : null,
      quantity: l.quantity,
    })),
  }));
  const result = computePricing({ settings: planilha.settings, fixedRatePct: 0, ingredients, resources, sheets });

  // PANETONE POTE NOZES: a própria planilha calcula uma linha com custo trocado (erro dela).
  const comErroNaPlanilha = new Set(['PANETONE POTE NOZES']);

  for (const [nome, e] of Object.entries(esperado as Record<string, { direct: number; price: number; ifood: number; mc: number }>)) {
    if (comErroNaPlanilha.has(nome)) continue;
    it(`${nome}: custo, preço, iFood e margem batem com a planilha`, () => {
      const r = result.sheets[`s:${nome}`];
      expect(r).toBeDefined();
      expect(r.warnings).toEqual([]);
      expect(r.directCost).toBeCloseTo(e.direct, 2);
      expect(r.suggestedPrice).toBeCloseTo(e.price, 2);
      expect(r.ifoodPrice).toBeCloseTo(e.ifood, 2);
      expect(r.contributionMargin).toBeCloseTo(e.mc, 2);
    });
  }
});

describe('canais e preço-alvo', () => {
  it('arredonda para cima em R$ 0,05', async () => {
    const { roundUpToStep } = await import('@/server/domain/precificacao');
    expect(roundUpToStep(4.91)).toBe(4.95);
    expect(roundUpToStep(4.95)).toBe(4.95);
    expect(roundUpToStep(4.96)).toBe(5);
    expect(roundUpToStep(0)).toBe(0);
  });

  it('preço-alvo entrega a margem pedida (ou mais) no canal', async () => {
    const { priceForTargetMargin, channelMargin } = await import('@/server/domain/precificacao');
    const price = priceForTargetMargin(2.5, 40, 5);
    const m = channelMargin(price, 2.5, 5);
    expect(m.mcPct).toBeGreaterThanOrEqual(0.4 - 1e-9);
    expect(m.mcPct).toBeLessThan(0.42);
    expect(priceForTargetMargin(2.5, 99, 5)).toBe(0);
  });

  it('margem de canal desconta taxa sobre o preço', async () => {
    const { channelMargin } = await import('@/server/domain/precificacao');
    const m = channelMargin(10, 4, 10);
    expect(m.mc).toBeCloseTo(5);
    expect(m.mcPct).toBeCloseTo(0.5);
  });

  it('ponto de equilíbrio = fixo ÷ margem média', async () => {
    const { breakEvenRevenue } = await import('@/server/domain/precificacao');
    expect(breakEvenRevenue(6000, 0.4)).toBeCloseTo(15000);
    expect(breakEvenRevenue(6000, 0)).toBe(0);
  });
});
