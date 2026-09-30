import { NextResponse } from 'next/server';

import { prisma } from '@/server/db';
import { forbidden, notFound } from '@/server/http/errors';
import { route } from '@/server/http/respond';
import { renderOrderPdf } from '@/server/services/order-pdf';
import { toOrderDTO } from '@/server/services/serializers';

type Context = { params: Promise<{ id: string }> };

export const GET = route<Context>('public.orders.pdf', async (_request, { params }) => {
  const { id } = await params;

  // Busca pedido pelo id ou pelo numero se for numérico
  const isNumber = /^\d+$/.test(id);
  const orderRow = await prisma.order.findFirst({
    where: isNumber ? { numero: Number(id) } : { id },
    include: {
      customer: {
        select: {
          tradeName: true,
          address: true,
          number: true,
          complement: true,
          neighborhood: true,
          city: true,
          state: true,
          zipCode: true,
          cnpj: true,
          cpf: true,
          legalName: true,
          latitude: true,
          longitude: true,
          phone: true,
          mobile: true,
        },
      },
      seller: { select: { name: true, commissionPct: true } },
      transactions: { where: { type: 'receita' as const, category: 'Vendas' }, select: { id: true, status: true }, take: 1 },
      deliveryAddress: { select: { label: true, address: true, number: true, complement: true, neighborhood: true, city: true, state: true, zipCode: true } },
      items: {
        include: { product: { select: { name: true, barCode: true, internalCode: true, sku: true, unit: true } } },
        orderBy: { id: 'asc' as const },
      },
    },
  });

  if (!orderRow) {
    throw notFound('Pedido');
  }

  const orderDTO = toOrderDTO(orderRow, { withAddress: true });
  const pdfBytes = await renderOrderPdf(orderDTO);

  return new NextResponse(pdfBytes as unknown as BodyInit, {
    status: 200,
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `inline; filename="pedido-${orderRow.numero}.pdf"`,
      'cache-control': 'no-store',
    },
  });
});
