import { requireManager } from '@/server/auth/guard';
import { ok, readJson, route } from '@/server/http/respond';
import { pricingSheetSchema } from '@/server/validation/precificacao';
import { updateSheet, deleteSheet } from '@/server/services/precificacao';

type Context = { params: Promise<{ id: string }> };

export const PUT = route<Context>('precificacao.ficha.atualizar', async (request, { params }) => {
  await requireManager();
  const { id } = await params;
  const input = pricingSheetSchema.parse(await readJson(request));
  return ok(await updateSheet(id, input));
});

export const DELETE = route<Context>('precificacao.ficha.excluir', async (_request, { params }) => {
  await requireManager();
  const { id } = await params;
  await deleteSheet(id);
  return ok({ ok: true });
});
