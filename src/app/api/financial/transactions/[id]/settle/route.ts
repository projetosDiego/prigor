import { requireManager } from '@/server/auth/guard';
import { ok, route } from '@/server/http/respond';
import { parseQuery } from '@/server/validation/common';
import { settleTransactionSchema } from '@/server/validation/sales';
import { settleTransaction } from '@/server/services/financial';

type Context = { params: Promise<{ id: string }> };

/** Baixa de pagamento. A data vem por query string (`?paymentDate=AAAA-MM-DD`). */
export const POST = route<Context>('financeiro.baixar', async (request, { params }) => {
  await requireManager();
  const { id } = await params;
  const { paymentDate } = parseQuery(request, settleTransactionSchema);
  return ok(await settleTransaction(id, paymentDate));
});
