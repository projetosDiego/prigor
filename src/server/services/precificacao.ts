/**
 * Precificação: cadastros (insumos, recursos, custos fixos, fichas técnicas) e
 * o cálculo de custo/preço, usando o motor puro de `domain/precificacao`.
 *
 * Rateio do custo fixo: total dos custos fixos ativos ÷ receita média dos
 * últimos N meses FECHADOS (pedidos não cancelados), com opção de valor manual.
 *
 * Esta área não mexe nas receitas (RecipeIngredient) nem no estoque: só
 * "Aplicar preço" grava `salePrice`/`cost` do produto vinculado.
 */
import { Prisma } from '@prisma/client';

import { prisma } from '../db';
import { badRequest, conflict, notFound } from '../http/errors';
import {
  averageRevenue,
  breakEvenRevenue,
  channelMargin,
  computePricing,
  fixedRatePct,
  markupForTargetMargin,
  priceForTargetMargin,
  roundUpToStep,
  type ChannelMargin,
  type PricingModelInput,
  type SheetResult,
} from '../domain/precificacao';
import type {
  PricingFixedCostInput,
  PricingImportInput,
  PricingIngredientInput,
  PricingResourceInput,
  PricingSettingsInputDTO,
  PricingSheetInput,
} from '../validation/precificacao';
import { logger } from '../http/logger';
import { dateOnly, num } from './serializers';

// ─── DTOs ────────────────────────────────────────────────────────────────────

export interface PricingSettingsDTO {
  energyKwhPrice: number;
  gasCylinderPrice: number;
  gasCylinderKg: number;
  workDaysPerMonth: number;
  hoursPerDay: number;
  ifoodFeePct: number;
  cardFeePct: number;
  taxPct: number;
  resellerCommissionPct: number;
  targetMarginPct: number;
  revenueMonths: number;
  revenueOverride: number | null;
}

export interface FixedCostDTO {
  id: string;
  name: string;
  monthlyAmount: number;
  active: boolean;
}

export interface ResourceDTO {
  id: string;
  name: string;
  kind: 'eletrico' | 'gas' | 'mao_de_obra';
  watts: number;
  gasKgPerHour: number;
  monthlySalary: number;
  chargesPct: number;
  active: boolean;
  /** R$ por minuto. */
  unitCost: number;
}

export interface IngredientDTO {
  id: string;
  name: string;
  category: string;
  unit: string;
  purchaseQty: number;
  purchasePrice: number;
  lossPct: number;
  priceUpdatedAt: string | null;
  active: boolean;
  /** R$ por unidade de uso (já com perda). */
  unitCost: number;
  usedIn: number;
}

export interface SheetLineDTO {
  id: string;
  ingredientId: string | null;
  resourceId: string | null;
  subSheetId: string | null;
  quantity: number;
  label: string;
  unit: string;
  unitCost: number;
  totalCost: number;
  warning?: string;
}

export interface SheetDTO {
  id: string;
  kind: 'produto' | 'massa' | 'recheio';
  name: string;
  yieldQty: number;
  yieldUnit: string;
  lossPct: number;
  markupPct: number;
  totalWeightG: number;
  notes: string | null;
  productId: string | null;
  productName: string | null;
  productPrice: number | null;
  /** Preço praticado informado na ficha (balcão). */
  actualPrice: number | null;
  /** Preço em uso: praticado → preço do produto → sugerido. */
  effectivePrice: number;
  priceSource: 'praticado' | 'produto' | 'sugerido';
  channels: { balcao: ChannelMargin; ifood: ChannelMargin; revenda: ChannelMargin };
  /** Menor preço (múltiplo de R$ 0,05) que entrega a margem alvo no balcão. */
  targetPrice: number;
  /** Preço sugerido pelo markup, arredondado para cima (R$ 0,05). */
  suggestedRounded: number;
  status: 'ok' | 'baixa' | 'prejuizo' | 'sem_custo';
  active: boolean;
  lines: SheetLineDTO[];
  directCost: number;
  unitCost: number;
  manufacturingCost: number;
  costPerUnit: number;
  suggestedPrice: number;
  ifoodPrice: number;
  pricePerKg: number;
  contributionMargin: number;
  contributionMarginPct: number;
  /** Markup (%) que levaria à margem alvo. */
  markupForTarget: number;
  usedInCount: number;
  warnings: string[];
}

export interface RevenueInfo {
  months: Array<{ month: string; total: number }>;
  average: number;
  source: 'manual' | 'pedidos' | 'nenhuma';
  used: number;
}

/** Produto do cadastro (Produtos Acabados) visto pela precificação. */
export interface CatalogProductDTO {
  id: string;
  name: string;
  sku: string | null;
  category: string | null;
  salePrice: number;
  wholesalePrice: number;
  cost: number;
  stock: number;
  /** Itens da receita cadastrada em Produtos Acabados (insumos com estoque). */
  recipeLines: number;
  /** Ficha técnica ligada a este produto (null = ainda sem ficha). */
  sheetId: string | null;
}

