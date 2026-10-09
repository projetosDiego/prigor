/**
 * Motor de precificação (puro, sem banco).
 *
 * Reproduz o método da planilha PreçoFácil:
 *  - custo unitário do insumo = preço de compra / volume / (1 − perda);
 *  - equipamento elétrico = kW × R$/kWh ÷ 60 (R$/min); a gás = kg/h × R$/kg ÷ 60;
 *  - mão de obra = salário × (1 + encargos) ÷ (dias × horas × 60);
 *  - sub-ficha (massa/recheio) vira insumo: custo total ÷ rendimento;
 *  - custo de fabricação = diretos × (1 + alíquota de custo fixo);
 *  - preço = ((custo ÷ rendimento) × (1 + markup)) ÷ (1 − (cartão + imposto)).
 *
 * Tudo em `number`: é cálculo de gestão/sugestão de preço, não de lançamento
 * contábil. O arredondamento final (2 casas) é feito na exibição.
 */

export type ResourceKind = 'eletrico' | 'gas' | 'mao_de_obra';
export type SheetKind = 'produto' | 'massa' | 'recheio';

export interface PricingSettingsInput {
  energyKwhPrice: number;
  gasCylinderPrice: number;
  gasCylinderKg: number;
  workDaysPerMonth: number;
  hoursPerDay: number;
  ifoodFeePct: number;
  cardFeePct: number;
  taxPct: number;
  targetMarginPct: number;
}

export interface IngredientInput {
  id: string;
  name: string;
  unit: string;
  purchaseQty: number;
  purchasePrice: number;
  lossPct: number;
}

export interface ResourceInput {
  id: string;
  name: string;
  kind: ResourceKind;
  watts: number;
  gasKgPerHour: number;
  monthlySalary: number;
  chargesPct: number;
}

export interface SheetLineInput {
  ingredientId?: string | null;
  resourceId?: string | null;
  subSheetId?: string | null;
  quantity: number;
}

export interface SheetInput {
  id: string;
  kind: SheetKind;
  name: string;
  yieldQty: number;
  markupPct: number;
  totalWeightG: number;
  /** Perda (%) ao usar a ficha como insumo de outra (massa/recheio/produto). */
  lossPct: number;
  lines: SheetLineInput[];
}

export interface PricingModelInput {
  settings: PricingSettingsInput;
  /** Alíquota de custo fixo em % (custos fixos ÷ receita média × 100). */
  fixedRatePct: number;
  ingredients: IngredientInput[];
  resources: ResourceInput[];
  sheets: SheetInput[];
}

export interface LineResult {
  unitCost: number;
  totalCost: number;
  /** Texto de problema (item não encontrado, ciclo). */
  warning?: string;
}

export interface SheetResult {
  id: string;
  lines: LineResult[];
  /** Soma das linhas (material + equipamentos + mão de obra). */
  directCost: number;
  /** Custo unitário como insumo (sub-fichas): direto ÷ rendimento. */
  unitCost: number;
  /** Custo de fabricação do lote: direto × (1 + custo fixo). */
  manufacturingCost: number;
  /** Custo de fabricação por unidade vendida. */
  costPerUnit: number;
  suggestedPrice: number;
  ifoodPrice: number;
  pricePerKg: number;
  /** Margem de contribuição em R$ por unidade. */
  contributionMargin: number;
  /** Margem de contribuição sobre o preço (0–1). */
  contributionMarginPct: number;
  warnings: string[];
}

export interface PricingResult {
  ingredientUnitCost: Record<string, number>;
  resourceUnitCost: Record<string, number>;
  sheets: Record<string, SheetResult>;
}

const safeDiv = (a: number, b: number): number => (b > 0 && Number.isFinite(b) ? a / b : 0);
const n = (v: number | null | undefined): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** Custo por unidade de compra, já considerando a perda. */
export function ingredientUnitCost(i: Pick<IngredientInput, 'purchaseQty' | 'purchasePrice' | 'lossPct'>): number {
  const loss = Math.min(Math.max(n(i.lossPct), 0), 99.99) / 100;
  return safeDiv(n(i.purchasePrice), n(i.purchaseQty)) / (1 - loss);
}

/** Custo por minuto do recurso (equipamento elétrico/gás ou mão de obra). */
export function resourceUnitCost(r: ResourceInput, s: PricingSettingsInput): number {
  if (r.kind === 'eletrico') return (n(r.watts) / 1000) * n(s.energyKwhPrice) / 60;
  if (r.kind === 'gas') return (safeDiv(n(s.gasCylinderPrice), n(s.gasCylinderKg)) * n(r.gasKgPerHour)) / 60;
  const minutesPerMonth = n(s.workDaysPerMonth) * n(s.hoursPerDay) * 60;
  return safeDiv(n(r.monthlySalary) * (1 + n(r.chargesPct) / 100), minutesPerMonth);
}

/** Alíquota de custo fixo (%) = total dos custos fixos ÷ receita bruta média. */
export function fixedRatePct(totalFixed: number, avgRevenue: number): number {
  return avgRevenue > 0 ? (n(totalFixed) / avgRevenue) * 100 : 0;
}

/** Preço sugerido a partir do custo unitário de fabricação. */
export function suggestedPrice(costPerUnit: number, markupPct: number, feePct: number): number {
  const divisor = 1 - feePct / 100;
  return divisor > 0 ? (costPerUnit * (1 + markupPct / 100)) / divisor : 0;
}

