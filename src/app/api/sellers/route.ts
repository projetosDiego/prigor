import { z } from 'zod';

import { requireManager, requireUser } from '@/server/auth/guard';
import { created, ok, readJson, route } from '@/server/http/respond';
import { booleanFlag, parseQuery } from '@/server/validation/common';
import { sellerInputSchema } from '@/server/validation/sales';
import { createSeller, listSellers } from '@/server/services/sellers';

const listQuery = z.object({ activeOnly: booleanFlag(true) });

const createSchema = sellerInputSchema.extend({
  password: z.string().min(8, 'A senha do vendedor precisa de pelo menos 8 caracteres.').max(200),
});

export const GET = route('vendedores.listar', async (request) => {
  await requireUser();
  const { activeOnly } = parseQuery(request, listQuery);
  return ok({ data: await listSellers(activeOnly) });
});

export const POST = route('vendedores.criar', async (request) => {
  await requireManager();
  const input = createSchema.parse(await readJson(request));
  return created(await createSeller(input));
});
