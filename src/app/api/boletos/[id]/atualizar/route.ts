/** Consulta o boleto no Sicoob e, se pago, dá baixa no financeiro. Só gerência. */
import { requireManager } from '@/server/auth/guard';
import { ok, route } from '@/server/http/respond';
import { refreshBoleto } from '@/server/services/boletos';

type Context = { params: Promise<{ id: string }> };

export const POST = route<Context>('boletos.atualizar', async (_request, { params }) => {
  const session = await requireManager();
  const { id } = await params;
  return ok(await refreshBoleto(session, id));
});
