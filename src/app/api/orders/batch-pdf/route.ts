import { NextResponse } from 'next/server';
import { z } from 'zod';

import { requireUser } from '@/server/auth/guard';
import { badRequest } from '@/server/http/errors';
import { readJson, route } from '@/server/http/respond';
import { getOrder } from '@/server/services/orders';
import { renderOrdersBatchPdf } from '@/server/services/order-pdf';
import type { OrderDTO } from '@/server/services/serializers';

const batchPdfSchema = z.object({
  ids: z.array(z.string().uuid('ID de pedido inválido.')).min(1, 'Selecione ao menos um pedido para impressão.'),
});

export const POST = route('pedidos.batchPdf', async (request) => {
  const session = await requireUser();
  const body = await readJson(request);
  const parsed = batchPdfSchema.safeParse(body);

  if (!parsed.success) {
    throw badRequest(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
  }

  const { ids } = parsed.data;

  const orders: OrderDTO[] = [];
  for (const id of ids) {
    try {
      const order = await getOrder(session, id);
      if (order) {
        orders.push(order);
      }
    } catch {
      // Ignora pedidos inacessíveis ou deletados
    }
  }

  if (orders.length === 0) {
    throw badRequest('Nenhum pedido válido encontrado para impressão.');
  }

  const pdf = await renderOrdersBatchPdf(orders);

  return new NextResponse(pdf as unknown as BodyInit, {
    status: 200,
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': 'inline; filename="pedidos-lote.pdf"',
      'cache-control': 'no-store',
    },
  });
});
