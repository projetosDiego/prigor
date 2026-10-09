import { requireManager } from '@/server/auth/guard';
import { ok, route } from '@/server/http/respond';
import { listCollections } from '@/server/services/collections';

export const GET = route('cobranca.listar', async () => {
  await requireManager();
  return ok(await listCollections());
});
