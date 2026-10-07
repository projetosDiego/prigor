import { requireManager } from '@/server/auth/guard';
import { ok, readJson, route } from '@/server/http/respond';
import { pricingFixedCostSchema } from '@/server/validation/precificacao';
import { updateFixedCost, deleteFixedCost } from '@/server/services/precificacao';

type Context = { params: Promise<{ id: string }> };

export const PUT = route<Context>('precificacao.custo-fixo.atualizar', async (request, { params }) => {
  await requireManager();
  const { id } = await params;
  const input = pricingFixedCostSchema.parse(await readJson(request));
  return ok(await updateFixedCost(id, input));
});

export const DELETE = route<Context>('precificacao.custo-fixo.excluir', async (_request, { params }) => {
  await requireManager();
  const { id } = await params;
  await deleteFixedCost(id);
  return ok({ ok: true });
});
