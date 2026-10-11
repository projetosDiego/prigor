import { z } from 'zod';

import { requireManager } from '@/server/auth/guard';
import { ok, route } from '@/server/http/respond';
import { optionalIsoDate, parseQuery } from '@/server/validation/common';
import { unitsReport } from '@/server/services/units-report';

const querySchema = z.object({
  from: optionalIsoDate('Data inicial'),
  to: optionalIsoDate('Data final'),
});

export const GET = route('relatorios.unidades', async (request) => {
  await requireManager();
  const { from, to } = parseQuery(request, querySchema);
  return ok(await unitsReport(from, to));
});
