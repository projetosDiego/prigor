import { requireManager } from '@/server/auth/guard';
import { noContent, route } from '@/server/http/respond';
import { deleteAdvance } from '@/server/services/advances';

type Context = { params: Promise<{ id: string }> };

export const DELETE = route<Context>('adiantamentos.remover', async (_request, { params }) => {
  await requireManager();
  const { id } = await params;
  await deleteAdvance(id);
  return noContent();
});
