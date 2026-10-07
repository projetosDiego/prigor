import { requireManager } from '@/server/auth/guard';
import { created, readJson, route } from '@/server/http/respond';
import { pricingFixedCostSchema } from '@/server/validation/precificacao';
import { createFixedCost } from '@/server/services/precificacao';

export const POST = route('precificacao.custo-fixo.criar', async (request) => {
  await requireManager();
  const input = pricingFixedCostSchema.parse(await readJson(request));
  return created(await createFixedCost(input));
});
