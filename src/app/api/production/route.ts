import { z } from 'zod';

import { requireManager } from '@/server/auth/guard';
import { ok, route } from '@/server/http/respond';
import { getProductionPlan } from '@/server/services/production';

const querySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/** Plano de produção e compras para pedidos com entrega no período. */
export const GET = route('producao.plano', async (request) => {
  await requireManager();
  const url = new URL(request.url);
  const { from, to } = querySchema.parse({
    from: url.searchParams.get('from'),
    to: url.searchParams.get('to') ?? url.searchParams.get('from'),
  });
  return ok(await getProductionPlan(from, to));
});
