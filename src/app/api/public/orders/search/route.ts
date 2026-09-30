import { prisma } from '@/server/db';
import { ok, route } from '@/server/http/respond';
import { num } from '@/server/services/serializers';

export const GET = route('public.orders.search', async (request) => {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') || '').trim();

  if (q.length < 2) {
    return ok({ orders: [] });
  }

  const cleanDigits = q.replace(/\D/g, '');
  const asNumber = Number(q);
  const isOrderNumber = Number.isInteger(asNumber) && asNumber > 0 && asNumber < 1000000;

  const orders = await prisma.order.findMany({
    where: {
      OR: [
        ...(isOrderNumber ? [{ numero: asNumber }] : []),
        { customer: { tradeName: { contains: q, mode: 'insensitive' } } },
        { customer: { legalName: { contains: q, mode: 'insensitive' } } },
        ...(cleanDigits.length >= 3
          ? [
              { customer: { cnpj: { contains: cleanDigits } } },
              { customer: { cpf: { contains: cleanDigits } } },
              { customer: { phone: { contains: cleanDigits } } },
            ]
          : []),
      ],
    },
    include: {
      customer: {
        select: {
          tradeName: true,
          legalName: true,
          cnpj: true,
          cpf: true,
        },
      },
      seller: {
        select: {
          name: true,
          code: true,
        },
      },
      items: {
        include: {
          product: {
            select: { name: true, unit: true },
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 30,
  });

  const formatted = orders.map((o) => {
    const canDownloadPdf = !o.hasNegotiatedPrice || o.approvedByAdmin;
    return {
      id: o.id,
      numero: o.numero,
      orderDate: o.orderDate ? o.orderDate.toISOString().split('T')[0] : null,
      deliveryDate: o.deliveryDate ? o.deliveryDate.toISOString().split('T')[0] : null,
      status: o.status,
      paymentMethod: o.paymentMethod,
      total: num(o.total),
      hasNegotiatedPrice: o.hasNegotiatedPrice,
      approvedByAdmin: o.approvedByAdmin,
      canDownloadPdf,
      lockReason:
        !canDownloadPdf
          ? 'Pedido com valor negociado. Impressão bloqueada aguardando aprovação da gerência.'
          : null,
      customerName: o.customer.tradeName || o.customer.legalName,
      customerDoc: o.customer.cnpj || o.customer.cpf,
      sellerName: o.seller?.name ?? null,
      itemsCount: o.items.length,
      itemsSummary: o.items.map((i) => `${num(i.quantity)}x ${i.product.name}`).join(', '),
    };
  });

  return ok({ orders: formatted });
});
