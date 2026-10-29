import { requireManager } from '@/server/auth/guard';
import { ok, route } from '@/server/http/respond';
import { listRecentSettlements } from '@/server/services/settlement-undo';

/** Baixas de pedidos feitas nas últimas horas (padrão 24, máx. 168). */
export const GET = route('financeiro.baixasRecentes', async (request) => {
  await requireManager();
  const raw = Number(new URL(request.url).searchParams.get('hours') ?? '24');
  const hours = Number.isFinite(raw) ? Math.min(Math.max(raw, 1), 168) : 24;
  return ok({ data: await listRecentSettlements(hours) });
});
