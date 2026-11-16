import 'server-only';
import { createHmac } from 'node:crypto';
import type { ShopOrder } from '@prisma/client';

import { db } from '../db';
import { getSettings } from '../settings';
import type { StoredLine } from './types';

/**
 * Envio do pedido do site para o Doces Prigor OS (ERP).
 *
 * - Corpo JSON assinado: X-Prigor-Signature = sha256=HMAC(segredo, "<timestamp>.<corpo>")
 *   e X-Prigor-Timestamp (o ERP recusa assinatura com mais de 10 minutos).
 * - Idempotente: o ERP usa o código (NAT-0007) como chave; reenviar não duplica.
 * - Se o ERP estiver fora do ar, o pedido fica salvo aqui com status ERRO e é
 *   reenviado depois (botão no painel ou no próximo pedido).
 */
export type ErpResult = { ok: true; orderNumber: string } | { ok: false; error: string; disabled?: boolean };

export function buildErpPayload(o: ShopOrder) {
  const items = JSON.parse(o.items) as StoredLine[];
  const money = (cents: number) => (cents / 100).toFixed(2);
  return {
    source: 'site',
    campaign: o.campaign,
    code: o.code,
    createdAt: o.createdAt.toISOString(),
    customer: {
      type: o.customerType,
      document: o.document,
      name: o.name,
      companyName: o.companyName,
      phone: o.phone,
      email: o.email,
    },
    fulfillment: {
      type: o.fulfillment,
      pickupPoint: o.pickupPoint,
      address:
        o.fulfillment === 'ENTREGA'
          ? { zipCode: o.zipCode, street: o.street, number: o.number, complement: o.complement, neighborhood: o.neighborhood, city: o.city, state: o.state }
          : null,
    },
    deliveryDate: o.deliveryDate,
    payment: { plan: o.paymentPlan, method: o.paymentMethod, amountDue: money(o.amountDueCents) },
    items: items.map((l) => ({
      sku: l.sku,
      name: l.name,
      option: l.option,
      quantity: l.quantity,
      unitPrice: money(l.unitCents),
      discountPct: l.discountPct,
    })),
    totals: { subtotal: money(o.subtotalCents), discount: money(o.discountCents), total: money(o.totalCents) },
    notes: o.notes,
  };
}

export async function sendOrderToErp(order: ShopOrder): Promise<ErpResult> {
  const { integrations } = await getSettings();
  // O painel tem prioridade; sem nada lá, vale o que o servidor recebeu por variável de ambiente.
  const url = (integrations.erpOrdersUrl.trim() || process.env.ERP_ORDERS_URL || '').trim();
  const secret = integrations.erpOrdersSecret || process.env.SITE_ORDERS_SECRET || '';
  if (!url || !secret) {
    await db.shopOrder.update({ where: { id: order.id }, data: { erpStatus: 'DESLIGADO', erpError: '' } });
    return { ok: false, error: 'Integração com o ERP não configurada.', disabled: true };
  }

  const body = JSON.stringify(buildErpPayload(order));
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');

  let result: ErpResult;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-prigor-timestamp': timestamp, 'x-prigor-signature': `sha256=${signature}` },
      body,
      signal: AbortSignal.timeout(10000),
      cache: 'no-store',
    });
    const data = (await res.json().catch(() => ({}))) as { orderNumber?: number | string; error?: { message?: string }; detail?: string };
    result = res.ok && data.orderNumber != null
      ? { ok: true, orderNumber: String(data.orderNumber) }
      : { ok: false, error: data.error?.message || data.detail || `ERP respondeu ${res.status}` };
  } catch (e) {
    result = { ok: false, error: e instanceof Error && e.name === 'TimeoutError' ? 'ERP não respondeu a tempo.' : 'Não foi possível falar com o ERP.' };
  }

  await db.shopOrder.update({
    where: { id: order.id },
    data: result.ok
      ? { erpStatus: 'ENVIADO', erpOrderNumber: result.orderNumber, erpError: '', erpSentAt: new Date(), erpAttempts: { increment: 1 } }
      : { erpStatus: 'ERRO', erpError: result.error.slice(0, 500), erpAttempts: { increment: 1 } },
  });
  return result;
}

/** Reenvia pedidos que ainda não chegaram ao ERP (mais antigos primeiro). */
export async function retryPendingOrders(limit = 5, exceptId?: string): Promise<{ sent: number; failed: number }> {
  const pending = await db.shopOrder.findMany({
    where: { erpStatus: { in: ['PENDENTE', 'ERRO', 'DESLIGADO'] }, status: { not: 'CANCELADO' }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    orderBy: { createdAt: 'asc' },
    take: limit,
  });
  let sent = 0;
  let failed = 0;
  for (const o of pending) {
    const r = await sendOrderToErp(o);
    if (r.ok) sent++;
    else {
      failed++;
      if (r.disabled) break;
    }
  }
  return { sent, failed };
}