export interface PricingBundleDTO {
  catalog: CatalogProductDTO[];
  settings: PricingSettingsDTO;
  fixedCosts: FixedCostDTO[];
  fixedTotal: number;
  revenue: RevenueInfo;
  fixedRatePct: number;
  resources: ResourceDTO[];
  ingredients: IngredientDTO[];
  sheets: SheetDTO[];
  summary: PricingSummaryDTO;
}

export interface PricingSummaryDTO {
  products: number;
  /** Margem média (balcão) ponderada igualmente entre os produtos com preço. */
  avgMarginPct: number;
  belowTarget: number;
  loss: number;
  /** Faturamento mensal de equilíbrio com a margem média atual. */
  breakEvenRevenue: number;
  /** Dias de uso médio dos preços dos insumos (desde a última atualização). */
  staleIngredients: number;
}

// ─── Configuração ────────────────────────────────────────────────────────────

async function getSettingsRow() {
  return (await prisma.pricingSettings.findFirst()) ?? (await prisma.pricingSettings.create({ data: {} }));
}

function settingsDTO(r: Awaited<ReturnType<typeof getSettingsRow>>): PricingSettingsDTO {
  return {
    energyKwhPrice: num(r.energyKwhPrice),
    gasCylinderPrice: num(r.gasCylinderPrice),
    gasCylinderKg: num(r.gasCylinderKg),
    workDaysPerMonth: r.workDaysPerMonth,
    hoursPerDay: num(r.hoursPerDay),
    ifoodFeePct: num(r.ifoodFeePct),
    cardFeePct: num(r.cardFeePct),
    taxPct: num(r.taxPct),
    resellerCommissionPct: num(r.resellerCommissionPct),
    targetMarginPct: num(r.targetMarginPct),
    revenueMonths: r.revenueMonths,
    revenueOverride: r.revenueOverride == null ? null : num(r.revenueOverride),
  };
}

export async function updatePricingSettings(input: PricingSettingsInputDTO): Promise<PricingSettingsDTO> {
  const current = await getSettingsRow();
  const updated = await prisma.pricingSettings.update({
    where: { id: current.id },
    data: { ...input, workDaysPerMonth: Math.round(input.workDaysPerMonth), revenueMonths: Math.round(input.revenueMonths) },
  });
  scheduleCostSync();
  return settingsDTO(updated);
}

/** Receita dos últimos N meses fechados (não inclui o mês corrente). */
async function revenueInfo(settings: PricingSettingsDTO, now = new Date()): Promise<RevenueInfo> {
  const months: Array<{ month: string; total: number }> = [];
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  for (let i = settings.revenueMonths; i >= 1; i--) {
    const start = new Date(Date.UTC(y, m - i, 1));
    const end = new Date(Date.UTC(y, m - i + 1, 0));
    const agg = await prisma.order.aggregate({
      where: { status: { not: 'cancelado' }, orderDate: { gte: start, lte: end } },
      _sum: { total: true },
    });
    months.push({ month: start.toISOString().slice(0, 7), total: num(agg._sum.total) });
  }
  const average = averageRevenue(months.map((x) => x.total));
  if (settings.revenueOverride && settings.revenueOverride > 0) {
    return { months, average, source: 'manual', used: settings.revenueOverride };
  }
  return { months, average, source: average > 0 ? 'pedidos' : 'nenhuma', used: average };
}


// ─── Margens por canal ───────────────────────────────────────────────────────

function pricingExtras(
  s: { kind: string; actualPrice: Prisma.Decimal | null; product: { salePrice: Prisma.Decimal } | null },
  r: SheetResult,
  settings: PricingSettingsDTO,
) {
  const balcaoFee = settings.cardFeePct + settings.taxPct;
  const ifoodFee = settings.ifoodFeePct;
  const resellerFee = settings.taxPct + settings.resellerCommissionPct;
  const actual = s.actualPrice != null ? num(s.actualPrice) : null;
  const productPrice = s.product ? num(s.product.salePrice) : null;
  let effectivePrice = r.suggestedPrice;
  let priceSource: SheetDTO['priceSource'] = 'sugerido';
  if (actual && actual > 0) {
    effectivePrice = actual;
    priceSource = 'praticado';
  } else if (productPrice && productPrice > 0) {
    effectivePrice = productPrice;
    priceSource = 'produto';
  }
  const balcao = channelMargin(effectivePrice, r.costPerUnit, balcaoFee);
  const status: SheetDTO['status'] =
    r.costPerUnit <= 0 ? 'sem_custo' : balcao.mc < 0 ? 'prejuizo' : balcao.mcPct * 100 < settings.targetMarginPct ? 'baixa' : 'ok';
  return {
    actualPrice: actual,
    effectivePrice,
    priceSource,
    channels: {
      balcao,
      ifood: channelMargin(effectivePrice, r.costPerUnit, ifoodFee),
      revenda: channelMargin(effectivePrice, r.costPerUnit, resellerFee),
    },
    targetPrice: priceForTargetMargin(r.costPerUnit, settings.targetMarginPct, balcaoFee),
    suggestedRounded: roundUpToStep(r.suggestedPrice),
    status,
  };
}

