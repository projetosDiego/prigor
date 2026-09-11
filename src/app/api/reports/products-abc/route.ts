import { z } from 'zod';

import { requireManager } from '@/server/auth/guard';
import { ok, route } from '@/server/http/respond';
import { optionalIsoDate, parseQuery } from '@/server/validation/common';
import { productAbcReport } from '@/server/services/reports';

const querySchema = z.object({
  from: optionalIsoDate('Data inicial'),
  to: optionalIsoDate('Data final'),
});

export const GET = route('relatorios.curva_abc_produtos', async (request) => {
  await requireManager();
  const { from, to } = parseQuery(request, querySchema);
  return ok(await productAbcReport(from, to));
});
