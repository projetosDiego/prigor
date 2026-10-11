import { z } from 'zod';

import { requireManager } from '@/server/auth/guard';
import { ok, readJson, route } from '@/server/http/respond';
import { fetchFromBank } from '@/server/services/pix';

const bodySchema = z.object({ days: z.number().int().min(1).max(30).default(7) });

/** Busca os Pix recebidos direto no Sicoob (precisa da API Pix habilitada). */
export const POST = route('pix.buscar_banco', async (request) => {
  await requireManager();
  const { days } = bodySchema.parse(await readJson(request).catch(() => ({})));
  return ok(await fetchFromBank(days));
});
