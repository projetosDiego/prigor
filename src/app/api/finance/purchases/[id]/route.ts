import { requireManager } from '@/server/auth/guard';
import { ok, route } from '@/server/http/respond';
import { deletePurchase } from '@/server/services/finance';

type Context = { params: Promise<{ id: string }> };

export const DELETE = route<Context>('financeiro.compras.excluir', async (_request, { params }) => {
  await requireManager();
  const { id } = await params;
  await deletePurchase(id);
  return ok({ deleted: true });
});
