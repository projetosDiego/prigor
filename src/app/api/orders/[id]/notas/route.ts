/** Notas fiscais do pedido. GET: quem vê o pedido. POST: só gerência emite. */
import { requireManager, requireUser } from '@/server/auth/guard';
import { created, ok, route } from '@/server/http/respond';
import { issueInvoice, listOrderInvoices } from '@/server/services/invoices';

type Context = { params: Promise<{ id: string }> };

export const GET = route<Context>('notas.listar', async (_request, { params }) => {
  const session = await requireUser();
  const { id } = await params;
  return ok({ data: await listOrderInvoices(session, id) });
});

export const POST = route<Context>('notas.emitir', async (_request, { params }) => {
  const session = await requireManager();
  const { id } = await params;
  return created(await issueInvoice(session, id));
});
