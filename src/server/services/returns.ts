/** Trocas e devoluções parciais por item de pedido (em unidades-base). */
import { prisma } from '../db';
import { badRequest, conflict, notFound } from '../http/errors';
import type { SessionPayload } from '../auth/guard';
import { computeReturn, monthTotals, type MonthTotals } from '../domain/returns';
import { createCredit } from './credits';
import { todayBr } from './collections';
import { dateOnly, num } from './serializers';
import { loadComponentLinks } from './units-report';

export interface ReturnItemOption {
  itemId: string;
  productName: string;
  baseName: string;
  quantity: number;
  unitsPerItem: number;
  totalUnits: number;
  returnedUnits: number;
  remainingUnits: number;
  /** Valor de 1 unidade-base. */
  unitValue: number;
}

export interface ReturnDTO {
  id: string;
  date: string;
  kind: 'troca' | 'devolucao';
  productName: string;
  baseName: string;
  units: number;
  value: number;
  cost: number;
  reason: string | null;
  customerId: string;
  customerName: string;
  orderNumero: number;
  creditUsed: boolean;
}

export interface OrderReturnsDTO {
  items: ReturnItemOption[];
  returns: ReturnDTO[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

type ReturnRow = Awaited<ReturnType<typeof loadReturnRows>>[number];

function loadReturnRows(where: Record<string, unknown>) {
  return prisma.orderReturn.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: { order: { select: { numero: true } }, customer: { select: { tradeName: true } }, credit: { select: { originalAmount: true, remaining: true } } },
  });
}

async function names(ids: string[]): Promise<Map<string, string>> {
  const rows = ids.length ? await prisma.product.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true, name: true } }) : [];
  return new Map(rows.map((p) => [p.id, p.name]));
}

async function toDTOs(rows: ReturnRow[]): Promise<ReturnDTO[]> {
  const pn = await names(rows.flatMap((r) => [r.productId, r.baseProductId ?? r.productId]));
  return rows.map((r) => ({
    id: r.id,
    date: dateOnly(r.createdAt)!,
    kind: r.kind as 'troca' | 'devolucao',
    productName: pn.get(r.productId) ?? '—',
    baseName: pn.get(r.baseProductId ?? r.productId) ?? '—',
    units: num(r.units),
    value: num(r.value),
    cost: num(r.cost),
    reason: r.reason,
    customerId: r.customerId,
    customerName: r.customer.tradeName,
    orderNumero: r.order.numero,
    creditUsed: !!r.credit && num(r.credit.remaining) < num(r.credit.originalAmount),
  }));
}

export async function orderReturns(orderId: string): Promise<OrderReturnsDTO> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { items: { select: { id: true, productId: true, quantity: true, subtotal: true, unitPrice: true, product: { select: { name: true } } } } },
  });
  if (!order) throw notFound('Pedido');
  const [links, rows] = await Promise.all([loadComponentLinks(), loadReturnRows({ orderId })]);
  const base = await names(order.items.flatMap((i) => (links.get(i.productId)?.length === 1 ? [links.get(i.productId)![0]!.componentId] : [])));
  const items: ReturnItemOption[] = order.items.map((i) => {
    const l = links.get(i.productId);
    const per = l?.length === 1 ? l[0]!.quantity : 1;
    const qty = num(i.quantity);
    const returned = rows.filter((r) => r.orderItemId === i.id).reduce((s, r) => s + num(r.units), 0);
    const total = qty * per;
    const netUnit = qty > 0 ? num(i.subtotal) / qty : num(i.unitPrice);
    return {
      itemId: i.id,
      productName: i.product.name,
      baseName: l?.length === 1 ? (base.get(l[0]!.componentId) ?? i.product.name) : i.product.name,
      quantity: qty,
      unitsPerItem: per,
      totalUnits: total,
      returnedUnits: returned,
      remainingUnits: Math.max(0, total - returned),
      unitValue: per > 0 ? r2(netUnit / per) : 0,
    };
  });
  return { items, returns: await toDTOs(rows) };
}

export interface CreateReturnInput {
  itemId: string;
  units: number;
  kind: 'troca' | 'devolucao';
  reason?: string | null;
}

