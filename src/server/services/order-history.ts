/**
 * Histórico / timeline de um pedido.
 *
 * Reaproveita a tabela `logs_auditoria` (model AuditLog), que já existia mas
 * estava sem uso. Cada evento relevante do pedido — criação, mudança de status,
 * baixa/estorno de pagamento — vira uma linha com entity = 'Order'.
 */
import { prisma } from '../db';
import { notFound } from '../http/errors';
import { isManagement, type SessionPayload } from '../auth/guard';
import type { Tx } from '../tx';

export type OrderEventAction =
  | 'criado'
  | 'status'
  | 'pagamento'
  | 'estorno_pagamento'
  | 'cancelado';

export interface OrderEventDTO {
  id: string;
  action: OrderEventAction | string;
  from: string | null;
  to: string | null;
  userName: string | null;
  createdAt: string;
}

interface LogArgs {
  orderId: string;
  userId?: string | null;
  action: OrderEventAction;
  from?: string | null;
  to?: string | null;
}

/**
 * Registra um evento do pedido. Recebe `tx` quando chamado de dentro de uma
 * transação (createOrder/updateOrder) e o `prisma` global caso contrário.
 * Nunca lança: o histórico é um extra e não pode derrubar a operação principal.
 */
export async function logOrderEvent(
  client: Tx | typeof prisma,
  { orderId, userId = null, action, from = null, to = null }: LogArgs,
): Promise<void> {
  try {
    await client.auditLog.create({
      data: {
        userId,
        action,
        entity: 'Order',
        entityId: orderId,
        oldValue: from != null ? { status: from } : undefined,
        newValue: to != null ? { status: to } : undefined,
      },
    });
  } catch {
    // Histórico é best-effort — não interrompe o pedido.
  }
}

/** Timeline de um pedido, do evento mais antigo ao mais recente. */
export async function getOrderHistory(
  session: SessionPayload,
  orderId: string,
): Promise<OrderEventDTO[]> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, sellerId: true },
  });
  if (!order) throw notFound('Pedido');
  if (!isManagement(session) && order.sellerId !== session.sellerId) {
    throw notFound('Pedido');
  }

  const rows = await prisma.auditLog.findMany({
    where: { entity: 'Order', entityId: orderId },
    orderBy: { createdAt: 'asc' },
    include: { user: { select: { name: true } } },
  });

  return rows.map((row): OrderEventDTO => {
    const oldVal = row.oldValue as { status?: string } | null;
    const newVal = row.newValue as { status?: string } | null;
    return {
      id: row.id,
      action: row.action,
      from: oldVal?.status ?? null,
      to: newVal?.status ?? null,
      userName: row.user?.name ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  });
}
