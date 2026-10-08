/**
 * Boletos do pedido.
 * GET: quem enxerga o pedido (vendedor só os próprios). POST: só gerência emite.
 */
import { z } from 'zod';

import { requireManager, requireUser } from '@/server/auth/guard';
import { created, ok, readJson, route } from '@/server/http/respond';
import { issueBoleto, listOrderBoletos } from '@/server/services/boletos';

type Context = { params: Promise<{ id: string }> };

const issueSchema = z
  .object({
    /** Empresa (CNPJ) que emite; ausente = a do pedido/cliente/padrão. */
    issuerId: z.union([z.string().uuid('Empresa inválida.'), z.null()]).optional(),
  })
  .default({});

export const GET = route<Context>('boletos.listar', async (_request, { params }) => {
  const session = await requireUser();
  const { id } = await params;
  return ok({ data: await listOrderBoletos(session, id) });
});

export const POST = route<Context>('boletos.emitir', async (request, { params }) => {
  const session = await requireManager();
  const { id } = await params;
  const raw = request.headers.get('content-length') === '0' ? {} : await readJson(request).catch(() => ({}));
  const input = issueSchema.parse(raw ?? {});
  return created(await issueBoleto(session, id, { issuerId: input.issuerId }));
});
