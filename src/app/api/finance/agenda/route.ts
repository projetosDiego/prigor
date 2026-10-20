import { z } from 'zod';

import { requireManager } from '@/server/auth/guard';
import { ok, route } from '@/server/http/respond';
import { agenda } from '@/server/services/finance';
import { parseQuery } from '@/server/validation/common';

const query = z.object({ type: z.enum(['receita', 'despesa']) });

export const GET = route('financeiro.agenda', async (request) => {
  await requireManager();
  return ok(await agenda(parseQuery(request, query).type));
});
