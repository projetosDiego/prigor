/**
 * Crédito do cliente e baixa parcial de títulos.
 * Baixa parcial: o título original fica com o saldo em aberto e um novo título "pago" registra o que entrou.
 */
import { prisma } from '../db';
import { logger } from '../http/logger';
import { badRequest, conflict, notFound } from '../http/errors';
import type { SessionPayload } from '../auth/guard';
import { writeOffBoleto } from './boletos';
import { settleTransaction } from './financial';
import { num } from './serializers';

const cents = (v: number) => Math.round(v * 100);
const fromCents = (c: number) => c / 100;

/** Baixa `amountCents` de um título (total ou parcial) na data informada. */
export async function settleAmount(transactionId: string, amountCents: number, paymentDate: Date): Promise<{ partial: boolean }> {
  const tx = await prisma.financialTransaction.findUnique({ where: { id: transactionId } });
  if (!tx) throw notFound('Título');
  if (tx.type !== 'receita' || !['pendente', 'atrasado'].includes(tx.status)) throw conflict('O título não está mais em aberto.');
  const balance = cents(num(tx.value));
  if (amountCents <= 0 || amountCents > balance) throw badRequest('Valor da baixa inválido para este título.');
  if (amountCents === balance) {
    await settleTransaction(transactionId, paymentDate);
    return { partial: false };
  }
  await prisma.$transaction([
    prisma.financialTransaction.update({ where: { id: transactionId }, data: { value: fromCents(balance - amountCents) } }),
    prisma.financialTransaction.create({
      data: {
        type: 'receita',
        description: `${tx.description} (baixa parcial)`,
        category: tx.category,
        value: fromCents(amountCents),
        issueDate: tx.issueDate,
        dueDate: tx.dueDate,
        paymentDate,
        status: 'pago',
        orderId: tx.orderId,
        notes: tx.notes,
      },
    }),
  ]);
  return { partial: true };
}

/**
 * Pedido sem mais nada em aberto → baixa no banco os boletos ainda registrados (evita cobrar de novo).
 * Devolve avisos para mostrar à pessoa.
 */
export async function writeOffBoletosOfSettledOrders(session: SessionPayload, orderIds: string[]): Promise<{ count: number; warnings: string[] }> {
  const out = { count: 0, warnings: [] as string[] };
  for (const orderId of [...new Set(orderIds)]) {
    const open = await prisma.financialTransaction.count({ where: { orderId, type: 'receita', status: { in: ['pendente', 'atrasado'] } } });
    if (open > 0) continue;
    const boletos = await prisma.boleto.findMany({ where: { orderId, status: 'registrado' }, select: { id: true, seuNumero: true } });
    for (const b of boletos) {
      try {
        await writeOffBoleto(session, b.id);
        out.count += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.warn('Crédito/Pix: não consegui baixar o boleto no banco', { seuNumero: b.seuNumero, message });
        out.warnings.push(`Boleto ${b.seuNumero} continua registrado no banco: ${message}`);
      }
    }
  }
  return out;
}

export async function createCredit(input: { customerId: string; amount: number; source: 'pix' | 'devolucao' | 'manual'; note?: string | null }) {
  if (!(input.amount > 0)) throw badRequest('Valor do crédito inválido.');
  return prisma.customerCredit.create({
    data: { customerId: input.customerId, originalAmount: input.amount, remaining: input.amount, source: input.source, note: input.note ?? null },
  });
}

export interface CreditBalanceDTO {
  customerId: string;
  balance: number;
}

/** Saldo de crédito por cliente (só quem tem saldo). */
export async function creditBalances(customerIds?: string[]): Promise<Map<string, number>> {
  const rows = await prisma.customerCredit.groupBy({
    by: ['customerId'],
    where: { remaining: { gt: 0 }, ...(customerIds ? { customerId: { in: customerIds } } : {}) },
    _sum: { remaining: true },
  });
  return new Map(rows.map((r) => [r.customerId, num(r._sum.remaining)]));
}

/** Usa o crédito do cliente para abater (total ou parcial) um título em aberto dele. */
export async function applyCredit(session: SessionPayload, input: { customerId: string; transactionId: string; amount: number }) {
  const amountCents = cents(input.amount);
  if (amountCents <= 0) throw badRequest('Informe o valor a abater.');

  const tx = await prisma.financialTransaction.findUnique({
    where: { id: input.transactionId },
    select: { id: true, orderId: true, order: { select: { customerId: true } } },
  });
  if (!tx || tx.order?.customerId !== input.customerId) throw notFound('Título deste cliente');

  const credits = await prisma.customerCredit.findMany({ where: { customerId: input.customerId, remaining: { gt: 0 } }, orderBy: { createdAt: 'asc' } });
  const available = credits.reduce((s, c) => s + cents(num(c.remaining)), 0);
  if (amountCents > available) throw badRequest('O cliente não tem esse crédito disponível.');

  // Baixa primeiro (falha antes de gastar crédito); depois consome os créditos do mais antigo.
  await settleAmount(input.transactionId, amountCents, new Date());
  let left = amountCents;
  for (const c of credits) {
    if (left <= 0) break;
    const use = Math.min(left, cents(num(c.remaining)));
    // updateMany com saldo suficiente evita gastar crédito duas vezes em cliques simultâneos.
    await prisma.customerCredit.updateMany({ where: { id: c.id, remaining: { gte: fromCents(use) } }, data: { remaining: { decrement: fromCents(use) } } });
    left -= use;
  }
  const boletos = tx.orderId ? await writeOffBoletosOfSettledOrders(session, [tx.orderId]) : { count: 0, warnings: [] };
  return { applied: input.amount, boletosWrittenOff: boletos.count, warnings: boletos.warnings };
}
