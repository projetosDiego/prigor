import { z } from 'zod';

import { requireManager } from '@/server/auth/guard';
import { ok, readJson, route } from '@/server/http/respond';
import { getProductComponents, setProductComponents } from '@/server/services/units-report';

const bodySchema = z.object({
  components: z
    .array(z.object({ componentId: z.string().uuid(), quantity: z.number().positive().max(100000) }))
    .max(30),
});

type Context = { params: Promise<{ id: string }> };

export const GET = route<Context>('produtos.composicao.ver', async (_request, { params }) => {
  await requireManager();
  const { id } = await params;
  return ok(await getProductComponents(id));
});

export const PUT = route<Context>('produtos.composicao.salvar', async (request, { params }) => {
  await requireManager();
  const { id } = await params;
  const body = bodySchema.parse(await readJson(request));
  return ok(await setProductComponents(id, body.components));
});
