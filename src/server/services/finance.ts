/**
 * Caixa e controle financeiro: contas, fornecedores, despesas, compras, recorrentes,
 * resumo do mês, agenda de contas e fluxo de caixa projetado.
 */
import { prisma } from '../db';
import { badRequest, conflict, notFound } from '../http/errors';
import {
  addDays,
  categoryGroup,
  dueInMonth,
  projectCashflow,
  splitInstallments,
  type Cashflow,
} from '../domain/cashflow';
import { CATEGORY_COMMISSION } from './financial-sync';
import { todayBr } from './collections';
import { dateOnly, num } from './serializers';

const cents = (v: number) => Math.round(v * 100);
const r2 = (n: number) => Math.round(n * 100) / 100;
const toDate = (iso: string) => new Date(`${iso}T12:00:00Z`);

// ─── Contas ─────────────────────────────────────────────────────────────────

export interface AccountDTO {
  id: string;
  name: string;
  kind: string;
  openingBalance: number;
  openingDate: string;
  isDefault: boolean;
  active: boolean;
  /** Saldo calculado: saldo inicial + recebido − pago desde a data do saldo. */
  balance: number;
}

export async function listAccounts(): Promise<AccountDTO[]> {
  const accounts = await prisma.financialAccount.findMany({ orderBy: [{ isDefault: 'desc' }, { name: 'asc' }] });
  const paid = await prisma.financialTransaction.findMany({
    where: { status: 'pago', paymentDate: { not: null } },
    select: { type: true, value: true, paymentDate: true, accountId: true },
  });
  const def = accounts.find((a) => a.isDefault && a.active) ?? accounts.find((a) => a.active) ?? null;
  return accounts.map((a) => {
    let bal = cents(num(a.openingBalance));
    const from = dateOnly(a.openingDate) ?? '0000-00-00';
    for (const t of paid) {
      const mine = t.accountId === a.id || (t.accountId === null && def?.id === a.id);
      if (!mine) continue;
      const day = dateOnly(t.paymentDate);
      if (!day || day < from) continue;
      bal += (t.type === 'receita' ? 1 : -1) * cents(num(t.value));
    }
    return {
      id: a.id,
      name: a.name,
      kind: a.kind,
      openingBalance: num(a.openingBalance),
      openingDate: from,
      isDefault: a.isDefault,
      active: a.active,
      balance: bal / 100,
    };
  });
}

export interface AccountInput {
  name?: string;
  kind?: string;
  openingBalance?: number;
  openingDate?: string;
  isDefault?: boolean;
  active?: boolean;
}

export async function saveAccount(id: string | null, input: AccountInput) {
  if (id === null && !input.name?.trim()) throw badRequest('Dê um nome para a conta.');
  const count = await prisma.financialAccount.count();
  const makeDefault = input.isDefault || (id === null && count === 0);
  if (makeDefault) await prisma.financialAccount.updateMany({ data: { isDefault: false } });
  const data = {
    ...(input.name !== undefined ? { name: input.name.trim() } : {}),
    ...(input.kind !== undefined ? { kind: input.kind } : {}),
    ...(input.openingBalance !== undefined ? { openingBalance: input.openingBalance } : {}),
    ...(input.openingDate !== undefined ? { openingDate: toDate(input.openingDate) } : {}),
    ...(input.active !== undefined ? { active: input.active } : {}),
    ...(makeDefault ? { isDefault: true } : input.isDefault === false ? { isDefault: false } : {}),
  };
  if (id === null) return prisma.financialAccount.create({ data: { name: input.name!.trim(), ...data } });
  const exists = await prisma.financialAccount.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw notFound('Conta');
  return prisma.financialAccount.update({ where: { id }, data });
}

// ─── Fornecedores ───────────────────────────────────────────────────────────

export async function listSuppliers() {
  const rows = await prisma.supplier.findMany({ orderBy: { name: 'asc' } });
  return rows.map((s) => ({ id: s.id, name: s.name, document: s.document, phone: s.phone, notes: s.notes, active: s.active }));
}

export async function saveSupplier(id: string | null, input: { name?: string; document?: string | null; phone?: string | null; notes?: string | null; active?: boolean }) {
  if (id === null) {
    if (!input.name?.trim()) throw badRequest('Informe o nome do fornecedor.');
    return prisma.supplier.create({ data: { name: input.name.trim(), document: input.document ?? null, phone: input.phone ?? null, notes: input.notes ?? null } });
  }
  const exists = await prisma.supplier.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw notFound('Fornecedor');
  return prisma.supplier.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.document !== undefined ? { document: input.document } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
    },
  });
}

