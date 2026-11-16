import { after } from 'next/server';
import { NextResponse } from 'next/server';

import { retryPendingOrders, sendOrderToErp } from '@/lib/orders/erp';
import { createShopOrder } from '@/lib/orders/service';
import { orderPath } from '@/lib/orders/token';
import { clientIp, rateLimit } from '@/lib/rate-limit';

/** Recebe o pedido do checkout do site. */
export async function POST(request: Request) {
  if (!rateLimit(`order:${clientIp(request.headers)}`, 10, 10 * 60 * 1000)) {
    return NextResponse.json({ error: 'Muitos pedidos seguidos. Aguarde alguns minutos ou fale pelo WhatsApp.' }, { status: 429 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 });
  }
  // Honeypot: robôs preenchem o campo escondido. Respondemos como se fosse sucesso.
  if (body && typeof body === 'object' && 'website' in body && (body as { website?: string }).website) {
    return NextResponse.json({ ok: true, redirect: '/natal2026' });
  }

  const result = await createShopOrder(body);
  if (!result.ok) return NextResponse.json({ error: result.error, field: result.field }, { status: 422 });

  const order = result.order;
  // Manda para o ERP depois de responder ao cliente: a confirmação não espera o ERP.
  after(async () => {
    const sent = await sendOrderToErp(order);
    if (sent.ok) await retryPendingOrders(3, order.id);
  });

  return NextResponse.json({ ok: true, code: order.code, redirect: orderPath(order.code) });
}
