import { requireUser } from '@/server/auth/guard';
import { ok, route } from '@/server/http/respond';
import { getOrderHistory } from '@/server/services/order-history';

type Context = { params: Promise<{ id: string }> };

export const GET = route<Context>('pedidos.historico', async (_request, { params }) => {
  const session = await requireUser();
  const { id } = await params;
  return ok(await getOrderHistory(session, id));
});
