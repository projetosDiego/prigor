/** Valores em aberto por cliente (para avisar no pedido que o cliente já deve). */
import { prisma } from '../db';
import { isManagement, type SessionPayload } from '../auth/guard';
import { creditBalances } from './credits';
import { todayBr } from './collections';
import { dateOnly, num } from './serializers';

export interface OpenBalanceTitle {
  orderId: string;
  numero: number;
  value: number;
  dueDate: string | null;
  overdue: boolean;
}

export interface OpenBalanceDTO {
  titles: OpenBalanceTitle[];
  credit: number;
}

export async function openBalancesByCustomer(session: SessionPayload): Promise<Record<string, OpenBalanceDTO>> {
  const today = todayBr();
  const rows = await prisma.financialTransaction.findMany({
    where: {
      type: 'receita',
      status: { in: ['pendente', 'atrasado'] },
      orderId: { not: null },
      ...(isManagement(session) ? {} : { order: { sellerId: session.sellerId ?? '__nenhum__' } }),
    },
    orderBy: { dueDate: 'asc' },
    take: 2000,
    select: { value: true, dueDate: true, order: { select: { id: true, numero: true, status: true, customerId: true } } },
  });
  const out: Record<string, OpenBalanceDTO> = {};
  for (const r of rows) {
    if (!r.order || r.order.status === 'cancelado') continue;
    const due = dateOnly(r.dueDate);
    const entry = (out[r.order.customerId] ??= { titles: [], credit: 0 });
    entry.titles.push({ orderId: r.order.id, numero: r.order.numero, value: num(r.value), dueDate: due, overdue: !!due && due < today });
  }
  if (isManagement(session)) {
    for (const [cid, credit] of await creditBalances()) {
      (out[cid] ??= { titles: [], credit: 0 }).credit = credit;
    }
  }
  return out;
}
