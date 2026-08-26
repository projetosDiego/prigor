import { getSession } from '@/server/auth/session';
import { ok, route } from '@/server/http/respond';

export const GET = route('auth.sessao', async () => {
  const session = await getSession();
  return ok({ authenticated: Boolean(session), user: session });
});
