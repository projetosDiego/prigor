/**
 * Plano de produção e compras (puro, sem banco).
 *
 * Parte do que foi vendido (unidades por ficha de produto) e desce pelas
 * fichas técnicas: lotes de cada produto → massas/recheios (sub-fichas) →
 * insumos (com a perda do insumo) e minutos de equipamento/mão de obra.
 */

export interface PlanIngredient {
  id: string;
  name: string;
  unit: string;
  purchaseQty: number;
  purchasePrice: number;
  lossPct: number;
}

export interface PlanResource {
  id: string;
  name: string;
}

export interface PlanLine {
  ingredientId?: string | null;
  resourceId?: string | null;
  subSheetId?: string | null;
  quantity: number;
}

export interface PlanSheet {
  id: string;
  name: string;
  kind: 'produto' | 'massa' | 'recheio';
  yieldQty: number;
  yieldUnit: string;
  lossPct: number;
  lines: PlanLine[];
}

export interface PlanModel {
  sheets: PlanSheet[];
  ingredients: PlanIngredient[];
  resources: PlanResource[];
}

export interface PlanOutput {
  /** Produtos finais: unidades vendidas e lotes necessários. */
  products: Array<{ sheetId: string; name: string; units: number; batches: number; yieldUnit: string }>;
  /** Massas e recheios a preparar. */
  preparations: Array<{ sheetId: string; name: string; kind: string; units: number; batches: number; yieldUnit: string }>;
  /** Lista de compras/separação (quantidade de uso, já com perda). */
  ingredients: Array<{
    id: string;
    name: string;
    unit: string;
    quantity: number;
    purchaseQty: number;
    packages: number;
    cost: number;
  }>;
  resources: Array<{ id: string; name: string; minutes: number }>;
  totalCost: number;
  warnings: string[];
}

const MAX_DEPTH = 8;
const pos = (v: number) => (Number.isFinite(v) && v > 0 ? v : 0);

export function planProduction(model: PlanModel, demand: Array<{ sheetId: string; units: number }>): PlanOutput {
  const sheets = new Map(model.sheets.map((s) => [s.id, s]));
  const ingredients = new Map(model.ingredients.map((i) => [i.id, i]));
  const resources = new Map(model.resources.map((r) => [r.id, r]));

  const sheetUnits = new Map<string, number>();
  const ingQty = new Map<string, number>();
  const resMin = new Map<string, number>();
  const warnings: string[] = [];

  function visit(sheetId: string, units: number, depth: number, trail: Set<string>): void {
    const sheet = sheets.get(sheetId);
    if (!sheet) {
      warnings.push('Ficha removida encontrada no cálculo.');
      return;
    }
    if (depth > MAX_DEPTH || trail.has(sheetId)) {
      warnings.push(`Referência circular em "${sheet.name}".`);
      return;
    }
    // Sub-fichas têm perda ao serem usadas como insumo: precisa-se preparar um pouco mais.
    const loss = Math.min(Math.max(pos(sheet.lossPct), 0), 99.99) / 100;
    const needed = depth === 0 ? units : units / (1 - loss);
    sheetUnits.set(sheetId, (sheetUnits.get(sheetId) ?? 0) + needed);
    const yieldQty = pos(sheet.yieldQty) || 1;
    const batches = needed / yieldQty;

    const nextTrail = new Set(trail).add(sheetId);
    for (const line of sheet.lines) {
      const q = pos(line.quantity) * batches;
      if (q <= 0) continue;
      if (line.ingredientId) {
        const ing = ingredients.get(line.ingredientId);
        if (!ing) continue;
        const ingLoss = Math.min(Math.max(pos(ing.lossPct), 0), 99.99) / 100;
        ingQty.set(ing.id, (ingQty.get(ing.id) ?? 0) + q / (1 - ingLoss));
      } else if (line.resourceId) {
        if (resources.has(line.resourceId)) resMin.set(line.resourceId, (resMin.get(line.resourceId) ?? 0) + q);
      } else if (line.subSheetId) {
        visit(line.subSheetId, q, depth + 1, nextTrail);
      }
    }
  }

  const productUnits = new Map<string, number>();
  for (const d of demand) {
    if (pos(d.units) <= 0) continue;
    productUnits.set(d.sheetId, (productUnits.get(d.sheetId) ?? 0) + d.units);
  }
  for (const [sheetId, units] of productUnits) visit(sheetId, units, 0, new Set());

  const topLevel = new Set(productUnits.keys());
  const productRows: PlanOutput['products'] = [];
  const prepRows: PlanOutput['preparations'] = [];
  for (const [id, units] of sheetUnits) {
    const s = sheets.get(id)!;
    const batches = units / (pos(s.yieldQty) || 1);
    if (topLevel.has(id) && sheetUnits.get(id) === productUnits.get(id)) {
      productRows.push({ sheetId: id, name: s.name, units, batches, yieldUnit: s.yieldUnit });
    } else if (topLevel.has(id)) {
      // Produto vendido que também é usado como insumo de outro: separa as duas necessidades.
      const sold = productUnits.get(id)!;
      productRows.push({ sheetId: id, name: s.name, units: sold, batches: sold / (pos(s.yieldQty) || 1), yieldUnit: s.yieldUnit });
      const extra = units - sold;
      prepRows.push({ sheetId: id, name: s.name, kind: s.kind, units: extra, batches: extra / (pos(s.yieldQty) || 1), yieldUnit: s.yieldUnit });
    } else {
      prepRows.push({ sheetId: id, name: s.name, kind: s.kind, units, batches, yieldUnit: s.yieldUnit });
    }
  }

  const ingRows: PlanOutput['ingredients'] = [...ingQty].map(([id, quantity]) => {
    const ing = ingredients.get(id)!;
    const purchaseQty = pos(ing.purchaseQty) || 1;
    return {
      id,
      name: ing.name,
      unit: ing.unit,
      quantity,
      purchaseQty,
      packages: Math.ceil(quantity / purchaseQty - 1e-9),
      // Custo do que será usado (a perda já está na quantidade).
      cost: (quantity / purchaseQty) * pos(ing.purchasePrice),
    };
  });

  return {
    products: productRows.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    preparations: prepRows.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    ingredients: ingRows.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    resources: [...resMin].map(([id, minutes]) => ({ id, name: resources.get(id)!.name, minutes })).sort((a, b) => b.minutes - a.minutes),
    totalCost: ingRows.reduce((s, i) => s + i.cost, 0),
    warnings: [...new Set(warnings)],
  };
}
