import { z } from 'zod';

import { requireManager } from '@/server/auth/guard';
import { created, ok, readJson, route } from '@/server/http/respond';
import { parseQuery } from '@/server/validation/common';
import { absenceInputSchema } from '@/server/validation/team';
import { addAbsence, listAbsences } from '@/server/services/team';

type Context = { params: Promise<{ id: string }> };

const querySchema = z.object({
  year: z.coerce.number().int().optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
});

export const GET = route<Context>('funcionarios.faltas.listar', async (request, { params }) => {
  await requireManager();
  const { id } = await params;
  const { year, month } = parseQuery(request, querySchema);
  return ok({ data: await listAbsences(id, year, month) });
});

export const POST = route<Context>('funcionarios.faltas.criar', async (request, { params }) => {
  await requireManager();
  const { id } = await params;
  const input = absenceInputSchema.parse(await readJson(request));
  return created(await addAbsence(id, input));
});
