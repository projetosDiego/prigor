import { z } from 'zod';

import { requireManager } from '@/server/auth/guard';
import { ok, route } from '@/server/http/respond';
import { parseQuery } from '@/server/validation/common';
import { supervisorsReport } from '@/server/services/supervisor-report';

const now = new Date();

const querySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).default(now.getUTCFullYear()),
  month: z.coerce.number().int().min(1).max(12).default(now.getUTCMonth() + 1),
});

export const GET = route('relatorios.supervisores', async (request) => {
  await requireManager();
  const { year, month } = parseQuery(request, querySchema);
  return ok(await supervisorsReport(year, month));
});
