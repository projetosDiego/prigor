import { requireUser } from '@/server/auth/guard';
import { created, ok, readJson, route } from '@/server/http/respond';
import { parseQuery } from '@/server/validation/common';
import { customerInputSchema, customerListQuerySchema } from '@/server/validation/sales';
import { createCustomer, listCustomers } from '@/server/services/customers';

export const GET = route('clientes.listar', async (request) => {
  const session = await requireUser();
  const query = parseQuery(request, customerListQuerySchema);
  return ok(await listCustomers(session, query));
});

export const POST = route('clientes.criar', async (request) => {
  const session = await requireUser();
  const input = customerInputSchema.parse(await readJson(request));
  return created(await createCustomer(session, input));
});
