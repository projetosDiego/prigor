import { requireManager } from '@/server/auth/guard';
import { ok, readJson, route } from '@/server/http/respond';
import { employeeUpdateSchema } from '@/server/validation/team';
import { deactivateEmployee, updateEmployee } from '@/server/services/team';

type Context = { params: Promise<{ id: string }> };

export const PATCH = route<Context>('funcionarios.atualizar', async (request, { params }) => {
  await requireManager();
  const { id } = await params;
  const input = employeeUpdateSchema.parse(await readJson(request));
  return ok(await updateEmployee(id, input));
});

export const PUT = PATCH;

export const DELETE = route<Context>('funcionarios.desativar', async (_request, { params }) => {
  await requireManager();
  const { id } = await params;
  await deactivateEmployee(id);
  return ok({ ok: true });
});
