import { requireManager } from '@/server/auth/guard';
import { ok, route } from '@/server/http/respond';
import { runCollections } from '@/server/services/collections';

/** Botão "Atualizar com o banco e enviar lembretes" da tela de cobrança. */
export const POST = route('cobranca.executar', async () => {
  await requireManager();
  return ok(await runCollections());
});
