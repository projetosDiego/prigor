import { z } from 'zod';

import { requireManager } from '@/server/auth/guard';
import { ok, route } from '@/server/http/respond';
import { parseQuery } from '@/server/validation/common';
import { getLoyaltyOverview } from '@/server/services/loyalty-admin';

const query = z.object({ search: z.string().trim().max(80).optional() });

export const GET = route('clube.resumo', async (request) => {
  await requireManager();
  const { search } = parseQuery(request, query);
  return ok(await getLoyaltyOverview(search));
});
