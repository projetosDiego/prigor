/** Notas fiscais do pedido. GET: quem vê o pedido. POST: só gerência emite. */
import { z } from 'zod';

import { requireManager, requireUser } from '@/server/auth/guard';
import { created, ok, readJson, route } from '@/server/http/respond';
import { issueInvoice, listOrderInvoices } from '@/server/services/invoices';

type Context = { params: Promise<{ id: string }> };

const issueSchema = z
  .object({
    /** Mensagem desta nota; ausente = mensagem padrão da Configuração Fiscal. */
    message: z.union([z.string().trim().max(500, 'Mensagem com no máximo 500 caracteres.'), z.null()]).optional(),
    notes: z.union([z.string().trim().max(1000, 'Observação com no máximo 1000 caracteres.'), z.null()]).optional(),
    /** Empresa (CNPJ) que emite; ausente = a do pedido/cliente/padrão. */
    issuerId: z.union([z.string().uuid('Empresa inválida.'), z.null()]).optional(),
  })
  .default({});

export const GET = route<Context>('notas.listar', async (_request, { params }) => {
  const session = await requireUser();
  const { id } = await params;
  return ok(await listOrderInvoices(session, id));
});

export const POST = route<Context>('notas.emitir', async (request, { params }) => {
  const session = await requireManager();
  const { id } = await params;
  const raw = request.headers.get('content-length') === '0' ? {} : await readJson(request).catch(() => ({}));
  const input = issueSchema.parse(raw ?? {});
  return created(await issueInvoice(session, id, input));
});
