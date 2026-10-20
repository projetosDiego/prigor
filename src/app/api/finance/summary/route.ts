import { z } from 'zod';

import { requireManager } from '@/server/auth/guard';
import { ok, route } from '@/server/http/respond';
import { financeSummary } from '@/server/services/finance';
import { parseQuery } from '@/server/validation/common';

const query = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/).optional() });

export const GET = route('financeiro.resumo', async (request) => {
  await requireManager();
  return ok(await financeSummary(parseQuery(request, query).month));
});
