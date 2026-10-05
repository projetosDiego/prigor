/** Busca a Inscrição Estadual do cliente pelo CNPJ e grava no cadastro. */
import { requireUser } from '@/server/auth/guard';
import { ok, route } from '@/server/http/respond';
import { refreshCustomerIe } from '@/server/services/customers';

type Context = { params: Promise<{ id: string }> };

export const POST = route<Context>('clientes.atualizar_ie', async (_request, { params }) => {
  const session = await requireUser();
  const { id } = await params;
  return ok(await refreshCustomerIe(session, id));
});
