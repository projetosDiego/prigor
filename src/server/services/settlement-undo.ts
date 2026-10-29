/**
 * Desfazer baixas recentes: lista as baixas de pedidos feitas nas últimas horas
 * (pelo histórico do pedido) e estorna várias de uma vez.
 */
import { prisma } from '../db';
import { reverseSettlement } from './financial';

export interface RecentSettlementDTO {
  transactionId: string;
  orderId: string;
  numero: number;
  customerName: string;
  value: number;
  paidAt: string;
}

export async function listRecentSettlements(hours: number): Promise<RecentSettlementDTO[]> {
  const since = new Date(Date.now() - hours * 3600_000);
  const events = await prisma.auditLog.findMany({
    where: { entity: 'Order', action: { in: ['pagamento', 'estorno_pagamento'] }, createdAt: { gte: since } },
    orderBy: { createdAt: 'asc' },
    select: { entityId: true, action: true, createdAt: true },
  });

  // Último evento de cada pedido: só interessa quem terminou "pagamento".
  const last = new Map<string, { action: string; at: Date }>();
  for (const e of events) {
    if (e.entityId) last.set(e.entityId, { action: e.action, at: e.createdAt });
  }
  const orderIds = [...last.entries()].filter(([, v]) => v.action === 'pagamento').map(([id]) => id);
  if (orderIds.length === 0) return [];

  const txs = await prisma.financialTransaction.findMany({
    where: { orderId: { in: orderIds }, type: 'receita', status: 'pago' },
    include: { order: { select: { numero: true, customer: { select: { tradeName: true } } } } },
  });

  return txs
    .map((t) => ({
      transactionId: t.id,
      orderId: t.orderId as string,
      numero: t.order?.numero ?? 0,
      customerName: t.order?.customer?.tradeName ?? '—',
      value: Number(t.value),
      paidAt: (last.get(t.orderId as string)?.at ?? new Date()).toISOString(),
    }))
    .sort((a, b) => b.numero - a.numero);
}

export async function reverseMany(ids: string[]): Promise<{ done: number; failed: string[] }> {
  let done = 0;
  const failed: string[] = [];
  for (const id of ids) {
    try {
      await reverseSettlement(id);
      done += 1;
    } catch {
      failed.push(id);
    }
  }
  return { done, failed };
}
