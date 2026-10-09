/**
 * Lista de produção e compras do dia: lê os pedidos com entrega no período e
 * desce pelas fichas técnicas da Precificação (ver `domain/production`).
 */
import { prisma } from '../db';
import { badRequest } from '../http/errors';
import { planProduction, type PlanOutput } from '../domain/production';
import { num } from './serializers';

export interface ProductionPlanDTO extends PlanOutput {
  from: string;
  to: string;
  orders: number;
  /** Itens vendidos (por produto), inclusive os sem ficha técnica. */
  items: Array<{ productId: string; name: string; units: number; orders: number; hasSheet: boolean }>;
  /** Produtos vendidos sem ficha na Precificação: não entram nas compras. */
  withoutSheet: string[];
  orderList: Array<{ numero: number; customer: string; status: string; deliveryDate: string | null }>;
}

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

function parseDay(value: string, label: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw badRequest(`${label} inválida (use AAAA-MM-DD).`);
  const d = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) throw badRequest(`${label} inválida.`);
  return d;
}

export async function getProductionPlan(from: string, to: string): Promise<ProductionPlanDTO> {
  const start = parseDay(from, 'Data inicial');
  const end = parseDay(to, 'Data final');
  if (end < start) throw badRequest('A data final é anterior à inicial.');
  if (end.getTime() - start.getTime() > 31 * 86_400_000) throw badRequest('Escolha no máximo 31 dias.');

  const [orders, sheets, ingredients, resources] = await Promise.all([
    prisma.order.findMany({
      where: { deliveryDate: { gte: start, lte: end }, status: { in: ['novo', 'confirmado', 'em_producao', 'faturado'] } },
      select: {
        id: true,
        numero: true,
        status: true,
        deliveryDate: true,
        customer: { select: { tradeName: true } },
        items: { select: { productId: true, quantity: true, product: { select: { name: true } } } },
      },
      orderBy: [{ deliveryDate: 'asc' }, { numero: 'asc' }],
    }),
    prisma.pricingSheet.findMany({ where: { active: true }, include: { lines: { orderBy: { position: 'asc' } } } }),
    prisma.pricingIngredient.findMany(),
    prisma.pricingResource.findMany(),
  ]);

  const byProduct = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const s of sheets) {
    if (s.kind !== 'produto') continue;
    if (s.productId) byProduct.set(s.productId, s.id);
    byName.set(norm(s.name), s.id);
  }

  const sold = new Map<string, { productId: string; name: string; units: number; orders: Set<string>; sheetId: string | null }>();
  for (const o of orders) {
    for (const it of o.items) {
      const name = it.product?.name ?? 'Produto';
      const cur = sold.get(it.productId) ?? {
        productId: it.productId,
        name,
        units: 0,
        orders: new Set<string>(),
        sheetId: byProduct.get(it.productId) ?? byName.get(norm(name)) ?? null,
      };
      cur.units += num(it.quantity);
      cur.orders.add(o.id);
      sold.set(it.productId, cur);
    }
  }

  const plan = planProduction(
    {
      sheets: sheets.map((s) => ({
        id: s.id,
        name: s.name,
        kind: s.kind as 'produto' | 'massa' | 'recheio',
        yieldQty: num(s.yieldQty),
        yieldUnit: s.yieldUnit,
        lossPct: num(s.lossPct),
        lines: s.lines.map((l) => ({
          ingredientId: l.ingredientId,
          resourceId: l.resourceId,
          subSheetId: l.subSheetId,
          quantity: num(l.quantity),
        })),
      })),
      ingredients: ingredients.map((i) => ({
        id: i.id,
        name: i.name,
        unit: i.unit,
        purchaseQty: num(i.purchaseQty),
        purchasePrice: num(i.purchasePrice),
        lossPct: num(i.lossPct),
      })),
      resources: resources.map((r) => ({ id: r.id, name: r.name })),
    },
    [...sold.values()].filter((s) => s.sheetId).map((s) => ({ sheetId: s.sheetId!, units: s.units })),
  );

  const items = [...sold.values()]
    .map((s) => ({ productId: s.productId, name: s.name, units: s.units, orders: s.orders.size, hasSheet: !!s.sheetId }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

  return {
    ...plan,
    from,
    to,
    orders: orders.length,
    items,
    withoutSheet: items.filter((i) => !i.hasSheet).map((i) => i.name),
    orderList: orders.map((o) => ({
      numero: o.numero,
      customer: o.customer?.tradeName ?? '—',
      status: o.status,
      deliveryDate: o.deliveryDate ? o.deliveryDate.toISOString().slice(0, 10) : null,
    })),
  };
}
