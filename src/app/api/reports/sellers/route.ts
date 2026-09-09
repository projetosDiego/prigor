import { z } from 'zod';

import { requireManager } from '@/server/auth/guard';
import { ok, route } from '@/server/http/respond';
import { optionalIsoDate, parseQuery } from '@/server/validation/common';
import { sellerReport } from '@/server/services/reports';

const querySchema = z.object({
  from: optionalIsoDate('Data inicial'),
  to: optionalIsoDate('Data final'),
});

export const GET = route('relatorios.vendedores', async (request) => {
  await requireManager();
  const { from, to } = parseQuery(request, querySchema);
  return ok(await sellerReport(from, to));
});
