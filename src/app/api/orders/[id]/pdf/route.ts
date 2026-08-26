import { NextResponse } from 'next/server';

import { requireUser } from '@/server/auth/guard';
import { route } from '@/server/http/respond';
import { getOrder } from '@/server/services/orders';
import { renderOrderPdf } from '@/server/services/order-pdf';

type Context = { params: Promise<{ id: string }> };

export const GET = route<Context>('pedidos.pdf', async (_request, { params }) => {
  const session = await requireUser();
  const { id } = await params;

  const order = await getOrder(session, id);
  const pdf = await renderOrderPdf(order);

  return new NextResponse(pdf as unknown as BodyInit, {
    status: 200,
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `inline; filename="pedido-${order.numero}.pdf"`,
      'cache-control': 'no-store',
    },
  });
});
