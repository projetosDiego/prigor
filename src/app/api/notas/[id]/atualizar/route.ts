/** Consulta a nota no provedor fiscal. Só gerência. */
import { requireManager } from '@/server/auth/guard';
import { ok, route } from '@/server/http/respond';
import { refreshInvoice } from '@/server/services/invoices';

type Context = { params: Promise<{ id: string }> };

export const POST = route<Context>('notas.atualizar', async (_request, { params }) => {
  const session = await requireManager();
  const { id } = await params;
  return ok(await refreshInvoice(session, id));
});
