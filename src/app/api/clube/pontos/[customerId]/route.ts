import { requireManager } from '@/server/auth/guard';
import { ok, route } from '@/server/http/respond';
import { enableLoyaltyPoint } from '@/server/services/loyalty-admin';
import { uuid } from '@/server/validation/common';

type Context = { params: Promise<{ customerId: string }> };

/** Coloca o ponto no Clube (gera o código do QR do balcão). Idempotente. */
export const POST = route<Context>('clube.ponto.ativar', async (_request, { params }) => {
  const session = await requireManager();
  const customerId = uuid('Cliente').parse((await params).customerId);
  return ok(await enableLoyaltyPoint(session, customerId));
});
