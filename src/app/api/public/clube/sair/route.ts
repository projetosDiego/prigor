import { clearLoyaltyCookie, currentLoyaltyHash } from '@/server/auth/loyalty-session';
import { ok, route } from '@/server/http/respond';
import { logoutMember } from '@/server/services/loyalty';

export const POST = route('public.clube.sair', async () => {
  await logoutMember(await currentLoyaltyHash());
  await clearLoyaltyCookie();
  return ok({ ok: true });
});
