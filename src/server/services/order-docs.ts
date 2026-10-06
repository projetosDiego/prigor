/**
 * Área de documentos do cliente: link secreto por pedido (sem login) com
 * espelho do pedido, boleto e nota fiscal. Ver `domain/order-link.ts`.
 *
 * Só mostra o que já está pronto: boleto registrado/pago e nota autorizada.
 */
import { prisma } from '../db';
import { env } from '../env';
import { notFound, rateLimited } from '../http/errors';
import { clientIp, hit } from '../http/rate-limit';
import { buildOrderDocsRef, verifyOrderDocsRef } from '../domain/order-link';
import type { PublicOrderAccess } from './doc-access';
import { num } from './serializers';

export function orderDocsRef(orderId: string): string {
  return buildOrderDocsRef(orderId, env().JWT_SECRET);
}

export function orderDocsUrl(orderId: string): string {
  return `${env().APP_URL.replace(/\/$/, '')}/pedido/documentos/${orderDocsRef(orderId)}`;
}

/** orderId do link, ou 404 (mesma resposta para link inválido e pedido inexistente). */
export function resolveOrderDocsRef(ref: string): string {
  const orderId = verifyOrderDocsRef(decodeURIComponent(ref), env().JWT_SECRET);
  if (!orderId) throw notFound('Pedido');
  return orderId;
}

/** Rotas públicas de download: limite por IP + validação do link. */
export function publicDocAccess(request: Request, ref: string): PublicOrderAccess {
  const limit = hit(`docs:${clientIp(request)}`, 40, 60);
  if (!limit.allowed) {
    throw rateLimited(`Muitos downloads seguidos. Tente de novo em ${limit.retryAfterSeconds} segundos.`);
  }
  return { publicOrderId: resolveOrderDocsRef(ref) };
}

export interface PublicOrderDocuments {
  orderId: string;
  numero: number;
  customerName: string;
  orderDate: string | null;
  dueDate: string | null;
  total: number;
  paymentMethod: string;
  cancelled: boolean;
  /** Espelho do pedido liberado (preço negociado precisa de aprovação). */
  orderPdf: boolean;
  boletos: {
    id: string;
    value: number;
    dueDate: string | null;
    paid: boolean;
    linhaDigitavel: string | null;
  }[];
  invoices: { id: string; number: number | null; series: number | null; authorizedAt: string | null }[];
}

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export async function publicOrderDocuments(ref: string): Promise<PublicOrderDocuments | null> {
  let orderId: string;
  try {
    orderId = resolveOrderDocsRef(ref);
  } catch {
    return null;
  }
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      customer: { select: { tradeName: true, legalName: true } },
      boletos: {
        where: { status: { in: ['registrado', 'pago'] }, nossoNumero: { not: null } },
        orderBy: { createdAt: 'desc' },
      },
      invoices: {
        where: { status: 'autorizada', providerId: { not: null } },
        orderBy: { createdAt: 'desc' },
      },
    },
  });
  if (!order) return null;

  return {
    orderId: order.id,
    numero: order.numero,
    customerName: order.customer.tradeName || order.customer.legalName || '',
    orderDate: day(order.orderDate),
    dueDate: day(order.dueDate),
    total: num(order.total),
    paymentMethod: order.paymentMethod,
    cancelled: order.status === 'cancelado',
    orderPdf: !order.hasNegotiatedPrice || order.approvedByAdmin,
    boletos: order.boletos.map((b) => ({
      id: b.id,
      value: num(b.value),
      dueDate: day(b.dueDate),
      paid: b.status === 'pago',
      linhaDigitavel: b.linhaDigitavel,
    })),
    invoices: order.invoices.map((i) => ({
      id: i.id,
      number: i.number,
      series: i.series,
      authorizedAt: i.authorizedAt ? i.authorizedAt.toISOString() : null,
    })),
  };
}
