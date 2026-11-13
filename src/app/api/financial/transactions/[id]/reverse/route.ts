import { requireManager } from '@/server/auth/guard';
import { ok, route } from '@/server/http/respond';
import { audit } from '@/server/services/audit';
import { reverseSettlement } from '@/server/services/financial';

type Context = { params: Promise<{ id: string }> };

/** Estorna uma baixa. Não existia no sistema anterior. */
export const POST = route<Context>('financeiro.estornar', async (_request, { params }) => {
  const session = await requireManager();
  const { id } = await params;
  const result = await reverseSettlement(id);
  await audit(session, 'ESTORNO_BAIXA', 'FinancialTransaction', id);
  return ok(result);
});