function buildSummary(
  sheets: SheetDTO[],
  ingredients: IngredientDTO[],
  settings: PricingSettingsDTO,
  fixedTotal: number,
): PricingSummaryDTO {
  const products = sheets.filter((s) => s.kind === 'produto' && s.active);
  const priced = products.filter((s) => s.status !== 'sem_custo' && s.effectivePrice > 0);
  const avg = priced.length ? priced.reduce((a, s) => a + s.channels.balcao.mcPct, 0) / priced.length : 0;
  const limit = Date.now() - 60 * 24 * 3600 * 1000;
  return {
    products: products.length,
    avgMarginPct: avg * 100,
    belowTarget: priced.filter((s) => s.status === 'baixa').length,
    loss: priced.filter((s) => s.status === 'prejuizo').length,
    breakEvenRevenue: breakEvenRevenue(fixedTotal, avg),
    staleIngredients: ingredients.filter(
      (i) => i.active && i.usedIn > 0 && (!i.priceUpdatedAt || new Date(`${i.priceUpdatedAt}T00:00:00Z`).getTime() < limit),
    ).length,
  };
}

// ─── Leitura consolidada ─────────────────────────────────────────────────────

/** `priceOverrides`: simulação — id do insumo → novo preço de compra (nada é gravado). */
export async function getPricingBundle(priceOverrides: Record<string, number> = {}): Promise<PricingBundleDTO> {
  const settingsRow = await getSettingsRow();
  const settings = settingsDTO(settingsRow);

  const [fixedRows, resourceRows, ingredientRows, sheetRows, productRows] = await Promise.all([
    prisma.pricingFixedCost.findMany({ orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] }),
    prisma.pricingResource.findMany({ orderBy: { name: 'asc' } }),
    prisma.pricingIngredient.findMany({ orderBy: { name: 'asc' } }),
    prisma.pricingSheet.findMany({
      orderBy: [{ kind: 'asc' }, { name: 'asc' }],
      include: {
        product: { select: { id: true, name: true, salePrice: true } },
        lines: { orderBy: { position: 'asc' } },
        _count: { select: { usedIn: true } },
      },
    }),
    prisma.product.findMany({
      where: { active: true, type: 'venda' },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        sku: true,
        category: true,
        salePrice: true,
        wholesalePrice: true,
        cost: true,
        stock: true,
        _count: { select: { ingredients: true } },
      },
    }),
  ]);

  const fixedCosts: FixedCostDTO[] = fixedRows.map((r) => ({
    id: r.id,
    name: r.name,
    monthlyAmount: num(r.monthlyAmount),
    active: r.active,
  }));
  const fixedTotal = fixedCosts.filter((c) => c.active).reduce((s, c) => s + c.monthlyAmount, 0);
  const revenue = await revenueInfo(settings);
  const rate = fixedRatePct(fixedTotal, revenue.used);

  const model: PricingModelInput = {
    settings,
    fixedRatePct: rate,
    ingredients: ingredientRows.map((i) => ({
      id: i.id,
      name: i.name,
      unit: i.unit,
      purchaseQty: num(i.purchaseQty),
      purchasePrice: priceOverrides[i.id] ?? num(i.purchasePrice),
      lossPct: num(i.lossPct),
    })),
    resources: resourceRows.map((r) => ({
      id: r.id,
      name: r.name,
      kind: r.kind as ResourceDTO['kind'],
      watts: num(r.watts),
      gasKgPerHour: num(r.gasKgPerHour),
      monthlySalary: num(r.monthlySalary),
      chargesPct: num(r.chargesPct),
    })),
    sheets: sheetRows.map((s) => ({
      id: s.id,
      kind: s.kind as SheetDTO['kind'],
      name: s.name,
      yieldQty: num(s.yieldQty),
      markupPct: num(s.markupPct),
      totalWeightG: num(s.totalWeightG),
      lossPct: num(s.lossPct),
      lines: s.lines.map((l) => ({
        ingredientId: l.ingredientId,
        resourceId: l.resourceId,
        subSheetId: l.subSheetId,
        quantity: num(l.quantity),
      })),
    })),
  };
  const calc = computePricing(model);

  const usage = new Map<string, number>();
  for (const s of sheetRows) for (const l of s.lines) if (l.ingredientId) usage.set(l.ingredientId, (usage.get(l.ingredientId) ?? 0) + 1);

  const ingredients: IngredientDTO[] = ingredientRows.map((i) => ({
    id: i.id,
    name: i.name,
    category: i.category,
    unit: i.unit,
    purchaseQty: num(i.purchaseQty),
    purchasePrice: num(i.purchasePrice),
    lossPct: num(i.lossPct),
    priceUpdatedAt: dateOnly(i.priceUpdatedAt),
    active: i.active,
    unitCost: calc.ingredientUnitCost[i.id] ?? 0,
    usedIn: usage.get(i.id) ?? 0,
  }));
  const resources: ResourceDTO[] = resourceRows.map((r) => ({
    id: r.id,
    name: r.name,
    kind: r.kind as ResourceDTO['kind'],
    watts: num(r.watts),
    gasKgPerHour: num(r.gasKgPerHour),
    monthlySalary: num(r.monthlySalary),
    chargesPct: num(r.chargesPct),
    active: r.active,
    unitCost: calc.resourceUnitCost[r.id] ?? 0,
  }));

  const ingById = new Map(ingredients.map((i) => [i.id, i]));
  const resById = new Map(resources.map((r) => [r.id, r]));
  const sheetName = new Map(sheetRows.map((s) => [s.id, s]));
  const feePct = settings.cardFeePct + settings.taxPct;

  const sheets: SheetDTO[] = sheetRows.map((s) => {
    const r: SheetResult = calc.sheets[s.id];
    return {
      id: s.id,
      kind: s.kind as SheetDTO['kind'],
      name: s.name,
      yieldQty: num(s.yieldQty),
      yieldUnit: s.yieldUnit,
      lossPct: num(s.lossPct),
      markupPct: num(s.markupPct),
      totalWeightG: num(s.totalWeightG),
      notes: s.notes,
      productId: s.productId,
      productName: s.product?.name ?? null,
      productPrice: s.product ? num(s.product.salePrice) : null,
      ...pricingExtras(s, r, settings),
      active: s.active,
      lines: s.lines.map((l, idx) => {
        const lr = r.lines[idx];
        const ing = l.ingredientId ? ingById.get(l.ingredientId) : undefined;
        const res = l.resourceId ? resById.get(l.resourceId) : undefined;
        const sub = l.subSheetId ? sheetName.get(l.subSheetId) : undefined;
        return {
          id: l.id,
          ingredientId: l.ingredientId,
          resourceId: l.resourceId,
          subSheetId: l.subSheetId,
          quantity: num(l.quantity),
          label: ing?.name ?? res?.name ?? sub?.name ?? '(removido)',
          unit: ing?.unit ?? (res ? 'minutos' : (sub?.yieldUnit ?? '')),
          unitCost: lr.unitCost,
          totalCost: lr.totalCost,
          warning: lr.warning,
        };
      }),
      directCost: r.directCost,
      unitCost: r.unitCost,
      manufacturingCost: r.manufacturingCost,
      costPerUnit: r.costPerUnit,
      suggestedPrice: r.suggestedPrice,
      ifoodPrice: r.ifoodPrice,
      pricePerKg: r.pricePerKg,
      contributionMargin: r.contributionMargin,
      contributionMarginPct: r.contributionMarginPct,
      markupForTarget: markupForTargetMargin(settings.targetMarginPct, feePct),
      usedInCount: s._count.usedIn,
      warnings: r.warnings,
    };
  });

  const summary = buildSummary(sheets, ingredients, settings, fixedTotal);
  const sheetByProduct = new Map(sheetRows.filter((s) => s.productId).map((s) => [s.productId as string, s.id]));
  const catalog: CatalogProductDTO[] = productRows.map((p) => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    category: p.category,
    salePrice: num(p.salePrice),
    wholesalePrice: num(p.wholesalePrice),
    cost: num(p.cost),
    stock: num(p.stock),
    recipeLines: p._count.ingredients,
    sheetId: sheetByProduct.get(p.id) ?? null,
  }));
  return { catalog, settings, fixedCosts, fixedTotal, revenue, fixedRatePct: rate, resources, ingredients, sheets, summary };
}

