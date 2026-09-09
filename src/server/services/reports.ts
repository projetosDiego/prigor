/**
 * Relatórios gerenciais (consultas agregadas, somente leitura).
 */
import type { Prisma } from '@prisma/client';

import { prisma } from '../db';
import { num } from './serializers';

export interface CustomerReportRow {
  customerId: string;
  customerName: string;
  orders: number;
  total: number;
  average: number;
}

/**
 * Consolida os pedidos por cliente (ignora cancelados).
 * `from`/`to` filtram pela data do pedido (opcionais).
 */
export async function customerReport(
  from: Date | null,
  to: Date | null,
): Promise<CustomerReportRow[]> {
  const where: Prisma.OrderWhereInput = { status: { not: 'cancelado' } };
  if (from || to) {
    where.orderDate = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
  }

  const groups = await prisma.order.groupBy({
    by: ['customerId'],
    where,
    _count: { _all: true },
    _sum: { total: true },
  });

  const ids = groups.map((g: { customerId: string }) => g.customerId);
  const customers = ids.length
    ? await prisma.customer.findMany({ where: { id: { in: ids } }, select: { id: true, tradeName: true } })
    : [];
  const nameById = new Map<string, string>(
    customers.map((c: { id: string; tradeName: string }) => [c.id, c.tradeName]),
  );

  return groups
    .map((g: { customerId: string; _count: { _all: number }; _sum: { total: unknown } }) => {
      const total = num(g._sum.total);
      const orders = g._count._all;
      return {
        customerId: g.customerId,
        customerName: nameById.get(g.customerId) ?? '—',
        orders,
        total,
        average: orders > 0 ? total / orders : 0,
      };
    })
    .sort((a, b) => b.total - a.total);
}

export interface SellerReportRow {
  sellerId: string;
  sellerName: string;
  orders: number;
  realized: number;
  goal: number;
  projection: number;
  pctGoal: number;
}

function currentMonthRange(): { from: Date; to: Date } {
  const now = new Date();
  return {
    from: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
    to: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)),
  };
}

/**
 * Vendas por vendedor no período, com meta (R$), projeção (linear pelos dias
 * decorridos) e % da meta. Sem período informado, usa o mês corrente.
 */
export async function sellerReport(
  fromIn: Date | null,
  toIn: Date | null,
): Promise<{ period: { from: string; to: string }; rows: SellerReportRow[] }> {
  const def = currentMonthRange();
  const from = fromIn ?? def.from;
  const to = toIn ?? def.to;

  const sellers = await prisma.seller.findMany({
    where: { active: true },
    select: { id: true, name: true, goalRevenue: true },
  });

  const groups = await prisma.order.groupBy({
    by: ['sellerId'],
    where: { status: { not: 'cancelado' }, sellerId: { not: null }, orderDate: { gte: from, lte: to } },
    _count: { _all: true },
    _sum: { total: true },
  });
  const bySeller = new Map<string | null, { _count: { _all: number }; _sum: { total: unknown } }>(
    groups.map((g: { sellerId: string | null; _count: { _all: number }; _sum: { total: unknown } }) => [g.sellerId, g]),
  );

  const msDay = 86_400_000;
  const startDay = Math.floor(from.getTime() / msDay);
  const endDay = Math.floor(to.getTime() / msDay);
  const todayDay = Math.floor(Date.now() / msDay);
  const totalDays = Math.max(1, endDay - startDay + 1);
  const elapsedDays = Math.min(totalDays, Math.max(1, todayDay - startDay + 1));

  const rows: SellerReportRow[] = sellers
    .map((sv: { id: string; name: string; goalRevenue: unknown }) => {
      const g = bySeller.get(sv.id);
      const realized = num(g?._sum?.total);
      const orders = g?._count?._all ?? 0;
      const goal = num(sv.goalRevenue);
      const projection = elapsedDays > 0 ? (realized / elapsedDays) * totalDays : realized;
      const pctGoal = goal > 0 ? (realized / goal) * 100 : 0;
      return { sellerId: sv.id, sellerName: sv.name, orders, realized, goal, projection, pctGoal };
    })
    .sort((a, b) => b.realized - a.realized);

  return { period: { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) }, rows };
}
