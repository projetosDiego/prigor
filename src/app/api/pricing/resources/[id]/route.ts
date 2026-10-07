import { requireManager } from '@/server/auth/guard';
import { ok, readJson, route } from '@/server/http/respond';
import { pricingResourceSchema } from '@/server/validation/precificacao';
import { updateResource, deleteResource } from '@/server/services/precificacao';

type Context = { params: Promise<{ id: string }> };

export const PUT = route<Context>('precificacao.recurso.atualizar', async (request, { params }) => {
  await requireManager();
  const { id } = await params;
  const input = pricingResourceSchema.parse(await readJson(request));
  return ok(await updateResource(id, input));
});

export const DELETE = route<Context>('precificacao.recurso.excluir', async (_request, { params }) => {
  await requireManager();
  const { id } = await params;
  await deleteResource(id);
  return ok({ ok: true });
});
