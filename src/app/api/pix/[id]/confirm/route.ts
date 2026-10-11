import { z } from 'zod';

import { requireManager } from '@/server/auth/guard';
import { ok, readJson, route } from '@/server/http/respond';
import { confirmPix } from '@/server/services/pix';

const bodySchema = z.object({ transactionIds: z.array(z.string().uuid()).min(1).max(6) });
type Context = { params: Promise<{ id: string }> };

/** Dá baixa nos títulos escolhidos com este Pix (o valor precisa fechar). */
export const POST = route<Context>('pix.confirmar', async (request, { params }) => {
  const session = await requireManager();
  const { id } = await params;
  const body = bodySchema.parse(await readJson(request));
  return ok(await confirmPix(session, id, body.transactionIds));
});
