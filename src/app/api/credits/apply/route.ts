import { z } from 'zod';

import { requireManager } from '@/server/auth/guard';
import { ok, readJson, route } from '@/server/http/respond';
import { applyCredit } from '@/server/services/credits';

const bodySchema = z.object({
  customerId: z.string().uuid(),
  transactionId: z.string().uuid(),
  amount: z.number().positive().max(10_000_000),
});

/** Abate o crédito do cliente (de Pix a mais ou devolução) em um título em aberto. */
export const POST = route('creditos.abater', async (request) => {
  const session = await requireManager();
  return ok(await applyCredit(session, bodySchema.parse(await readJson(request))));
});
