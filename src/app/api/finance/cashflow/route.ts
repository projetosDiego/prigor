import { z } from 'zod';

import { requireManager } from '@/server/auth/guard';
import { ok, route } from '@/server/http/respond';
import { cashflow } from '@/server/services/finance';
import { parseQuery } from '@/server/validation/common';

const query = z.object({ weeks: z.coerce.number().int().min(2).max(26).optional() });

export const GET = route('financeiro.fluxo', async (request) => {
  await requireManager();
  return ok(await cashflow(parseQuery(request, query).weeks ?? 8));
});