// ─── Custos fixos ────────────────────────────────────────────────────────────

export async function createFixedCost(input: PricingFixedCostInput) {
  const last = await prisma.pricingFixedCost.aggregate({ _max: { position: true } });
  return prisma.pricingFixedCost.create({ data: { ...input, position: (last._max.position ?? 0) + 1 } });
}

export async function updateFixedCost(id: string, input: PricingFixedCostInput) {
  await prisma.pricingFixedCost.findUniqueOrThrow({ where: { id } }).catch(() => {
    throw notFound('Custo fixo');
  });
  return prisma.pricingFixedCost.update({ where: { id }, data: input });
}

export async function deleteFixedCost(id: string): Promise<void> {
  const r = await prisma.pricingFixedCost.deleteMany({ where: { id } });
  if (r.count === 0) throw notFound('Custo fixo');
}

// ─── Recursos ────────────────────────────────────────────────────────────────

function uniqueGuard(error: unknown, what: string): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    throw conflict(`Já existe ${what} com esse nome.`);
  }
  throw error;
}

function fkGuard(error: unknown, what: string): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
    throw conflict(`${what} está em uso em fichas técnicas. Remova das fichas ou desative.`);
  }
  throw error;
}

export async function createResource(input: PricingResourceInput) {
  try {
    return await prisma.pricingResource.create({ data: input });
  } catch (e) {
    return uniqueGuard(e, 'um recurso');
  }
}

