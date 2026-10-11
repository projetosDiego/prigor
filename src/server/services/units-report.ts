/** Relatório de unidades vendidas com displays/kits expandidos (display com 12 = 12 × brownie 7x5). */
import type { Prisma } from '@prisma/client';

import { prisma } from '../db';
import { badRequest } from '../http/errors';
import { expandSales, type ComponentLink } from '../domain/composition';
import { num } from './serializers';

export interface UnitsRow {
  productId: string;
  name: string;
  direct: number;
  viaKits: number;
  total: number;
}

export interface UnitsKitRow {
  productId: string;
  name: string;
  quantity: number;
  revenue: number;
  components: Array<{ productId: string; name: string; units: number }>;
}

export interface UnitsReport {
  period: { from: string | null; to: string | null };
  totalUnits: number;
  rows: UnitsRow[];
  kits: UnitsKitRow[];
}

export async function loadComponentLinks(): Promise<Map<string, ComponentLink[]>> {
  const all = await prisma.productComponent.findMany({ select: { productId: true, componentId: true, quantity: true } });
  const map = new Map<string, ComponentLink[]>();
  for (const l of all) {
    const arr = map.get(l.productId) ?? [];
    arr.push({ componentId: l.componentId, quantity: num(l.quantity) });
    map.set(l.productId, arr);
  }
  return map;
}

export async function unitsReport(from?: Date | null, to?: Date | null): Promise<UnitsReport> {
  const whereOrder: Prisma.OrderWhereInput = { status: { not: 'cancelado' } };
  if (from || to) whereOrder.orderDate = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };

  const [grouped, links] = await Promise.all([
    prisma.orderItem.groupBy({
      by: ['productId'],
      where: { order: whereOrder },
      _sum: { quantity: true, subtotal: true },
    }),
    loadComponentLinks(),
  ]);

  const sold = grouped.map((g) => ({ productId: g.productId, quantity: num(g._sum.quantity) }));
  const exp = expandSales(sold, links);

  const ids = new Set<string>([...grouped.map((g) => g.productId), ...exp.direct.keys(), ...exp.viaKits.keys()]);
  for (const m of exp.perKit.values()) for (const k of m.keys()) ids.add(k);
  const names = new Map(
    (await prisma.product.findMany({ where: { id: { in: [...ids] } }, select: { id: true, name: true } })).map((p) => [p.id, p.name]),
  );
  const nameOf = (id: string) => names.get(id) ?? 'Produto';

  const baseIds = new Set<string>([...exp.direct.keys(), ...exp.viaKits.keys()]);
  const rows: UnitsRow[] = [...baseIds]
    .map((id) => {
      const direct = exp.direct.get(id) ?? 0;
      const viaKits = exp.viaKits.get(id) ?? 0;
      return { productId: id, name: nameOf(id), direct, viaKits, total: direct + viaKits };
    })
    .sort((a, b) => b.total - a.total);

  const revenueBy = new Map(grouped.map((g) => [g.productId, num(g._sum.subtotal)]));
  const qtyBy = new Map(sold.map((s) => [s.productId, s.quantity]));
  const kits: UnitsKitRow[] = [...exp.perKit.entries()]
    .map(([kitId, comps]) => ({
      productId: kitId,
      name: nameOf(kitId),
      quantity: qtyBy.get(kitId) ?? 0,
      revenue: revenueBy.get(kitId) ?? 0,
      components: [...comps.entries()].map(([id, units]) => ({ productId: id, name: nameOf(id), units })),
    }))
    .sort((a, b) => b.quantity - a.quantity);

  return {
    period: { from: from ? from.toISOString().slice(0, 10) : null, to: to ? to.toISOString().slice(0, 10) : null },
    totalUnits: rows.reduce((a, r) => a + r.total, 0),
    rows,
    kits,
  };
}

// ─── Cadastro da composição ────────────────────────────────────────────────

export interface ProductComponentDTO {
  componentId: string;
  name: string;
  quantity: number;
}

export async function getProductComponents(productId: string): Promise<ProductComponentDTO[]> {
  const rows = await prisma.productComponent.findMany({
    where: { productId },
    select: { componentId: true, quantity: true, component: { select: { name: true } } },
    orderBy: { component: { name: 'asc' } },
  });
  return rows.map((r) => ({ componentId: r.componentId, name: r.component.name, quantity: num(r.quantity) }));
}

export async function setProductComponents(
  productId: string,
  components: Array<{ componentId: string; quantity: number }>,
): Promise<ProductComponentDTO[]> {
  const merged = new Map<string, number>();
  for (const c of components) {
    if (c.componentId === productId) throw badRequest('Um produto não pode ser componente dele mesmo.');
    merged.set(c.componentId, (merged.get(c.componentId) ?? 0) + c.quantity);
  }
  // Impede ciclo: nenhum componente pode ter o próprio produto na sua composição (direta ou indireta).
  const links = await loadComponentLinks();
  links.set(productId, [...merged.entries()].map(([componentId, quantity]) => ({ componentId, quantity })));
  const reaches = (start: string, seen = new Set<string>()): boolean => {
    if (start === productId) return true;
    if (seen.has(start)) return false;
    seen.add(start);
    return (links.get(start) ?? []).some((l) => reaches(l.componentId, seen));
  };
  for (const id of merged.keys()) {
    if ((links.get(id) ?? []).some((l) => reaches(l.componentId))) throw badRequest('Composição circular: um dos componentes já usa este produto.');
  }

  await prisma.$transaction([
    prisma.productComponent.deleteMany({ where: { productId } }),
    prisma.productComponent.createMany({
      data: [...merged.entries()].map(([componentId, quantity]) => ({ productId, componentId, quantity })),
    }),
  ]);
  return getProductComponents(productId);
}
