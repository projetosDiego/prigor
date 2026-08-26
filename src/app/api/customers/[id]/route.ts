import { requireUser } from '@/server/auth/guard';
import { ok, readJson, route } from '@/server/http/respond';
import { customerUpdateSchema } from '@/server/validation/sales';
import { archiveCustomer, getCustomer, updateCustomer } from '@/server/services/customers';

type Context = { params: Promise<{ id: string }> };

export const GET = route<Context>('clientes.obter', async (_request, { params }) => {
  const session = await requireUser();
  const { id } = await params;
  return ok(await getCustomer(session, id));
});

export const PATCH = route<Context>('clientes.atualizar', async (request, { params }) => {
  const session = await requireUser();
  const { id } = await params;
  const input = customerUpdateSchema.parse(await readJson(request));
  return ok(await updateCustomer(session, id, input));
});

export const PUT = PATCH;

export const DELETE = route<Context>('clientes.arquivar', async (_request, { params }) => {
  const session = await requireUser();
  const { id } = await params;
  await archiveCustomer(session, id);
  return ok({ ok: true });
});
