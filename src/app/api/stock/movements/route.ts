import { requireUser } from '@/server/auth/guard';
import { created, ok, readJson, route } from '@/server/http/respond';
import { parseQuery } from '@/server/validation/common';
import { stockAdjustmentSchema, stockHistoryQuerySchema } from '@/server/validation/catalog';
import { listMovements, registerMovement } from '@/server/services/stock';

export const GET = route('estoque.historico', async (request) => {
  await requireUser();
  const query = parseQuery(request, stockHistoryQuerySchema);
  return ok(await listMovements(query));
});

export const POST = route('estoque.movimentar', async (request) => {
  await requireUser();
  const input = stockAdjustmentSchema.parse(await readJson(request));
  return created(await registerMovement({ ...input, allowNegative: false }));
});
