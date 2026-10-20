import { z } from 'zod';

import { requireManager } from '@/server/auth/guard';
import { ok, readJson, route } from '@/server/http/respond';
import { confirmPix } from '@/server/services/pix';

const bodySchema = z.object({
  transactionIds: z.array(z.string().uuid()).max(12).optional(),
  allocations: z.array(z.object({ transactionId: z.string().uuid(), amount: z.number().positive().max(10_000_000) })).max(12).optional(),
  customerId: z.string().uuid().optional(),
});
type Context = { params: Promise<{ id: string }> };

/** Dá baixa nos títulos escolhidos com este Pix (total, parcial ou com sobra virando crédito). */
export const POST = route<Context>('pix.confirmar', async (request, { params }) => {
  const session = await requireManager();
  const { id } = await params;
  const body = bodySchema.parse(await readJson(request));
  return ok(await confirmPix(session, id, body));
});