export async function updateResource(id: string, input: PricingResourceInput) {
  try {
    return await prisma.pricingResource.update({ where: { id }, data: input });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') throw notFound('Recurso');
    return uniqueGuard(e, 'um recurso');
  }
}

export async function deleteResource(id: string): Promise<void> {
  try {
    await prisma.pricingResource.delete({ where: { id } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') throw notFound('Recurso');
    fkGuard(e, 'Este recurso');
  }
}

// ─── Insumos ─────────────────────────────────────────────────────────────────

function ingredientData(input: PricingIngredientInput) {
  const { priceUpdatedAt, ...rest } = input;
  return { ...rest, priceUpdatedAt: priceUpdatedAt ? new Date(`${priceUpdatedAt}T00:00:00.000Z`) : null };
}

export async function createIngredient(input: PricingIngredientInput) {
  try {
    return await prisma.pricingIngredient.create({
      data: { ...ingredientData(input), priceUpdatedAt: input.priceUpdatedAt ? new Date(`${input.priceUpdatedAt}T00:00:00.000Z`) : new Date() },
    });
  } catch (e) {
    return uniqueGuard(e, 'um insumo');
  }
}

export async function updateIngredient(id: string, input: PricingIngredientInput) {
  try {
    const before = await prisma.pricingIngredient.findUnique({ where: { id } });
    if (!before) throw notFound('Insumo');
    const data = ingredientData(input);
    // Preço mudou e a data não foi informada: marca a atualização de hoje.
    const priceChanged = num(before.purchasePrice) !== input.purchasePrice || num(before.purchaseQty) !== input.purchaseQty;
    if (!input.priceUpdatedAt && priceChanged) data.priceUpdatedAt = new Date();
    const saved = await prisma.pricingIngredient.update({ where: { id }, data });
    scheduleCostSync();
    return saved;
  } catch (e) {
    return uniqueGuard(e, 'um insumo');
  }
}

export async function deleteIngredient(id: string): Promise<void> {
  try {
    await prisma.pricingIngredient.delete({ where: { id } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') throw notFound('Insumo');
    fkGuard(e, 'Este insumo');
  }
}

// ─── Fichas técnicas ─────────────────────────────────────────────────────────

/** Impede que uma ficha use a si mesma (direta ou indiretamente) como sub-ficha. */
async function assertNoCycle(sheetId: string | null, subIds: string[]): Promise<void> {
  if (subIds.length === 0) return;
  const all = await prisma.pricingSheetLine.findMany({
    where: { subSheetId: { not: null } },
    select: { sheetId: true, subSheetId: true },
  });
  const children = new Map<string, string[]>();
  for (const l of all) {
    if (!l.subSheetId) continue;
    children.set(l.sheetId, [...(children.get(l.sheetId) ?? []), l.subSheetId]);
  }
  if (sheetId) children.set(sheetId, subIds); // estado novo da ficha editada
  const seen = new Set<string>();
  const stack = [...subIds];
  while (stack.length) {
    const id = stack.pop()!;
    if (sheetId && id === sheetId) throw badRequest('Uma ficha não pode usar a si mesma (nem indiretamente) como sub-ficha.');
    if (seen.has(id)) continue;
    seen.add(id);
    stack.push(...(children.get(id) ?? []));
  }
}

function sheetData(input: PricingSheetInput) {
  const { lines: _lines, productId, ...rest } = input;
  void _lines;
  return { ...rest, productId: productId ?? null };
}

function lineRows(input: PricingSheetInput) {
  return input.lines.map((l, i) => ({
    position: i,
    ingredientId: l.ingredientId ?? null,
    resourceId: l.resourceId ?? null,
    subSheetId: l.subSheetId ?? null,
    quantity: l.quantity,
  }));
}

export async function createSheet(input: PricingSheetInput) {
  await assertNoCycle(null, input.lines.map((l) => l.subSheetId).filter((x): x is string => !!x));
  try {
    return await prisma.pricingSheet.create({
      data: { ...sheetData(input), lines: { create: lineRows(input) } },
      select: { id: true },
    });
  } catch (e) {
    return uniqueGuard(e, 'uma ficha desse tipo');
  }
}

export async function updateSheet(id: string, input: PricingSheetInput) {
  const exists = await prisma.pricingSheet.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw notFound('Ficha');
  await assertNoCycle(id, input.lines.map((l) => l.subSheetId).filter((x): x is string => !!x));
  try {
    const saved = await prisma.$transaction(async (tx) => {
      await tx.pricingSheetLine.deleteMany({ where: { sheetId: id } });
      return tx.pricingSheet.update({
        where: { id },
        data: { ...sheetData(input), lines: { create: lineRows(input) } },
        select: { id: true },
      });
    });
    scheduleCostSync();
    return saved;
  } catch (e) {
    return uniqueGuard(e, 'uma ficha desse tipo');
  }
}

export async function deleteSheet(id: string): Promise<void> {
  try {
    await prisma.pricingSheet.delete({ where: { id } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') throw notFound('Ficha');
    fkGuard(e, 'Esta ficha');
  }
}

export async function duplicateSheet(id: string) {
  const src = await prisma.pricingSheet.findUnique({ where: { id }, include: { lines: { orderBy: { position: 'asc' } } } });
  if (!src) throw notFound('Ficha');
  let name = `${src.name} (cópia)`;
  for (let i = 2; await prisma.pricingSheet.findFirst({ where: { kind: src.kind, name }, select: { id: true } }); i++) {
    name = `${src.name} (cópia ${i})`;
  }
  return prisma.pricingSheet.create({
    data: {
      kind: src.kind,
      name,
      yieldQty: src.yieldQty,
      yieldUnit: src.yieldUnit,
      lossPct: src.lossPct,
      markupPct: src.markupPct,
      totalWeightG: src.totalWeightG,
      actualPrice: src.actualPrice,
      notes: src.notes,
      lines: {
        create: src.lines.map((l) => ({
          position: l.position,
          ingredientId: l.ingredientId,
          resourceId: l.resourceId,
          subSheetId: l.subSheetId,
          quantity: l.quantity,
        })),
      },
    },
    select: { id: true },
  });
}

/** Grava o preço sugerido (e o custo) no produto vinculado à ficha. */
export async function applySheetPrice(id: string, price?: number) {
  const bundle = await getPricingBundle();
  const sheet = bundle.sheets.find((s) => s.id === id);
  if (!sheet) throw notFound('Ficha');
  if (sheet.kind !== 'produto') throw badRequest('Só fichas de produto têm preço de venda.');
  if (!sheet.productId) throw badRequest('Vincule a ficha a um produto antes de aplicar o preço.');
  const finalPrice = Math.round((price ?? sheet.targetPrice ?? sheet.suggestedPrice) * 100) / 100;
  if (!(finalPrice > 0)) throw badRequest('O preço calculado é zero. Preencha a ficha antes de aplicar.');
  const [product] = await prisma.$transaction([
    prisma.product.update({
      where: { id: sheet.productId },
      data: { salePrice: finalPrice, cost: Math.round(sheet.costPerUnit * 100) / 100 },
      select: { id: true, name: true, salePrice: true, cost: true },
    }),
    prisma.pricingSheet.update({ where: { id }, data: { actualPrice: finalPrice } }),
  ]);
  return { productId: product.id, name: product.name, salePrice: num(product.salePrice), cost: num(product.cost) };
}

// ─── Importação (planilha PreçoFácil) ────────────────────────────────────────

export interface ImportSummary {
  settings: boolean;
  fixedCosts: number;
  resources: number;
  ingredients: number;
  sheets: number;
  warnings: string[];
}

export async function importPricing(input: PricingImportInput, replaceFixedCosts: boolean): Promise<ImportSummary> {
  const warnings: string[] = [];

  await prisma.$transaction(
    async (tx) => {
      if (input.settings) {
        const cur = (await tx.pricingSettings.findFirst()) ?? (await tx.pricingSettings.create({ data: {} }));
        const { revenueOverride: _r, ...s } = input.settings;
        void _r;
        await tx.pricingSettings.update({ where: { id: cur.id }, data: s });
      }
      if (replaceFixedCosts && input.fixedCosts.length) await tx.pricingFixedCost.deleteMany({});
      if (input.fixedCosts.length) {
        await tx.pricingFixedCost.createMany({
          data: input.fixedCosts.map((c, i) => ({ name: c.name, monthlyAmount: c.monthlyAmount, position: i })),
        });
      }

      for (const r of input.resources) {
        const data = {
          kind: r.kind,
          watts: r.watts ?? 0,
          gasKgPerHour: r.gasKgPerHour ?? 0,
          monthlySalary: r.monthlySalary ?? 0,
          chargesPct: r.chargesPct ?? 0,
        };
        await tx.pricingResource.upsert({ where: { name: r.name }, update: data, create: { name: r.name, ...data } });
      }
      for (const i of input.ingredients) {
        const data = {
          category: i.category,
          unit: i.unit,
          purchaseQty: i.purchaseQty,
          purchasePrice: i.purchasePrice,
          lossPct: i.lossPct,
          priceUpdatedAt: i.priceUpdatedAt ? new Date(`${i.priceUpdatedAt}T00:00:00.000Z`) : null,
        };
        await tx.pricingIngredient.upsert({ where: { name: i.name }, update: data, create: { name: i.name, ...data } });
      }

      // 1ª passada: fichas sem linhas. 2ª: linhas (as sub-fichas já existem).
      const sheetIds = new Map<string, string>();
      for (const s of input.sheets) {
        const data = {
          yieldQty: s.yieldQty,
          yieldUnit: s.yieldUnit,
          lossPct: s.lossPct,
          markupPct: s.markupPct ?? 100,
          totalWeightG: s.totalWeightG ?? 0,
          ...(s.actualPrice ? { actualPrice: s.actualPrice } : {}),
        };
        const row = await tx.pricingSheet.upsert({
          where: { kind_name: { kind: s.kind, name: s.name } },
          update: data,
          create: { kind: s.kind, name: s.name, ...data },
          select: { id: true },
        });
        sheetIds.set(s.name, row.id);
      }
      const ings = new Map((await tx.pricingIngredient.findMany({ select: { id: true, name: true } })).map((x) => [x.name, x.id]));
      const ress = new Map((await tx.pricingResource.findMany({ select: { id: true, name: true } })).map((x) => [x.name, x.id]));

      for (const s of input.sheets) {
        const sheetId = sheetIds.get(s.name)!;
        const rows: Array<{ sheetId: string; position: number; ingredientId?: string; resourceId?: string; subSheetId?: string; quantity: number }> = [];
        for (const l of s.lines) {
          const base = { sheetId, position: rows.length, quantity: l.quantity };
          if (l.ingredient && ings.has(l.ingredient)) rows.push({ ...base, ingredientId: ings.get(l.ingredient)! });
          else if (l.resource && ress.has(l.resource)) rows.push({ ...base, resourceId: ress.get(l.resource)! });
          else if (l.subSheet && sheetIds.has(l.subSheet) && sheetIds.get(l.subSheet) !== sheetId) {
            rows.push({ ...base, subSheetId: sheetIds.get(l.subSheet)! });
          } else warnings.push(`Ficha "${s.name}": item "${l.ingredient ?? l.resource ?? l.subSheet}" não encontrado — linha ignorada.`);
        }
        await tx.pricingSheetLine.deleteMany({ where: { sheetId } });
        if (rows.length) await tx.pricingSheetLine.createMany({ data: rows });
      }
    },
    { timeout: 60_000, maxWait: 10_000 },
  );

  scheduleCostSync();
  return {
    settings: !!input.settings,
    fixedCosts: input.fixedCosts.length,
    resources: input.resources.length,
    ingredients: input.ingredients.length,
    sheets: input.sheets.length,
    warnings,
  };
}

// ─── Vínculo com o cadastro de produtos ──────────────────────────────────────

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Liga fichas de produto sem vínculo ao produto cadastrado de mesmo nome (sem acento/caixa). */
export async function autoLinkProducts(): Promise<{ linked: Array<{ sheet: string; product: string }>; unmatched: string[] }> {
  const [sheets, products, taken] = await Promise.all([
    prisma.pricingSheet.findMany({ where: { kind: 'produto', productId: null }, select: { id: true, name: true } }),
    prisma.product.findMany({ where: { active: true }, select: { id: true, name: true } }),
    prisma.pricingSheet.findMany({ where: { productId: { not: null } }, select: { productId: true } }),
  ]);
  const used = new Set(taken.map((x) => x.productId));
  const byName = new Map<string, { id: string; name: string }>();
  for (const p of products) if (!used.has(p.id) && !byName.has(norm(p.name))) byName.set(norm(p.name), p);
  const linked: Array<{ sheet: string; product: string }> = [];
  const unmatched: string[] = [];
  for (const s of sheets) {
    const p = byName.get(norm(s.name));
    if (!p) {
      unmatched.push(s.name);
      continue;
    }
    byName.delete(norm(s.name));
    await prisma.pricingSheet.update({ where: { id: s.id }, data: { productId: p.id } });
    linked.push({ sheet: s.name, product: p.name });
  }
  return { linked, unmatched };
}

/** Simula o impacto de um novo preço de compra de insumo nas fichas de produto. */
export async function simulateIngredientPrice(
  ingredientId: string,
  newPurchasePrice: number,
): Promise<Array<{ sheetId: string; name: string; costBefore: number; costAfter: number; marginBefore: number; marginAfter: number }>> {
  const before = await getPricingBundle();
  const ing = before.ingredients.find((i) => i.id === ingredientId);
  if (!ing) throw notFound('Insumo');
  const after = await getPricingBundle({ [ingredientId]: newPurchasePrice });
  const afterById = new Map(after.sheets.map((s) => [s.id, s]));
  return before.sheets
    .filter((s) => s.kind === 'produto')
    .map((s) => ({ s, a: afterById.get(s.id)! }))
    .filter(({ s, a }) => Math.abs(a.costPerUnit - s.costPerUnit) > 1e-9)
    .map(({ s, a }) => ({
      sheetId: s.id,
      name: s.name,
      costBefore: s.costPerUnit,
      costAfter: a.costPerUnit,
      marginBefore: s.channels.balcao.mcPct,
      marginAfter: a.channels.balcao.mcPct,
    }));
}

// ─── Integração com o cadastro de produtos ───────────────────────────────────

/** Grava o custo por unidade das fichas em `Product.cost` dos produtos ligados. */
export async function syncLinkedProductCosts(): Promise<{ updated: number }> {
  const bundle = await getPricingBundle();
  const linked = bundle.sheets.filter((s) => s.kind === 'produto' && s.productId && s.costPerUnit > 0);
  const byId = new Map(bundle.catalog.map((p) => [p.id, p]));
  const changes = linked
    .map((s) => ({ productId: s.productId as string, cost: Math.round(s.costPerUnit * 100) / 100 }))
    .filter((c) => byId.has(c.productId) && Math.abs((byId.get(c.productId)?.cost ?? 0) - c.cost) >= 0.005);
  if (changes.length === 0) return { updated: 0 };
  await prisma.$transaction(changes.map((c) => prisma.product.update({ where: { id: c.productId }, data: { cost: c.cost } })));
  return { updated: changes.length };
}

/** Dispara a sincronização sem travar a resposta; falha só vira log. */
function scheduleCostSync(): void {
  void syncLinkedProductCosts().catch((error) => logger.warn('Precificação: falha ao sincronizar custos nos produtos', { error }));
}

export interface FromProductResult {
  id: string;
  created: boolean;
  /** Itens da receita cadastrada que não têm insumo de mesmo nome na precificação. */
  unmatched: string[];
}

/**
 * Cria a ficha técnica de um produto cadastrado, trazendo a receita que já
 * existe em Produtos Acabados (casando os insumos pelo nome). Se já houver
 * ficha de mesmo nome sem vínculo, apenas liga.
 */
export async function createSheetFromProduct(productId: string): Promise<FromProductResult> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { ingredients: { include: { ingredient: { select: { name: true } } }, orderBy: { id: 'asc' } } },
  });
  if (!product) throw notFound('Produto');

  const already = await prisma.pricingSheet.findFirst({ where: { productId }, select: { id: true } });
  if (already) return { id: already.id, created: false, unmatched: [] };

  const sameName = await prisma.pricingSheet.findFirst({ where: { kind: 'produto', name: product.name }, select: { id: true, productId: true } });
  if (sameName && !sameName.productId) {
    await prisma.pricingSheet.update({ where: { id: sameName.id }, data: { productId } });
    return { id: sameName.id, created: false, unmatched: [] };
  }

  const pricingIngredients = await prisma.pricingIngredient.findMany({ select: { id: true, name: true } });
  const byName = new Map(pricingIngredients.map((i) => [normName(i.name), i.id]));
  const lines: Array<{ position: number; ingredientId: string; quantity: number }> = [];
  const unmatched: string[] = [];
  for (const r of product.ingredients) {
    const id = byName.get(normName(r.ingredient.name));
    if (id) lines.push({ position: lines.length, ingredientId: id, quantity: num(r.quantity) });
    else unmatched.push(r.ingredient.name);
  }

  const sale = num(product.salePrice);
  const row = await prisma.pricingSheet.create({
    data: {
      kind: 'produto',
      name: sameName ? `${product.name} (cadastro)` : product.name,
      yieldQty: 1,
      yieldUnit: 'unidades',
      markupPct: 100,
      actualPrice: sale > 0 ? sale : null,
      productId,
      lines: { create: lines },
    },
    select: { id: true },
  });
  return { id: row.id, created: true, unmatched };
}

/** Cria a ficha de todos os produtos de venda que ainda não têm. */
export async function createSheetsForAllProducts(): Promise<{ created: number; withRecipe: number; unmatched: string[] }> {
  const products = await prisma.product.findMany({
    where: { active: true, type: 'venda', pricingSheets: { none: {} } },
    select: { id: true },
    orderBy: { name: 'asc' },
  });
  let created = 0;
  let withRecipe = 0;
  const unmatched = new Set<string>();
  for (const p of products) {
    const r = await createSheetFromProduct(p.id);
    if (r.created) created += 1;
    for (const u of r.unmatched) unmatched.add(u);
    if (r.created && r.unmatched.length === 0) withRecipe += 1;
  }
  return { created, withRecipe, unmatched: [...unmatched] };
}

function normName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
