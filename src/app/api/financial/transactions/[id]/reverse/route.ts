import { requireManager } from '@/server/auth/guard';
import { ok, route } from '@/server/http/respond';
import { reverseSettlement } from '@/server/services/financial';

type Context = { params: Promise<{ id: string }> };

/** Estorna uma baixa. Não existia no sistema anterior. */
export const POST = route<Context>('financeiro.estornar', async (_request, { params }) => {
  await requireManager();
  const { id } = await params;
  return ok(await reverseSettlement(id));
});
