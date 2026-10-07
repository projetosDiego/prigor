import { requireManager } from '@/server/auth/guard';
import { ok, route } from '@/server/http/respond';
import { getPricingBundle } from '@/server/services/precificacao';

export const dynamic = 'force-dynamic';

export const GET = route('precificacao.carregar', async () => {
  await requireManager();
  return ok(await getPricingBundle());
});
