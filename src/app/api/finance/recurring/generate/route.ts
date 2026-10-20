import { requireManager } from '@/server/auth/guard';
import { ok, route } from '@/server/http/respond';
import { generateRecurring } from '@/server/services/finance';

/** Gera os lançamentos do mês atual e do próximo que ainda não existem (pode repetir sem duplicar). */
export const POST = route('financeiro.recorrentes.gerar', async () => {
  await requireManager();
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString().slice(0, 7);
  const a = await generateRecurring();
  const b = await generateRecurring(next);
  return ok({ created: a.created + b.created });
});
