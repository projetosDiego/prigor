import { requireManager } from '@/server/auth/guard';
import { ok, route } from '@/server/http/respond';
import { parseQuery } from '@/server/validation/common';
import { settleTransactionSchema } from '@/server/validation/sales';
import { audit } from '@/server/services/audit';
import { settleTransaction } from '@/server/services/financial';

type Context = { params: Promise<{ id: string }> };

/** Baixa de pagamento. A data vem por query string (`?paymentDate=AAAA-MM-DD`). */
export const POST = route<Context>('financeiro.baixar', async (request, { params }) => {
  const session = await requireManager();
  const { id } = await params;
  const { paymentDate, accountId } = parseQuery(request, settleTransactionSchema);
  const result = await settleTransaction(id, paymentDate, accountId);
  await audit(session, 'BAIXA_PAGAMENTO', 'FinancialTransaction', id, { accountId: accountId ?? null });
  return ok(result);
});
