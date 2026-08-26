import { requireUser } from '@/server/auth/guard';
import { ok, route } from '@/server/http/respond';
import { getDashboard } from '@/server/services/dashboard';

export const GET = route('dashboard.erp', async () => {
  const session = await requireUser();
  return ok(await getDashboard(session));
});
