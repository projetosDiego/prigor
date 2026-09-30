import { prisma } from '@/server/db';
import { ok, route } from '@/server/http/respond';
import { num } from '@/server/services/serializers';

export const GET = route('public.products', async () => {
  // Busca produtos explicitamente liberados para o portal de autoatendimento
  let products = await prisma.product.findMany({
    where: {
      active: true,
      type: 'venda',
      availableInPortal: true,
    },
    select: {
      id: true,
      name: true,
      description: true,
      salePrice: true,
      wholesalePrice: true,
      minWholesaleQty: true,
      unit: true,
      category: true,
      image: true,
    },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  });

  // Se nenhum produto foi marcado ainda pelo admin, carrega os 2 brownies principais como padrão
  if (products.length === 0) {
    products = await prisma.product.findMany({
      where: {
        active: true,
        type: 'venda',
        name: { contains: 'Brownie', mode: 'insensitive' },
      },
      select: {
        id: true,
        name: true,
        description: true,
        salePrice: true,
        wholesalePrice: true,
        minWholesaleQty: true,
        unit: true,
        category: true,
        image: true,
      },
      take: 2,
      orderBy: [{ salePrice: 'asc' }],
    });
  }

  const formatted = products.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    salePrice: num(p.salePrice),
    wholesalePrice: num(p.wholesalePrice),
    minWholesaleQty: num(p.minWholesaleQty),
    unit: p.unit,
    category: p.category,
    image: p.image,
  }));

  return ok({ products: formatted });
});
