import { requireManager } from '@/server/auth/guard';
import { ok, route } from '@/server/http/respond';
import { listPix } from '@/server/services/pix';

/** Pix recebidos ainda sem baixa, cada um com as sugestões de título. */
export const GET = route('pix.listar', async () => {
  await requireManager();
  return ok(await listPix());
});