// ─── Despesas ───────────────────────────────────────────────────────────────

export interface ExpenseInput {
  description: string;
  category: string;
  value: number;
  /** Vencimento (ou da 1ª parcela). */
  dueDate: string;
  installments: number;
  paid: boolean;
  paymentDate?: string | null;
  accountId?: string | null;
  supplierId?: string | null;
  notes?: string | null;
}

export async function createExpense(input: ExpenseInput): Promise<{ created: number }> {
  if (!(input.value > 0)) throw badRequest('Informe o valor.');
  if (input.paid && input.installments > 1) throw badRequest('Despesa parcelada não pode ser lançada como já paga. Pague parcela por parcela.');
  const parts = splitInstallments(cents(input.value), input.installments, input.dueDate);
  const today = todayBr();
  await prisma.financialTransaction.createMany({
    data: parts.map((p) => ({
      type: 'despesa' as const,
      description: parts.length > 1 ? `${input.description} (${p.number}/${parts.length})` : input.description,
      category: input.category,
      value: p.cents / 100,
      issueDate: toDate(today),
      dueDate: toDate(p.dueDate),
      paymentDate: input.paid ? toDate(input.paymentDate || today) : null,
      status: input.paid ? ('pago' as const) : ('pendente' as const),
      accountId: input.accountId ?? null,
      supplierId: input.supplierId ?? null,
      installment: parts.length > 1 ? `${p.number}/${parts.length}` : null,
      notes: input.notes ?? null,
    })),
  });
  return { created: parts.length };
}

// ─── Compras ────────────────────────────────────────────────────────────────

export interface PurchaseInput {
  supplierId?: string | null;
  accountId?: string | null;
  date: string;
  document?: string | null;
  category: string;
  items: Array<{ description: string; quantity: number; unit?: string | null; unitPrice: number }>;
  installments: number;
  firstDue: string;
  paid: boolean;
  notes?: string | null;
}

export async function createPurchase(input: PurchaseInput) {
  const items = input.items.filter((i) => i.description.trim() && i.quantity > 0 && i.unitPrice >= 0);
  if (items.length === 0) throw badRequest('Inclua ao menos um item na compra.');
  if (input.paid && input.installments > 1) throw badRequest('Compra parcelada não pode ser lançada como já paga.');
  const lines = items.map((i) => ({ ...i, total: r2(i.quantity * i.unitPrice) }));
  const total = lines.reduce((s, l) => s + cents(l.total), 0);
  if (total <= 0) throw badRequest('O total da compra está zerado.');

  let supplierName = '';
  if (input.supplierId) {
    const s = await prisma.supplier.findUnique({ where: { id: input.supplierId }, select: { name: true } });
    if (!s) throw notFound('Fornecedor');
    supplierName = s.name;
  }
  const parts = splitInstallments(total, input.installments, input.firstDue);
  const label = `Compra${supplierName ? ` ${supplierName}` : ''}${input.document ? ` · NF ${input.document}` : ''}`;
  const purchase = await prisma.purchase.create({
    data: {
      supplierId: input.supplierId ?? null,
      accountId: input.accountId ?? null,
      date: toDate(input.date),
      document: input.document ?? null,
      category: input.category,
      total: total / 100,
      installments: parts.length,
      notes: input.notes ?? null,
      items: { create: lines.map((l) => ({ description: l.description.trim(), quantity: l.quantity, unit: l.unit ?? null, unitPrice: l.unitPrice, total: l.total })) },
      transactions: {
        create: parts.map((p) => ({
          type: 'despesa' as const,
          description: parts.length > 1 ? `${label} (${p.number}/${parts.length})` : label,
          category: input.category,
          value: p.cents / 100,
          issueDate: toDate(input.date),
          dueDate: toDate(p.dueDate),
          paymentDate: input.paid ? toDate(input.date) : null,
          status: input.paid ? ('pago' as const) : ('pendente' as const),
          accountId: input.accountId ?? null,
          supplierId: input.supplierId ?? null,
          installment: parts.length > 1 ? `${p.number}/${parts.length}` : null,
        })),
      },
    },
    select: { id: true, total: true },
  });
  return { id: purchase.id, total: num(purchase.total), installments: parts.length };
}

