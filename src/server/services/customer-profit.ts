/** Quais clientes compensam: margem real, trocas/devoluções, atraso e inadimplência. */
import { prisma } from '../db';
import { evaluateCustomer, rankCustomers, type CustomerFacts, type CustomerProfit } from '../domain/customer-profit';
import { todayBr } from './collections';
import { dateOnly, num } from './serializers';
import { loadComponentLinks } from './units-report';

export interface CustomerProfitReport {
  days: number;
  from: string;
  to: string;
  rows: CustomerProfit[];
  summary: { customers: number; naoCompensa: number; atencao: number; ok: number; totalProfit: number; profitOfBad: number };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export async function customerProfitReport(days = 90): Promise<CustomerProfitReport> {
  const d = Math.min(Math.max(Math.round(days), 30), 365);
  const to = todayBr();
  const fromDate = new Date(`${to}T12:00:00Z`);
  fromDate.setUTCDate(fromDate.getUTCDate() - d);
  const from = fromDate.toISOString().slice(0, 10);
  const start = new Date(`${from}T00:00:00Z`);

  const [orders, returns, paid, open, links] = await Promise.all([
    prisma.order.findMany({
      where: { status: { not: 'cancelado' }, orderDate: { gte: start } },
      select: {
        customerId: true,
        orderDate: true,
        subtotal: true,
        discount: true,
        commissionVal: true,
        customer: { select: { tradeName: true } },
        items: { select: { productId: true, quantity: true, unitCost: true, product: { select: { cost: true } } } },
      },
    }),
    prisma.orderReturn.findMany({ where: { createdAt: { gte: start } }, select: { customerId: true, units: true, value: true, cost: true, kind: true } }),
    prisma.financialTransaction.findMany({
      where: { type: 'receita', status: 'pago', orderId: { not: null }, dueDate: { gte: start }, paymentDate: { not: null } },
      select: { dueDate: true, paymentDate: true, order: { select: { customerId: true } } },
    }),
    prisma.financialTransaction.findMany({
      where: { type: 'receita', status: { in: ['pendente', 'atrasado'] }, orderId: { not: null }, dueDate: { lt: new Date(`${to}T00:00:00Z`) } },
      select: { value: true, order: { select: { customerId: true } } },
    }),
    loadComponentLinks(),
  ]);

  const facts = new Map<string, CustomerFacts>();
  const get = (id: string, name: string): CustomerFacts => {
    let f = facts.get(id);
    if (!f) {
      f = { customerId: id, name, orders: 0, revenue: 0, cost: 0, commission: 0, returnedValue: 0, returnLossCost: 0, unitsSold: 0, unitsReturned: 0, avgDelayDays: 0, overdueOpen: 0, lastOrderDate: null };
      facts.set(id, f);
    }
    return f;
  };

  for (const o of orders) {
    const f = get(o.customerId, o.customer.tradeName);
    f.orders += 1;
    f.revenue += num(o.subtotal) - num(o.discount);
    f.commission += num(o.commissionVal);
    const date = dateOnly(o.orderDate);
    if (date && (!f.lastOrderDate || date > f.lastOrderDate)) f.lastOrderDate = date;
    for (const i of o.items) {
      const qty = num(i.quantity);
      f.cost += qty * (i.unitCost != null ? num(i.unitCost) : num(i.product.cost));
      const l = links.get(i.productId);
      f.unitsSold += qty * (l?.length === 1 ? l[0]!.quantity : 1);
    }
  }

  for (const r of returns) {
    const f = facts.get(r.customerId);
    if (!f) continue; // pedido fora do período
    f.unitsReturned += num(r.units);
    f.returnLossCost += num(r.cost);
    if (r.kind === 'devolucao') f.returnedValue += num(r.value);
  }

  const delays = new Map<string, number[]>();
  for (const p of paid) {
    const cid = p.order?.customerId;
    if (!cid || !p.dueDate || !p.paymentDate) continue;
    const days = Math.round((p.paymentDate.getTime() - p.dueDate.getTime()) / 86_400_000);
    const arr = delays.get(cid) ?? [];
    arr.push(Math.max(0, days));
    delays.set(cid, arr);
  }
  for (const [cid, arr] of delays) {
    const f = facts.get(cid);
    if (f && arr.length) f.avgDelayDays = arr.reduce((s, x) => s + x, 0) / arr.length;
  }
  for (const t of open) {
    const f = t.order ? facts.get(t.order.customerId) : null;
    if (f) f.overdueOpen += num(t.value);
  }

  const rows = rankCustomers(
    [...facts.values()].map((f) =>
      evaluateCustomer({ ...f, revenue: r2(f.revenue), cost: r2(f.cost), commission: r2(f.commission), returnedValue: r2(f.returnedValue), returnLossCost: r2(f.returnLossCost), overdueOpen: r2(f.overdueOpen), avgDelayDays: Math.round(f.avgDelayDays * 10) / 10 }),
    ),
  );
  const bad = rows.filter((r) => r.verdict === 'nao_compensa');
  return {
    days: d,
    from,
    to,
    rows,
    summary: {
      customers: rows.length,
      naoCompensa: bad.length,
      atencao: rows.filter((r) => r.verdict === 'atencao').length,
      ok: rows.filter((r) => r.verdict === 'ok').length,
      totalProfit: r2(rows.reduce((s, r) => s + r.profit, 0)),
      profitOfBad: r2(bad.reduce((s, r) => s + r.profit, 0)),
    },
  };
}
