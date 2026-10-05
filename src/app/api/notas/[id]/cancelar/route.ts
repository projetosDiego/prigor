/** Cancela NF-e autorizada (até 24h). Motivo obrigatório (15+ caracteres, regra da SEFAZ). Só gerência. */
import { z } from 'zod';

import { requireManager } from '@/server/auth/guard';
import { ok, readJson, route } from '@/server/http/respond';
import { cancelInvoice } from '@/server/services/invoices';

type Context = { params: Promise<{ id: string }> };

const schema = z.object({
  reason: z.string().trim().min(15, 'Motivo do cancelamento precisa ter pelo menos 15 caracteres.').max(255),
});

export const POST = route<Context>('notas.cancelar', async (request, { params }) => {
  const session = await requireManager();
  const { id } = await params;
  const { reason } = schema.parse(await readJson(request));
  return ok(await cancelInvoice(session, id, reason));
});
