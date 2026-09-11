import { z } from 'zod';

import { requireManager } from '@/server/auth/guard';
import { ok, route } from '@/server/http/respond';
import { optionalUuid, parseQuery } from '@/server/validation/common';
import { inactiveCustomersReport } from '@/server/services/reports';

const querySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(15),
  sellerId: optionalUuid('Vendedor'),
});

export const GET = route('relatorios.clientes_inativos', async (request) => {
  await requireManager();
  const { days, sellerId } = parseQuery(request, querySchema);
  return ok(await inactiveCustomersReport(days, sellerId));
});
