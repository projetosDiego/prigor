/** Projeção do mês por vendedor: realizado, ritmo, meta, comissão e valores a receber. */
import { prisma } from '../db';
import { projectMonth, type ProjectionResult } from '../domain/projection';
import { dateOnly, num } from './serializers';
import { todayBr } from './collections';

export interface SellerProjectionRow extends ProjectionResult {
  sellerId: string | null;
  name: string;
  goal: number;
  orders: number;
  averageTicket: number;
  commissionRealized: number;
  commissionProjected: number;
  prevMonthRealized: number;
  /** Realizado do mês vs. mês anterior inteiro, em %. null sem base. */
  vsPrevMonthPct: number | null;
  /** Projeção (ritmo do mês) vs. mês anterior inteiro, em %. null sem base. */
  projectedVsPrevPct: number | null;
  receivable: { total: number; overdue: number; next30: number };
}

export interface SellerProjectionReport {
  month: string; // AAAA-MM
  today: string;
  daysInMonth: number;
  rows: SellerProjectionRow[];
  total: SellerProjectionRow;
}

const pctChange = (now: number, base: number) => (base > 0 ? Math.round(((now - base) / base) * 1000) / 10 : null);

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function sellerProjection(opts: { sellerId?: string; today?: string } = {}): Promise<SellerProjectionReport> {
  const today = opts.today ?? todayBr();
  const [y, m, d] = today.split('-').map(Number) as [number, number, number];
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 0));
  const prevStart = new Date(Date.UTC(y, m - 2, 1));
  const prevEnd = new Date(Date.UTC(y, m - 1, 0));
  const sellerFilter = opts.sellerId ? { sellerId: opts.sellerId } : {};

  const [sellers, orders, prevAgg, receivables] = await Promise.all([
    prisma.seller.findMany({
      where: { active: true, ...(opts.sellerId ? { id: opts.sellerId } : {}) },
      select: { id: true, name: true, goalRevenue: true },
      orderBy: { name: 'asc' },
    }),
    prisma.order.findMany({
      where: { status: { not: 'cancelado' }, orderDate: { gte: start, lte: end }, ...sellerFilter },
      select: { sellerId: true, orderDate: true, total: true, commissionVal: true },
    }),
    prisma.order.groupBy({
      by: ['sellerId'],
      where: { status: { not: 'cancelado' }, orderDate: { gte: prevStart, lte: prevEnd }, ...sellerFilter },
      _sum: { total: true },
    }),
    prisma.financialTransaction.findMany({
      where: {
        type: 'receita',
        status: { in: ['pendente', 'atrasado'] },
        orderId: { not: null },
        order: { is: { status: { not: 'cancelado' }, ...sellerFilter } },
      },
      select: { value: true, dueDate: true, order: { select: { sellerId: true } } },
    }),
  ]);

  type Acc = { daily: Map<number, number>; orders: number; commission: number; receivable: SellerProjectionRow['receivable'] };
  const acc = new Map<string | null, Acc>();
  const get = (id: string | null): Acc => {
    let a = acc.get(id);
    if (!a) {
      a = { daily: new Map(), orders: 0, commission: 0, receivable: { total: 0, overdue: 0, next30: 0 } };
      acc.set(id, a);
    }
    return a;
  };

  for (const o of orders) {
    const a = get(o.sellerId);
    const day = o.orderDate.getUTCDate();
    a.daily.set(day, (a.daily.get(day) ?? 0) + num(o.total));
    a.orders += 1;
    a.commission += num(o.commissionVal);
  }

  const limit = addDays(today, 30);
  for (const t of receivables) {
    const a = get(t.order?.sellerId ?? null);
    const v = num(t.value);
    a.receivable.total += v;
    const due = dateOnly(t.dueDate);
    if (due && due < today) a.receivable.overdue += v;
    else if (due && due <= limit) a.receivable.next30 += v;
  }

  const prevBy = new Map(prevAgg.map((p) => [p.sellerId, num(p._sum.total)]));

  const build = (
    sellerId: string | null,
    name: string,
    goal: number,
    a: Acc,
    prev: number,
  ): SellerProjectionRow => {
    const p = projectMonth({ dailyTotals: a.daily, today: d, daysInMonth, goal });
    return {
      ...p,
      sellerId,
      name,
      goal,
      orders: a.orders,
      averageTicket: a.orders > 0 ? Math.round((p.realized / a.orders) * 100) / 100 : 0,
      commissionRealized: Math.round(a.commission * 100) / 100,
      commissionProjected: p.realized > 0 ? Math.round(a.commission * (p.projectionMonth / p.realized) * 100) / 100 : 0,
      prevMonthRealized: prev,
      vsPrevMonthPct: pctChange(p.realized, prev),
      projectedVsPrevPct: pctChange(p.projectionMonth, prev),
      receivable: {
        total: Math.round(a.receivable.total * 100) / 100,
        overdue: Math.round(a.receivable.overdue * 100) / 100,
        next30: Math.round(a.receivable.next30 * 100) / 100,
      },
    };
  };

  const empty = (): Acc => ({ daily: new Map(), orders: 0, commission: 0, receivable: { total: 0, overdue: 0, next30: 0 } });
  const known = new Set(sellers.map((s) => s.id));
  const rows = sellers.map((s) => build(s.id, s.name, num(s.goalRevenue), acc.get(s.id) ?? empty(), prevBy.get(s.id) ?? 0));
  // Pedidos/títulos de vendedor inativo ou sem vendedor também entram, para o total fechar com o dashboard.
  for (const [id, a] of acc) {
    if (id && known.has(id)) continue;
    rows.push(build(id, id ? 'Vendedor inativo' : 'Sem vendedor', 0, a, id ? (prevBy.get(id) ?? 0) : (prevBy.get(null) ?? 0)));
  }
  rows.sort((a, b) => b.projectionMonth - a.projectionMonth);

  const totalAcc = empty();
  for (const a of acc.values()) {
    for (const [day, v] of a.daily) totalAcc.daily.set(day, (totalAcc.daily.get(day) ?? 0) + v);
    totalAcc.orders += a.orders;
    totalAcc.commission += a.commission;
    totalAcc.receivable.total += a.receivable.total;
    totalAcc.receivable.overdue += a.receivable.overdue;
    totalAcc.receivable.next30 += a.receivable.next30;
  }
  const totalGoal = sellers.reduce((s, x) => s + num(x.goalRevenue), 0);
  const totalPrev = [...prevBy.values()].reduce((s, v) => s + v, 0);
  const total = build(null, 'Total da empresa', totalGoal, totalAcc, totalPrev);

  return { month: today.slice(0, 7), today, daysInMonth, rows, total };
}
