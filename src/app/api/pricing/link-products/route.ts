import { requireManager } from '@/server/auth/guard';
import { ok, route } from '@/server/http/respond';
import { autoLinkProducts } from '@/server/services/precificacao';

export const POST = route('precificacao.vincular-produtos', async () => {
  await requireManager();
  return ok(await autoLinkProducts());
});
