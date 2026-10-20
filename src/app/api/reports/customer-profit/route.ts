import { requireManager } from '@/server/auth/guard';
import { ok, route } from '@/server/http/respond';
import { parseQuery } from '@/server/validation/common';
import { customerProfitReport } from '@/server/services/customer-profit';
import { z } from 'zod';

const querySchema = z.object({ days: z.coerce.number().int().min(30).max(365).optional() });

/** Clientes por rentabilidade: o que compensa e o que não compensa atender. */
export const GET = route('relatorios.clientes_rentabilidade', async (request) => {
  await requireManager();
  const q = parseQuery(request, querySchema);
  return ok(await customerProfitReport(q.days ?? 90));
});
