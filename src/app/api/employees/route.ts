import { requireManager } from '@/server/auth/guard';
import { created, ok, readJson, route } from '@/server/http/respond';
import { employeeInputSchema } from '@/server/validation/team';
import { createEmployee, listEmployees } from '@/server/services/team';

export const GET = route('funcionarios.listar', async (request) => {
  await requireManager();
  const activeOnly = new URL(request.url).searchParams.get('activeOnly') === 'true';
  return ok({ data: await listEmployees(activeOnly) });
});

export const POST = route('funcionarios.criar', async (request) => {
  await requireManager();
  const input = employeeInputSchema.parse(await readJson(request));
  return created(await createEmployee(input));
});
