import { requireManager } from '@/server/auth/guard';
import { created, ok, readJson, route } from '@/server/http/respond';
import { listTasks, saveTask } from '@/server/services/loyalty-admin';
import { loyaltyTaskSchema } from '@/server/validation/loyalty';

export const GET = route('clube.tarefas.listar', async () => {
  await requireManager();
  return ok({ data: await listTasks() });
});

export const POST = route('clube.tarefas.criar', async (request) => {
  const session = await requireManager();
  await saveTask(session, null, loyaltyTaskSchema.parse(await readJson(request)));
  return created({ ok: true });
});
