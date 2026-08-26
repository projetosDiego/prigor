import { requireUser } from '@/server/auth/guard';
import { created, ok, readJson, route } from '@/server/http/respond';
import { parseQuery } from '@/server/validation/common';
import { orderCreateSchema, orderListQuerySchema } from '@/server/validation/sales';
import { createOrder, listOrders } from '@/server/services/orders';

export const GET = route('pedidos.listar', async (request) => {
  const session = await requireUser();
  const query = parseQuery(request, orderListQuerySchema);
  return ok(await listOrders(session, query));
});

export const POST = route('pedidos.criar', async (request) => {
  const session = await requireUser();
  const input = orderCreateSchema.parse(await readJson(request));
  return created(await createOrder(session, input));
});