/** Markup (%) necessário para atingir uma margem de contribuição alvo (% do preço). */
export function markupForTargetMargin(targetMarginPct: number, feePct: number): number {
  const m = targetMarginPct / 100;
  const f = feePct / 100;
  // MC% = 1 − f − 1/(1+markup)·(1−f)  →  (1+markup) = (1−f)/(1−f−m)
  const denom = 1 - f - m;
  return denom > 0 ? ((1 - f) / denom - 1) * 100 : 0;
}

export function computePricing(model: PricingModelInput): PricingResult {
  const { settings } = model;
  const feePct = n(settings.cardFeePct) + n(settings.taxPct);

  const ingCost: Record<string, number> = {};
  for (const i of model.ingredients) ingCost[i.id] = ingredientUnitCost(i);
  const resCost: Record<string, number> = {};
  for (const r of model.resources) resCost[r.id] = resourceUnitCost(r, settings);

  const byId = new Map(model.sheets.map((s) => [s.id, s]));
  const done = new Map<string, SheetResult>();
  const visiting = new Set<string>();

  function solve(sheet: SheetInput): SheetResult {
    const cached = done.get(sheet.id);
    if (cached) return cached;
    visiting.add(sheet.id);

    const warnings: string[] = [];
    const lines: LineResult[] = sheet.lines.map((l) => {
      const q = n(l.quantity);
      if (l.ingredientId) {
        const c = ingCost[l.ingredientId];
        if (c === undefined) return { unitCost: 0, totalCost: 0, warning: 'Insumo removido' };
        return { unitCost: c, totalCost: c * q };
      }
      if (l.resourceId) {
        const c = resCost[l.resourceId];
        if (c === undefined) return { unitCost: 0, totalCost: 0, warning: 'Recurso removido' };
        return { unitCost: c, totalCost: c * q };
      }
      if (l.subSheetId) {
        const sub = byId.get(l.subSheetId);
        if (!sub) return { unitCost: 0, totalCost: 0, warning: 'Ficha removida' };
        if (visiting.has(sub.id)) return { unitCost: 0, totalCost: 0, warning: 'Referência circular' };
        const r = solve(sub);
        return { unitCost: r.unitCost, totalCost: r.unitCost * q };
      }
      return { unitCost: 0, totalCost: 0, warning: 'Linha vazia' };
    });
    for (const l of lines) if (l.warning) warnings.push(l.warning);

    const directCost = lines.reduce((s, l) => s + l.totalCost, 0);
    const yieldQty = n(sheet.yieldQty) > 0 ? n(sheet.yieldQty) : 1;
    const manufacturingCost = directCost * (1 + n(model.fixedRatePct) / 100);
    const costPerUnit = manufacturingCost / yieldQty;
    const price = suggestedPrice(costPerUnit, n(sheet.markupPct), feePct);
    const ifood = suggestedPrice(costPerUnit, n(sheet.markupPct), n(settings.ifoodFeePct));
    const mc = price - costPerUnit - (feePct / 100) * price;

    const result: SheetResult = {
      id: sheet.id,
      lines,
      directCost,
      unitCost: directCost / yieldQty / (1 - Math.min(Math.max(n(sheet.lossPct), 0), 99.99) / 100),
      manufacturingCost,
      costPerUnit,
      suggestedPrice: price,
      ifoodPrice: ifood,
      pricePerKg: n(sheet.totalWeightG) > 0 ? ((price * yieldQty) / n(sheet.totalWeightG)) * 1000 : 0,
      contributionMargin: mc,
      contributionMarginPct: price > 0 ? mc / price : 0,
      warnings,
    };
    visiting.delete(sheet.id);
    done.set(sheet.id, result);
    return result;
  }

  for (const s of model.sheets) solve(s);
  return { ingredientUnitCost: ingCost, resourceUnitCost: resCost, sheets: Object.fromEntries(done) };
}

/** Média da receita dos últimos meses fechados (valores já somados por mês). */
export function averageRevenue(monthlyTotals: number[]): number {
  const valid = monthlyTotals.filter((v) => v > 0);
  return valid.length === 0 ? 0 : valid.reduce((a, b) => a + b, 0) / valid.length;
}

/** Arredonda para cima ao múltiplo de `step` (padrão R$ 0,05). */
export function roundUpToStep(value: number, step = 0.05): number {
  if (!(value > 0) || !(step > 0)) return 0;
  const cents = Math.round(value * 100 - 1e-9);
  const stepCents = Math.round(step * 100);
  return (Math.ceil(cents / stepCents) * stepCents) / 100;
}

export interface ChannelMargin {
  price: number;
  /** Margem de contribuição em R$ por unidade. */
  mc: number;
  /** Margem de contribuição sobre o preço (0–1). */
  mcPct: number;
}

/** Margem de um canal: preço − custo − taxas (% do preço). */
export function channelMargin(price: number, costPerUnit: number, feePct: number): ChannelMargin {
  const p = n(price);
  const mc = p - n(costPerUnit) - (n(feePct) / 100) * p;
  return { price: p, mc, mcPct: p > 0 ? mc / p : 0 };
}

/** Menor preço que entrega a margem alvo (% do preço) no canal, já arredondado para cima. */
export function priceForTargetMargin(costPerUnit: number, targetMarginPct: number, feePct: number): number {
  const divisor = 1 - n(feePct) / 100 - n(targetMarginPct) / 100;
  return divisor > 0 ? roundUpToStep(n(costPerUnit) / divisor) : 0;
}

/** Faturamento mensal de equilíbrio: custos fixos ÷ margem de contribuição média. */
export function breakEvenRevenue(fixedTotal: number, avgMcPct: number): number {
  return avgMcPct > 0 ? n(fixedTotal) / avgMcPct : 0;
}
