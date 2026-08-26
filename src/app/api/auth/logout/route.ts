import { clearSession } from '@/server/auth/session';
import { ok, route } from '@/server/http/respond';

export const POST = route('auth.logout', async () => {
  await clearSession();
  return ok({ success: true });
});