export interface PurchaseDTO {
  id: string;
  date: string;
  supplier: string | null;
  document: string | null;
  category: string;
  total: number;
  installments: number;
  paidCount: number;
  items: Array<{ description: string; quantity: number; unit: string | null; unitPrice: number; total: number }>;
}

export async function listPurchases(limit = 100): Promise<PurchaseDTO[]> {
  const rows = await prisma.purchase.findMany({
    orderBy: { date: 'desc' },
    take: limit,
    include: { supplier: { select: { name: true } }, items: true, transactions: { select: { status: true } } },
  });
  return rows.map((p) => ({
    id: p.id,
    date: dateOnly(p.date)!,
    supplier: p.supplier?.name ?? null,
    document: p.document,
    category: p.category,
    total: num(p.total),
    installments: p.installments,
    paidCount: p.transactions.filter((t) => t.status === 'pago').length,
    items: p.items.map((i) => ({ description: i.description, quantity: num(i.quantity), unit: i.unit, unitPrice: num(i.unitPrice), total: num(i.total) })),
  }));
}

export async function deletePurchase(id: string) {
  const p = await prisma.purchase.findUnique({ where: { id }, include: { transactions: { select: { status: true } } } });
  if (!p) throw notFound('Compra');
  if (p.transactions.some((t) => t.status === 'pago')) throw conflict('Esta compra já tem parcela paga. Estorne o pagamento no Financeiro antes de excluir.');
  await prisma.purchase.delete({ where: { id } });
}

// ─── Despesas recorrentes ───────────────────────────────────────────────────

export async function listRecurring() {
  const rows = await prisma.recurringExpense.findMany({ orderBy: [{ active: 'desc' }, { dayOfMonth: 'asc' }], include: { supplier: { select: { name: true } } } });
  return rows.map((r) => ({
    id: r.id,
    description: r.description,
    category: r.category,
    value: num(r.value),
    dayOfMonth: r.dayOfMonth,
    supplierId: r.supplierId,
    supplier: r.supplier?.name ?? null,
    accountId: r.accountId,
    active: r.active,
  }));
}

