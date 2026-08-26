import { requireManager } from '@/server/auth/guard';
import { ok, readJson, route } from '@/server/http/respond';
import { transactionUpdateSchema } from '@/server/validation/sales';
import { deleteTransaction, updateTransaction } from '@/server/services/financial';

type Context = { params: Promise<{ id: string }> };

export const PATCH = route<Context>('financeiro.atualizar', async (request, { params }) => {
  await requireManager();
  const { id } = await params;
  const input = transactionUpdateSchema.parse(await readJson(request));
  return ok(await updateTransaction(id, input));
});

export const DELETE = route<Context>('financeiro.excluir', async (_request, { params }) => {
  await requireManager();
  const { id } = await params;
  await deleteTransaction(id);
  return ok({ ok: true });
});