export async function createReturn(session: SessionPayload, orderId: string, input: CreateReturnInput) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      numero: true,
      status: true,
      customerId: true,
      items: { select: { id: true, productId: true, quantity: true, subtotal: true, unitPrice: true, unitCost: true, product: { select: { cost: true } } } },
    },
  });
  if (!order) throw notFound('Pedido');
  if (order.status === 'cancelado') throw conflict('Pedido cancelado.');
  const item = order.items.find((i) => i.id === input.itemId);
  if (!item) throw notFound('Item do pedido');

  const links = await loadComponentLinks();
  const l = links.get(item.productId);
  const per = l?.length === 1 ? l[0]!.quantity : 1;
  const baseProductId = l?.length === 1 ? l[0]!.componentId : item.productId;
  const prev = await prisma.orderReturn.aggregate({ where: { orderItemId: item.id }, _sum: { units: true } });
  const qty = num(item.quantity);

  let calc;
  try {
    calc = computeReturn({
      units: input.units,
      unitsPerItem: per,
      itemQuantity: qty,
      itemNetUnitPrice: qty > 0 ? num(item.subtotal) / qty : num(item.unitPrice),
      itemUnitCost: item.unitCost != null ? num(item.unitCost) : num(item.product.cost),
      alreadyReturnedUnits: num(prev._sum.units),
    });
  } catch (err) {
    throw badRequest(err instanceof Error ? err.message : 'Quantidade inválida.');
  }

  let creditId: string | null = null;
  if (input.kind === 'devolucao' && calc.value > 0) {
    const credit = await createCredit({
      customerId: order.customerId,
      amount: calc.value,
      source: 'devolucao',
      note: `Devolução de ${input.units} un. do pedido #${order.numero}`,
    });
    creditId = credit.id;
  }

  const created = await prisma.orderReturn.create({
    data: {
      orderId: order.id,
      customerId: order.customerId,
      orderItemId: item.id,
      productId: item.productId,
      baseProductId,
      kind: input.kind,
      units: input.units,
      itemQty: calc.itemQty,
      value: calc.value,
      cost: calc.cost,
      reason: input.reason?.trim() || null,
      creditId,
      createdById: session.userId,
    },
  });
  return { id: created.id, value: calc.value, cost: calc.cost, creditCreated: creditId ? calc.value : 0 };
}

export async function deleteReturn(returnId: string) {
  const r = await prisma.orderReturn.findUnique({ where: { id: returnId }, include: { credit: true } });
  if (!r) throw notFound('Troca/devolução');
  if (r.credit && num(r.credit.remaining) < num(r.credit.originalAmount)) {
    throw conflict('O crédito dessa devolução já foi usado. Não dá para desfazer.');
  }
  await prisma.$transaction([
    prisma.orderReturn.delete({ where: { id: returnId } }),
    ...(r.creditId ? [prisma.customerCredit.delete({ where: { id: r.creditId } })] : []),
  ]);
}

// ─── Relatório ──────────────────────────────────────────────────────────────

export interface ReturnsReport {
  months: MonthTotals[];
  /** Mês corrente. */
  current: MonthTotals;
  byCustomer: Array<{ customerId: string; customerName: string; count: number; units: number; lossValue: number }>;
  byProduct: Array<{ name: string; count: number; units: number }>;
  byReason: Array<{ reason: string; count: number }>;
  latest: ReturnDTO[];
}

export async function returnsReport(monthsBack = 6): Promise<ReturnsReport> {
  const today = todayBr();
  const [y, m] = today.split('-').map(Number) as [number, number];
  const since = new Date(Date.UTC(y, m - 1 - (monthsBack - 1), 1));
  const rows = await loadReturnRows({ createdAt: { gte: since } });
  const dtos = await toDTOs(rows);

  const months = monthTotals(dtos.map((d) => ({ createdAt: d.date, kind: d.kind, units: d.units, value: d.value, cost: d.cost })));
  const monthKey = today.slice(0, 7);
  const current = months.find((x) => x.month === monthKey) ?? { month: monthKey, trocas: 0, devolucoes: 0, units: 0, lossValue: 0 };

  const cust = new Map<string, { customerId: string; customerName: string; count: number; units: number; lossValue: number }>();
  const prod = new Map<string, { name: string; count: number; units: number }>();
  const reasons = new Map<string, number>();
  for (const d of dtos.filter((x) => x.date.slice(0, 7) === monthKey)) {
    const c = cust.get(d.customerId) ?? { customerId: d.customerId, customerName: d.customerName, count: 0, units: 0, lossValue: 0 };
    c.count += 1;
    c.units += d.units;
    c.lossValue = r2(c.lossValue + (d.kind === 'troca' ? d.cost : d.value + d.cost));
    cust.set(d.customerId, c);
    const p = prod.get(d.baseName) ?? { name: d.baseName, count: 0, units: 0 };
    p.count += 1;
    p.units += d.units;
    prod.set(d.baseName, p);
    const reason = d.reason ?? 'Sem motivo';
    reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
  }
  return {
    months,
    current,
    byCustomer: [...cust.values()].sort((a, b) => b.units - a.units),
    byProduct: [...prod.values()].sort((a, b) => b.units - a.units),
    byReason: [...reasons.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
    latest: dtos.slice(0, 40),
  };
}
