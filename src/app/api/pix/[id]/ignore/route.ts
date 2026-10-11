import { requireManager } from '@/server/auth/guard';
import { ok, route } from '@/server/http/respond';
import { ignorePix } from '@/server/services/pix';

type Context = { params: Promise<{ id: string }> };

/** Marca o Pix como "não é de cobrança" para sair da lista. */
export const POST = route<Context>('pix.ignorar', async (_request, { params }) => {
  await requireManager();
  const { id } = await params;
  await ignorePix(id);
  return ok({ ok: true });
});
