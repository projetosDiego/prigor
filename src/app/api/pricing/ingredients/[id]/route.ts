import { requireManager } from '@/server/auth/guard';
import { ok, readJson, route } from '@/server/http/respond';
import { pricingIngredientSchema } from '@/server/validation/precificacao';
import { updateIngredient, deleteIngredient } from '@/server/services/precificacao';

type Context = { params: Promise<{ id: string }> };

export const PUT = route<Context>('precificacao.insumo.atualizar', async (request, { params }) => {
  await requireManager();
  const { id } = await params;
  const input = pricingIngredientSchema.parse(await readJson(request));
  return ok(await updateIngredient(id, input));
});

export const DELETE = route<Context>('precificacao.insumo.excluir', async (_request, { params }) => {
  await requireManager();
  const { id } = await params;
  await deleteIngredient(id);
  return ok({ ok: true });
});
