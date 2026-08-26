/**
 * Contas a pagar e a receber.
 */
import { z } from 'zod';

import { dec } from '../domain/money';
import { prisma } from '../db';
import { conflict, notFound } from '../http/errors';
import { CATEGORY_COMMISSION } from './financial-sync';
import { paginated, toTransactionDTO, type Paginated, type TransactionDTO } from './serializers';
import type {
  transactionInputSchema,
  transactionListQuerySchema,
  transactionUpdateSchema,
} from '../validation/sales';

type TransactionInput = z.infer<typeof transactionInputSchema>;
type TransactionUpdate = z.infer<typeof transactionUpdateSchema>;
type TransactionQuery = z.infer<typeof transactionListQuerySchema>;

const TRANSACTION_INCLUDE = { order: { select: { numero: true } } };

export async function listTransactions(params: TransactionQuery): Promise<Paginated<TransactionDTO>> {
  const where: Record<string, unknown> = {};
  if (params.type) where.type = params.type;
  if (params.status) where.status = params.status;
  if (params.category) where.category = params.category;
  if (params.orderId) where.orderId = params.orderId;

  if (params.from || params.to) {
    where.issueDate = {
      ...(params.from ? { gte: params.from } : {}),
      ...(params.to ? { lte: params.to } : {}),
    };
  }

  const [rows, total] = await Promise.all([
    prisma.financialTransaction.findMany({
      where,
      include: TRANSACTION_INCLUDE,
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
    prisma.financialTransaction.count({ where }),
  ]);

  return paginated(rows.map(toTransactionDTO), total, params.page, params.pageSize);
}

export async function createTransaction(input: TransactionInput): Promise<TransactionDTO> {
  if (input.orderId) {
    const order = await prisma.order.findUnique({ where: { id: input.orderId }, select: { id: true } });
    if (!order) throw notFound('Pedido');
  }

  const created = await prisma.financialTransaction.create({
    data: {
      type: input.type,
      description: input.description,
      category: input.category,
      value: input.value,
      issueDate: input.issueDate,
      dueDate: input.dueDate,
      paymentDate: input.paymentDate,
      status: input.status,
      orderId: input.orderId,
      notes: input.notes,
    },
    include: TRANSACTION_INCLUDE,
  });

  return toTransactionDTO(created);
}

async function loadTransaction(id: string) {
  const row = await prisma.financialTransaction.findUnique({
    where: { id },
    include: TRANSACTION_INCLUDE,
  });
  if (!row) throw notFound('Lançamento');
  return row;
}

/**
 * Lançamento gerado por pedido é gerido pelo próprio pedido: alterar valor à
 * mão faria o financeiro divergir da venda. Só campos livres são editáveis.
 */
export async function updateTransaction(id: string, input: TransactionUpdate): Promise<TransactionDTO> {
  const existing = await loadTransaction(id);

  const isOrderGenerated = Boolean(existing.orderId);
  if (isOrderGenerated && input.value !== undefined) {
    throw conflict(
      'Este lançamento foi gerado por um pedido. Ajuste o pedido para alterar o valor.',
    );
  }

  if (existing.status === 'pago' && input.value !== undefined) {
    throw conflict('Lançamento já baixado. Estorne a baixa antes de alterar o valor.');
  }

  const updated = await prisma.financialTransaction.update({
    where: { id },
    data: {
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.value !== undefined ? { value: input.value } : {}),
      ...(input.dueDate !== undefined ? { dueDate: input.dueDate } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    },
    include: TRANSACTION_INCLUDE,
  });

  return toTransactionDTO(updated);
}

/** Baixa de pagamento. */
export async function settleTransaction(id: string, paymentDate: Date | null): Promise<TransactionDTO> {
  const existing = await loadTransaction(id);

  if (existing.status === 'pago') {
    throw conflict('Este lançamento já está baixado.');
  }
  if (existing.status === 'cancelado') {
    throw conflict('Lançamento cancelado não pode ser baixado.');
  }

  const updated = await prisma.financialTransaction.update({
    where: { id },
    data: { status: 'pago', paymentDate: paymentDate ?? today() },
    include: TRANSACTION_INCLUDE,
  });

  return toTransactionDTO(updated);
}

/** Estorno da baixa — não existia no sistema anterior. */
export async function reverseSettlement(id: string): Promise<TransactionDTO> {
  const existing = await loadTransaction(id);

  if (existing.status !== 'pago') {
    throw conflict('Este lançamento não está baixado.');
  }

  const updated = await prisma.financialTransaction.update({
    where: { id },
    data: { status: 'pendente', paymentDate: null },
    include: TRANSACTION_INCLUDE,
  });

  return toTransactionDTO(updated);
}

export async function deleteTransaction(id: string): Promise<void> {
  const existing = await loadTransaction(id);

  if (existing.orderId) {
    throw conflict(
      'Este lançamento pertence a um pedido. Cancele ou altere o pedido para removê-lo.',
    );
  }
  if (existing.status === 'pago') {
    throw conflict('Lançamento já baixado não pode ser excluído. Estorne a baixa primeiro.');
  }

  await prisma.financialTransaction.delete({ where: { id } });
}

/** Marca como atrasado tudo que venceu e continua pendente. */
export async function markOverdue(): Promise<number> {
  const result = await prisma.financialTransaction.updateMany({
    where: { status: 'pendente', dueDate: { lt: today() } },
    data: { status: 'atrasado' },
  });
  return result.count;
}

export interface CommissionSummary {
  transactionId: string;
  value: number;
  dueDate: string | null;
  paymentDate: string | null;
  status: string;
  orderId: string | null;
  orderNumber: number | null;
}

export async function listSellerCommissions(sellerId: string): Promise<CommissionSummary[]> {
  const rows = await prisma.financialTransaction.findMany({
    where: {
      type: 'despesa',
      category: CATEGORY_COMMISSION,
      order: { sellerId },
    },
    include: { order: { select: { numero: true } } },
    orderBy: { dueDate: 'desc' },
  });

  return rows.map((row: never) => {
    const dto = toTransactionDTO(row);
    return {
      transactionId: dto.id,
      value: dto.value,
      dueDate: dto.dueDate,
      paymentDate: dto.paymentDate,
      status: dto.status,
      orderId: dto.orderId,
      orderNumber: dto.orderNumber,
    };
  });
}

function today(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export { dec };