export async function saveRecurring(
  id: string | null,
  input: { description?: string; category?: string; value?: number; dayOfMonth?: number; supplierId?: string | null; accountId?: string | null; active?: boolean },
) {
  if (id === null) {
    if (!input.description?.trim() || !input.category || !(input.value && input.value > 0) || !input.dayOfMonth) throw badRequest('Preencha descrição, categoria, valor e dia do vencimento.');
    return prisma.recurringExpense.create({
      data: { description: input.description.trim(), category: input.category, value: input.value, dayOfMonth: input.dayOfMonth, supplierId: input.supplierId ?? null, accountId: input.accountId ?? null },
    });
  }
  const exists = await prisma.recurringExpense.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw notFound('Despesa recorrente');
  return prisma.recurringExpense.update({
    where: { id },
    data: {
      ...(input.description !== undefined ? { description: input.description.trim() } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.value !== undefined ? { value: input.value } : {}),
      ...(input.dayOfMonth !== undefined ? { dayOfMonth: input.dayOfMonth } : {}),
      ...(input.supplierId !== undefined ? { supplierId: input.supplierId } : {}),
      ...(input.accountId !== undefined ? { accountId: input.accountId } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
    },
  });
}

export async function deleteRecurring(id: string) {
  await prisma.recurringExpense.delete({ where: { id } }).catch(() => {
    throw notFound('Despesa recorrente');
  });
}

/** Cria os lançamentos do mês (e do próximo) que ainda não existem. Pode rodar quantas vezes quiser. */
export async function generateRecurring(month = todayBr().slice(0, 7)): Promise<{ created: number }> {
  const list = await prisma.recurringExpense.findMany({ where: { active: true } });
  if (list.length === 0) return { created: 0 };
  const today = todayBr();
  const res = await prisma.financialTransaction.createMany({
    data: list.map((r) => ({
      type: 'despesa' as const,
      description: r.description,
      category: r.category,
      value: r.value,
      issueDate: toDate(today),
      dueDate: toDate(dueInMonth(month, r.dayOfMonth)),
      status: 'pendente' as const,
      accountId: r.accountId,
      supplierId: r.supplierId,
      recurringId: r.id,
      competence: month,
    })),
    skipDuplicates: true,
  });
  return { created: res.count };
}

// ─── Agenda (a pagar / a receber) ───────────────────────────────────────────

export interface AgendaItem {
  id: string;
  description: string;
  category: string | null;
  who: string | null;
  orderNumero: number | null;
  value: number;
  dueDate: string | null;
  daysLate: number;
  installment: string | null;
  recurring: boolean;
}

export async function agenda(type: 'receita' | 'despesa'): Promise<{ today: string; items: AgendaItem[] }> {
  const today = todayBr();
  const rows = await prisma.financialTransaction.findMany({
    where: { type, status: { in: ['pendente', 'atrasado'] } },
    orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
    take: 1000,
    select: {
      id: true, description: true, category: true, value: true, dueDate: true, installment: true, recurringId: true,
      supplier: { select: { name: true } },
      order: { select: { numero: true, status: true, customer: { select: { tradeName: true } } } },
    },
  });
  const items: AgendaItem[] = [];
  for (const r of rows) {
    if (r.order?.status === 'cancelado') continue;
    const due = dateOnly(r.dueDate);
    items.push({
      id: r.id,
      description: r.description,
      category: r.category,
      who: r.order?.customer.tradeName ?? r.supplier?.name ?? null,
      orderNumero: r.order?.numero ?? null,
      value: num(r.value),
      dueDate: due,
      daysLate: due ? Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${due}T12:00:00Z`)) / 86_400_000) : 0,
      installment: r.installment,
      recurring: !!r.recurringId,
    });
  }
  return { today, items };
}

// ─── Resumo do mês ──────────────────────────────────────────────────────────

export interface FinanceSummary {
  month: string;
  today: string;
  accounts: AccountDTO[];
  totalBalance: number | null;
  cash: { in: number; out: number; net: number; prevIn: number; prevOut: number };
  open: { receivable: number; receivableOverdue: number; payable: number; payableOverdue: number; payableNext7: number; payableNext7Count: number };
  series: Array<{ month: string; in: number; out: number }>;
  expensesByCategory: Array<{ category: string; value: number; group: string }>;
  result: { revenue: number; cogs: number; commissions: number; grossProfit: number; operating: number; netProfit: number; marginPct: number | null; orders: number };
}

function monthRange(month: string) {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 0));
  return { start, end, startIso: start.toISOString().slice(0, 10), endIso: end.toISOString().slice(0, 10) };
}

function shiftMonth(month: string, k: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + k, 1));
  return d.toISOString().slice(0, 7);
}

export async function financeSummary(monthArg?: string): Promise<FinanceSummary> {
  const today = todayBr();
  const month = monthArg && /^\d{4}-\d{2}$/.test(monthArg) ? monthArg : today.slice(0, 7);
  const { start, end, startIso, endIso } = monthRange(month);
  const seriesFrom = monthRange(shiftMonth(month, -5)).start;

  const [accounts, paid, open, orders, expenses] = await Promise.all([
    listAccounts(),
    prisma.financialTransaction.findMany({
      where: { status: 'pago', paymentDate: { gte: seriesFrom, lte: end } },
      select: { type: true, value: true, paymentDate: true, category: true },
    }),
    prisma.financialTransaction.findMany({
      where: { status: { in: ['pendente', 'atrasado'] } },
      select: { type: true, value: true, dueDate: true, order: { select: { status: true } } },
    }),
    prisma.order.findMany({
      where: { status: { not: 'cancelado' }, orderDate: { gte: start, lte: end } },
      select: { subtotal: true, discount: true, commissionVal: true, items: { select: { quantity: true, unitCost: true, product: { select: { cost: true } } } } },
    }),
    prisma.financialTransaction.findMany({
      where: { type: 'despesa', status: { not: 'cancelado' }, issueDate: { gte: start, lte: end } },
      select: { value: true, category: true },
    }),
  ]);

  // Caixa (regime de caixa: pelo dia do pagamento)
  const series = new Map<string, { in: number; out: number }>();
  for (let k = -5; k <= 0; k++) series.set(shiftMonth(month, k), { in: 0, out: 0 });
  for (const t of paid) {
    const m = dateOnly(t.paymentDate)!.slice(0, 7);
    const row = series.get(m);
    if (!row) continue;
    if (t.type === 'receita') row.in += num(t.value);
    else row.out += num(t.value);
  }
  const cur = series.get(month)!;
  const prev = series.get(shiftMonth(month, -1)) ?? { in: 0, out: 0 };

  // Despesas pagas no mês por categoria
  const byCat = new Map<string, number>();
  for (const t of paid) {
    if (t.type !== 'despesa' || dateOnly(t.paymentDate)!.slice(0, 7) !== month) continue;
    const c = t.category || 'Sem categoria';
    byCat.set(c, (byCat.get(c) ?? 0) + num(t.value));
  }

  // Em aberto
  const o = { receivable: 0, receivableOverdue: 0, payable: 0, payableOverdue: 0, payableNext7: 0, payableNext7Count: 0 };
  const in7 = addDays(today, 7);
  for (const t of open) {
    if (t.order?.status === 'cancelado') continue;
    const v = num(t.value);
    const due = dateOnly(t.dueDate);
    if (t.type === 'receita') {
      o.receivable += v;
      if (due && due < today) o.receivableOverdue += v;
    } else {
      o.payable += v;
      if (due && due < today) o.payableOverdue += v;
      else if (due && due <= in7) {
        o.payableNext7 += v;
        o.payableNext7Count += 1;
      }
    }
  }

  // Resultado do mês (competência): pedidos do mês − custo dos produtos − comissão − despesas operacionais
  let revenue = 0, cogs = 0, commissions = 0;
  for (const ord of orders) {
    revenue += num(ord.subtotal) - num(ord.discount);
    commissions += num(ord.commissionVal);
    for (const i of ord.items) cogs += num(i.quantity) * (i.unitCost != null ? num(i.unitCost) : num(i.product.cost));
  }
  let operating = 0;
  for (const e of expenses) {
    if (e.category === CATEGORY_COMMISSION) continue; // já contada pelas comissões dos pedidos
    if (categoryGroup(e.category) === 'estoque' || categoryGroup(e.category) === 'investimento') continue; // vira custo/ativo, não despesa do mês
    operating += num(e.value);
  }
  const gross = revenue - cogs - commissions;
  const net = gross - operating;

  return {
    month,
    today,
    accounts,
    totalBalance: accounts.some((a) => a.active) ? r2(accounts.filter((a) => a.active).reduce((s, a) => s + a.balance, 0)) : null,
    cash: { in: r2(cur.in), out: r2(cur.out), net: r2(cur.in - cur.out), prevIn: r2(prev.in), prevOut: r2(prev.out) },
    open: Object.fromEntries(Object.entries(o).map(([k, v]) => [k, r2(v)])) as FinanceSummary['open'],
    series: [...series.entries()].map(([m, v]) => ({ month: m, in: r2(v.in), out: r2(v.out) })),
    expensesByCategory: [...byCat.entries()].map(([category, value]) => ({ category, value: r2(value), group: categoryGroup(category) })).sort((a, b) => b.value - a.value),
    result: {
      revenue: r2(revenue), cogs: r2(cogs), commissions: r2(commissions), grossProfit: r2(gross), operating: r2(operating), netProfit: r2(net),
      marginPct: revenue > 0 ? Math.round((net / revenue) * 1000) / 10 : null,
      orders: orders.length,
    },
  };
}

// ─── Fluxo de caixa ─────────────────────────────────────────────────────────

export interface CashflowDTO extends Cashflow {
  today: string;
  startBalance: number | null;
}

export async function cashflow(weeks = 8): Promise<CashflowDTO> {
  const today = todayBr();
  const w = Math.min(Math.max(Math.round(weeks), 2), 26);
  const [accounts, open] = await Promise.all([
    listAccounts(),
    prisma.financialTransaction.findMany({
      where: { status: { in: ['pendente', 'atrasado'] } },
      select: { type: true, value: true, dueDate: true, issueDate: true, order: { select: { status: true } } },
    }),
  ]);
  const active = accounts.filter((a) => a.active);
  const start = active.length ? active.reduce((s, a) => s + a.balance, 0) : null;
  const items = open
    .filter((t) => t.order?.status !== 'cancelado')
    .map((t) => ({ date: dateOnly(t.dueDate) ?? dateOnly(t.issueDate) ?? today, cents: cents(num(t.value)), type: t.type as 'receita' | 'despesa' }));
  const flow = projectCashflow({ startCents: cents(start ?? 0), today, weeks: w, items });
  return { ...flow, today, startBalance: start };
}
