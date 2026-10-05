/**
 * Boletos do pedido.
 * GET: quem enxerga o pedido (vendedor só os próprios). POST: só gerência emite.
 */
import { requireManager, requireUser } from '@/server/auth/guard';
import { created, ok, route } from '@/server/http/respond';
import { issueBoleto, listOrderBoletos } from '@/server/services/boletos';

type Context = { params: Promise<{ id: string }> };

export const GET = route<Context>('boletos.listar', async (_request, { params }) => {
  const session = await requireUser();
  const { id } = await params;
  return ok({ data: await listOrderBoletos(session, id) });
});

export const POST = route<Context>('boletos.emitir', async (_request, { params }) => {
  const session = await requireManager();
  const { id } = await params;
  return created(await issueBoleto(session, id));
});
