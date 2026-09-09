import { requireManager, requireUser } from '@/server/auth/guard';
import { created, ok, readJson, route } from '@/server/http/respond';
import { addressInputSchema } from '@/server/validation/sales';
import { createCustomerAddress, listCustomerAddresses } from '@/server/services/customer-addresses';

type Context = { params: Promise<{ id: string }> };

export const GET = route<Context>('cliente.enderecos.listar', async (_request, { params }) => {
  await requireUser();
  const { id } = await params;
  return ok({ data: await listCustomerAddresses(id) });
});

export const POST = route<Context>('cliente.enderecos.criar', async (request, { params }) => {
  await requireManager();
  const { id } = await params;
  const input = addressInputSchema.parse(await readJson(request));
  return created(await createCustomerAddress(id, input));
});
