import { NextResponse } from 'next/server';
import { z } from 'zod';

import { requireUser } from '@/server/auth/guard';
import { badRequest } from '@/server/http/errors';
import { readJson, route } from '@/server/http/respond';
import { getOrder } from '@/server/services/orders';
import { renderOrdersBatchPdf } from '@/server/services/order-pdf';
import { renderBatchWithDocuments } from '@/server/services/batch-print';
import type { OrderDTO } from '@/server/services/serializers';

const batchPdfSchema = z.object({
  ids: z
    .array(z.string().uuid('ID de pedido inválido.'))
    .min(1, 'Selecione ao menos um pedido para impressão.')
    .max(100, 'Selecione no máximo 100 pedidos por vez.'),
  /** Junta NF e boleto de cada pedido (gerência). Padrão: sim. */
  withDocuments: z.boolean().default(true),
});

export const POST = route('pedidos.batchPdf', async (request) => {
  const session = await requireUser();
  const body = await readJson(request);
  const parsed = batchPdfSchema.safeParse(body);

  if (!parsed.success) {
    throw badRequest(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
  }

  const { ids, withDocuments } = parsed.data;

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

  if (!withDocuments) {
    const pdf = await renderOrdersBatchPdf(orders);
    return new NextResponse(pdf as unknown as BodyInit, {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': 'inline; filename="pedidos-lote.pdf"',
        'cache-control': 'no-store',
      },
    });
  }

  const { pdf, warnings, summary } = await renderBatchWithDocuments(session, orders);
  return new NextResponse(pdf as unknown as BodyInit, {
    status: 200,
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': 'inline; filename="pedidos-lote.pdf"',
      'cache-control': 'no-store',
      // Resumo para a tela (cabeçalho só ASCII: vai em base64).
      'x-lote-resumo': Buffer.from(JSON.stringify({ summary, warnings }), 'utf8').toString('base64'),
    },
  });
});
