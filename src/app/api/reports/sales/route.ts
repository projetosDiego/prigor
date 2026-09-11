import { z } from 'zod';

import { requireManager } from '@/server/auth/guard';
import { ok, route } from '@/server/http/respond';
import { booleanFlag, parseQuery } from '@/server/validation/common';
import { dailySalesReport } from '@/server/services/reports';

const querySchema = z.object({
  date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de data inválido (use AAAA-MM-DD).').optional(),
  includeCancelled: booleanFlag(false),
});

export const GET = route('relatorios.vendas_diarias', async (request) => {
  await requireManager();
  const { date, includeCancelled } = parseQuery(request, querySchema);
  return ok(await dailySalesReport(date, includeCancelled));
});
