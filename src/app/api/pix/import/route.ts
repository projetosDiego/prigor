import { z } from 'zod';

import { requireManager } from '@/server/auth/guard';
import { ok, readJson, route } from '@/server/http/respond';
import { importStatement } from '@/server/services/pix';

const bodySchema = z.object({ text: z.string().min(1).max(3_000_000) });

/** Importa extrato (OFX ou CSV) e guarda só os Pix recebidos. */
export const POST = route('pix.importar_extrato', async (request) => {
  await requireManager();
  const { text } = bodySchema.parse(await readJson(request));
  return ok(await importStatement(text));
});
