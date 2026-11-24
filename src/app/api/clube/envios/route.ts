import { z } from 'zod';

import { requireManager } from '@/server/auth/guard';
import { ok, route } from '@/server/http/respond';
import { parseQuery } from '@/server/validation/common';
import { listSubmissions } from '@/server/services/loyalty-admin';

const query = z.object({ status: z.enum(['pendente', 'aprovado', 'recusado']).default('pendente') });

export const GET = route('clube.envios.listar', async (request) => {
  await requireManager();
  const { status } = parseQuery(request, query);
  return ok({ data: await listSubmissions(status) });
});
