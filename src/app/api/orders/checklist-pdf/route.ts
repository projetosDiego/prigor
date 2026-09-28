import { NextResponse } from 'next/server';
import { z } from 'zod';

import { requireUser } from '@/server/auth/guard';
import { badRequest } from '@/server/http/errors';
import { readJson, route } from '@/server/http/respond';
import { getOrder, listOrders } from '@/server/services/orders';
import { renderChecklistPdf } from '@/server/services/order-pdf';
import type { OrderDTO } from '@/server/services/serializers';

const checklistPdfSchema = z.object({
  ids: z.array(z.string().uuid('ID de pedido inválido.')).optional(),
  date: z.string().optional(),
});

export const POST = route('pedidos.checklistPdfPost', async (request) => {
  const session = await requireUser();
  const body = await readJson(request).catch(() => ({}));
  const parsed = checklistPdfSchema.safeParse(body);

  if (!parsed.success) {
    throw badRequest(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
  }

  const { ids, date: dateParam } = parsed.data;
  const deliveryDate = dateParam || new Date().toISOString().slice(0, 10);

  const orders: OrderDTO[] = [];

  if (ids && ids.length > 0) {
    for (const id of ids) {
      try {
        const order = await getOrder(session, id);
        if (order) {
          orders.push(order);
        }
      } catch {
        // Ignora erros individuais de busca
      }
    }
  } else {
    // Busca pedidos agendados para a data
    const [y, m, d] = deliveryDate.split('-').map(Number);
    const start = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
    const end = new Date(Date.UTC(y, m - 1, d, 23, 59, 59));

    const result = await listOrders(session, {
      deliveryFrom: start,
      deliveryTo: end,
      pageSize: 200,
      page: 1,
    });
    orders.push(...result.data);
  }

  if (orders.length === 0) {
    throw badRequest('Nenhum pedido encontrado para a data informada.');
  }

  // Ordena por bairro e cliente para facilitar a conferência de carga
  orders.sort((a, b) => {
    const bairroA = (a.deliveryAddress?.neighborhood || a.billingAddress?.neighborhood || '').toLowerCase();
    const bairroB = (b.deliveryAddress?.neighborhood || b.billingAddress?.neighborhood || '').toLowerCase();
    if (bairroA !== bairroB) return bairroA.localeCompare(bairroB);
    return a.numero - b.numero;
  });

  const pdf = await renderChecklistPdf(orders, deliveryDate);

  return new NextResponse(pdf as unknown as BodyInit, {
    status: 200,
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `inline; filename="romaneio-conferencia-${deliveryDate}.pdf"`,
      'cache-control': 'no-store',
    },
  });
});

export const GET = route('pedidos.checklistPdfGet', async (request) => {
  const session = await requireUser();
  const { searchParams } = new URL(request.url);
  const deliveryDate = searchParams.get('date') || new Date().toISOString().slice(0, 10);

  const [y, m, d] = deliveryDate.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
  const end = new Date(Date.UTC(y, m - 1, d, 23, 59, 59));

  const result = await listOrders(session, {
    deliveryFrom: start,
    deliveryTo: end,
    pageSize: 200,
    page: 1,
  });

  if (result.data.length === 0) {
    throw badRequest('Nenhum pedido encontrado para esta data de entrega.');
  }

  const orders = [...result.data];
  orders.sort((a, b) => {
    const bairroA = (a.deliveryAddress?.neighborhood || a.billingAddress?.neighborhood || '').toLowerCase();
    const bairroB = (b.deliveryAddress?.neighborhood || b.billingAddress?.neighborhood || '').toLowerCase();
    if (bairroA !== bairroB) return bairroA.localeCompare(bairroB);
    return a.numero - b.numero;
  });

  const pdf = await renderChecklistPdf(orders, deliveryDate);

  return new NextResponse(pdf as unknown as BodyInit, {
    status: 200,
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `inline; filename="romaneio-conferencia-${deliveryDate}.pdf"`,
      'cache-control': 'no-store',
    },
  });
});
