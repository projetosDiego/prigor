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
  computePricing,
  fixedRatePct,
  markupForTargetMargin,
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

export interface PricingBundleDTO {
  settings: PricingSettingsDTO;
  fixedCosts: FixedCostDTO[];
  fixedTotal: number;
  revenue: RevenueInfo;
  fixedRatePct: number;
  resources: ResourceDTO[];
  ingredients: IngredientDTO[];
  sheets: SheetDTO[];
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

// ─── Leitura consolidada ─────────────────────────────────────────────────────

export async function getPricingBundle(): Promise<PricingBundleDTO> {
  const settingsRow = await getSettingsRow();
  const settings = settingsDTO(settingsRow);

  const [fixedRows, resourceRows, ingredientRows, sheetRows] = await Promise.all([
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
      purchasePrice: num(i.purchasePrice),
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

  return { settings, fixedCosts, fixedTotal, revenue, fixedRatePct: rate, resources, ingredients, sheets };
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
    return await prisma.pricingIngredient.update({ where: { id }, data });
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
    return await prisma.$transaction(async (tx) => {
      await tx.pricingSheetLine.deleteMany({ where: { sheetId: id } });
      return tx.pricingSheet.update({
        where: { id },
        data: { ...sheetData(input), lines: { create: lineRows(input) } },
        select: { id: true },
      });
    });
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
  const finalPrice = Math.round((price ?? sheet.suggestedPrice) * 100) / 100;
  if (!(finalPrice > 0)) throw badRequest('O preço calculado é zero. Preencha a ficha antes de aplicar.');
  const product = await prisma.product.update({
    where: { id: sheet.productId },
    data: { salePrice: finalPrice, cost: Math.round(sheet.costPerUnit * 100) / 100 },
    select: { id: true, name: true, salePrice: true, cost: true },
  });
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

  return {
    settings: !!input.settings,
    fixedCosts: input.fixedCosts.length,
    resources: input.resources.length,
    ingredients: input.ingredients.length,
    sheets: input.sheets.length,
    warnings,
  };
}
