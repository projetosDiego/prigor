import { requireManager } from '@/server/auth/guard';
import { ok, route } from '@/server/http/respond';
import { deleteReturn } from '@/server/services/returns';

type Context = { params: Promise<{ id: string }> };

/** Desfaz uma troca/devolução lançada por engano. */
export const DELETE = route<Context>('trocas.excluir', async (_request, { params }) => {
  await requireManager();
  const { id } = await params;
  await deleteReturn(id);
  return ok({ deleted: true });
});
