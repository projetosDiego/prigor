import { requireManager } from '@/server/auth/guard';
import { ok, readJson, route } from '@/server/http/respond';
import { addressUpdateSchema } from '@/server/validation/sales';
import { deleteCustomerAddress, updateCustomerAddress } from '@/server/services/customer-addresses';

type Context = { params: Promise<{ id: string }> };

export const PATCH = route<Context>('cliente.enderecos.atualizar', async (request, { params }) => {
  await requireManager();
  const { id } = await params;
  const input = addressUpdateSchema.parse(await readJson(request));
  return ok(await updateCustomerAddress(id, input));
});

export const PUT = PATCH;

export const DELETE = route<Context>('cliente.enderecos.remover', async (_request, { params }) => {
  await requireManager();
  const { id } = await params;
  await deleteCustomerAddress(id);
  return ok({ ok: true });
});
