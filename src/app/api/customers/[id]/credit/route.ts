import { requireUser } from '@/server/auth/guard';
import { ok, route } from '@/server/http/respond';
import { getCustomerCredit } from '@/server/services/customers';

type Context = { params: Promise<{ id: string }> };

export const GET = route<Context>('clientes.credito', async (_request, { params }) => {
  const session = await requireUser();
  const { id } = await params;
  return ok(await getCustomerCredit(session, id));
});
