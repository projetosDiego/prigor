import { z } from 'zod';

import { badRequest } from '@/server/http/errors';
import { requireManager } from '@/server/auth/guard';
import { ok, readJson, route } from '@/server/http/respond';
import { audit } from '@/server/services/audit';
import { reverseMany } from '@/server/services/settlement-undo';

const schema = z.object({ ids: z.array(z.string().uuid()).min(1).max(500) });

/** Estorna várias baixas de uma vez. */
export const POST = route('financeiro.estornarLote', async (request) => {
  const session = await requireManager();
  const parsed = schema.safeParse(await readJson(request));
  if (!parsed.success) throw badRequest('Selecione ao menos uma baixa para estornar.');
  const result = await reverseMany(parsed.data.ids);
  await audit(session, 'ESTORNO_BAIXA_LOTE', 'FinancialTransaction', null, { total: parsed.data.ids.length, done: result.done });
  return ok(result);
});
