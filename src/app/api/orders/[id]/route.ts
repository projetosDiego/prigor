import { requireUser } from '@/server/auth/guard';
import { ok, readJson, route } from '@/server/http/respond';
import { orderUpdateSchema } from '@/server/validation/sales';
import { cancelOrder, getOrder, updateOrder } from '@/server/services/orders';

type Context = { params: Promise<{ id: string }> };

export const GET = route<Context>('pedidos.obter', async (_request, { params }) => {
  const session = await requireUser();
  const { id } = await params;
  return ok(await getOrder(session, id));
});

export const PATCH = route<Context>('pedidos.atualizar', async (request, { params }) => {
  const session = await requireUser();
  const { id } = await params;
  const input = orderUpdateSchema.parse(await readJson(request));
  return ok(await updateOrder(session, id, input));
});

/** Compatibilidade: o front antigo usa PUT para atualizar pedido. */
export const PUT = PATCH;

export const DELETE = route<Context>('pedidos.cancelar', async (_request, { params }) => {
  const session = await requireUser();
  const { id } = await params;
  return ok(await cancelOrder(session, id));
});
