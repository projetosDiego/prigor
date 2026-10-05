/** Descarta nota com erro/rejeitada (não chama o provedor). Só gerência. */
import { requireManager } from '@/server/auth/guard';
import { ok, route } from '@/server/http/respond';
import { discardInvoice } from '@/server/services/invoices';

type Context = { params: Promise<{ id: string }> };

export const POST = route<Context>('notas.descartar', async (_request, { params }) => {
  const session = await requireManager();
  const { id } = await params;
  return ok(await discardInvoice(session, id));
});
