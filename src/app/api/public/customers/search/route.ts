import { prisma } from '@/server/db';
import { badRequest } from '@/server/http/errors';
import { ok, route } from '@/server/http/respond';

export const GET = route('public.customers.search', async (request) => {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') || '').trim();

  if (q.length < 2) {
    return ok({ customers: [] });
  }

  const cleanDigits = q.replace(/\D/g, '');

  const rows = await prisma.customer.findMany({
    where: {
      active: true,
      OR: [
        { tradeName: { contains: q, mode: 'insensitive' } },
        { legalName: { contains: q, mode: 'insensitive' } },
        ...(cleanDigits.length >= 3
          ? [
              { cnpj: { contains: cleanDigits } },
              { cpf: { contains: cleanDigits } },
            ]
          : []),
      ],
    },
    select: {
      id: true,
      tradeName: true,
      legalName: true,
      cnpj: true,
      cpf: true,
      address: true,
      number: true,
      complement: true,
      neighborhood: true,
      city: true,
      state: true,
      zipCode: true,
      phone: true,
      mobile: true,
      boletoAllowed: true,
      seller: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
    },
    take: 10,
    orderBy: { tradeName: 'asc' },
  });

  return ok({ customers: rows });
});
