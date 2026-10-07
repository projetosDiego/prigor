import { requireManager } from '@/server/auth/guard';
import { created, readJson, route } from '@/server/http/respond';
import { pricingIngredientSchema } from '@/server/validation/precificacao';
import { createIngredient } from '@/server/services/precificacao';

export const POST = route('precificacao.insumo.criar', async (request) => {
  await requireManager();
  const input = pricingIngredientSchema.parse(await readJson(request));
  return created(await createIngredient(input));
});
