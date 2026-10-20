import { requireManager } from '@/server/auth/guard';
import { ok, route } from '@/server/http/respond';
import { returnsReport } from '@/server/services/returns';

export const GET = route('relatorios.trocas', async () => {
  await requireManager();
  return ok(await returnsReport());
});
