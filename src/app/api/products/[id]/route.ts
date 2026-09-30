import { requireManager, requireUser } from '@/server/auth/guard';
import { ok, readJson, route } from '@/server/http/respond';
import { productInputSchema } from '@/server/validation/catalog';
import { archiveProduct, getProduct, updateProduct } from '@/server/services/products';

type Context = { params: Promise<{ id: string }> };

export const GET = route<Context>('produtos.obter', async (_request, { params }) => {
  await requireUser();
  const { id } = await params;
  return ok(await getProduct(id));
});

export const PUT = route<Context>('produtos.atualizar', async (request, { params }) => {
  await requireManager();
  const { id } = await params;
  const input = productInputSchema.parse(await readJson(request));
  return ok(await updateProduct(id, input));
});

export const DELETE = route<Context>('produtos.arquivar', async (_request, { params }) => {
  await requireManager();
  const { id } = await params;
  await archiveProduct(id);
  return ok({ ok: true });
});

export const PATCH = route<Context>('produtos.atualizarParcial', async (request, { params }) => {
  await requireManager();
  const { id } = await params;
  const body = (await readJson(request)) as { availableInPortal?: boolean };
  const { prisma } = await import('@/server/db');
  const updated = await prisma.product.update({
    where: { id },
    data: {
      ...(typeof body.availableInPortal === 'boolean' ? { availableInPortal: body.availableInPortal } : {}),
    },
    select: { id: true, availableInPortal: true },
  });
  return ok(updated);
});
