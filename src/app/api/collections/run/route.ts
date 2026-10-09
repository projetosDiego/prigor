import { z } from 'zod';

import { requireManager } from '@/server/auth/guard';
import { ok, readJson, route } from '@/server/http/respond';
import { runCollections } from '@/server/services/collections';

const bodySchema = z.object({ action: z.enum(['sync', 'remind', 'all']).default('all') });

/**
 * Ações da tela de cobrança, separadas:
 *  - sync:   confere os boletos no banco e dá baixa nos pagos (não envia e-mail);
 *  - remind: envia os lembretes por e-mail da régua (não consulta o banco);
 *  - all:    as duas coisas (é o que o cron diário faz).
 */
export const POST = route('cobranca.executar', async (request) => {
  await requireManager();
  const { action } = bodySchema.parse(await readJson(request).catch(() => ({})));
  return ok(
    await runCollections({
      syncBank: action !== 'remind',
      sendEmails: action !== 'sync',
    }),
  );
});
