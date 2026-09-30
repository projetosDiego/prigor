import { NextResponse } from 'next/server';

import { prisma } from '@/server/db';
import { notFound } from '@/server/http/errors';
import { route } from '@/server/http/respond';

type Context = { params: Promise<{ id: string }> };

export const GET = route<Context>('public.orders.status', async (_request, { params }) => {
  const { id } = await params;

  const isNumber = /^\d+$/.test(id);
  const order = await prisma.order.findFirst({
    where: isNumber ? { numero: Number(id) } : { id },
    select: {
      id: true,
      numero: true,
      status: true,
      approvedByAdmin: true,
      hasNegotiatedPrice: true,
      deliveryDate: true,
      total: true,
    },
  });

  if (!order) {
    throw notFound('Pedido');
  }

  return NextResponse.json({
    id: order.id,
    numero: order.numero,
    status: order.status,
    approvedByAdmin: Boolean(order.approvedByAdmin),
    hasNegotiatedPrice: Boolean(order.hasNegotiatedPrice),
    deliveryDate: order.deliveryDate,
    total: Number(order.total),
  });
});
