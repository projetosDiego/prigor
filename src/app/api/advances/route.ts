import { z } from 'zod';
import { requireManager } from '@/server/auth/guard';
import { created, ok, readJson, route } from '@/server/http/respond';
import { parseQuery } from '@/server/validation/common';
import { advanceInputSchema } from '@/server/validation/advances';
import { createAdvance, listAdvances } from '@/server/services/advances';

const querySchema = z.object({
  year: z.coerce.number().int().optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
});

export const GET = route('adiantamentos.listar', async (request) => {
  await requireManager();
  const { year, month } = parseQuery(request, querySchema);
  return ok(await listAdvances(year, month));
});

export const POST = route('adiantamentos.criar', async (request) => {
  await requireManager();
  const body = await readJson(request);
  const input = advanceInputSchema.parse(body);
  return created(await createAdvance(input));
});
