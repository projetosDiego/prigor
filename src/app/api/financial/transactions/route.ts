import { requireManager } from '@/server/auth/guard';
import { created, ok, readJson, route } from '@/server/http/respond';
import { parseQuery } from '@/server/validation/common';
import { transactionInputSchema, transactionListQuerySchema } from '@/server/validation/sales';
import { createTransaction, listTransactions } from '@/server/services/financial';

export const GET = route('financeiro.listar', async (request) => {
  await requireManager();
  const query = parseQuery(request, transactionListQuerySchema);
  return ok(await listTransactions(query));
});

export const POST = route('financeiro.criar', async (request) => {
  await requireManager();
  const input = transactionInputSchema.parse(await readJson(request));
  return created(await createTransaction(input));
});
