/** Baixa (cancela) o boleto no Sicoob. Só gerência. */
import { requireManager } from '@/server/auth/guard';
import { ok, route } from '@/server/http/respond';
import { writeOffBoleto } from '@/server/services/boletos';

type Context = { params: Promise<{ id: string }> };

export const POST = route<Context>('boletos.baixar', async (_request, { params }) => {
  const session = await requireManager();
  const { id } = await params;
  return ok(await writeOffBoleto(session, id));
});
