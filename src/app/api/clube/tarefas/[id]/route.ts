import { requireManager } from '@/server/auth/guard';
import { ok, readJson, route } from '@/server/http/respond';
import { saveTask } from '@/server/services/loyalty-admin';
import { uuid } from '@/server/validation/common';
import { loyaltyTaskSchema } from '@/server/validation/loyalty';

type Context = { params: Promise<{ id: string }> };

export const PUT = route<Context>('clube.tarefas.editar', async (request, { params }) => {
  const session = await requireManager();
  const id = uuid('Tarefa').parse((await params).id);
  await saveTask(session, id, loyaltyTaskSchema.parse(await readJson(request)));
  return ok({ ok: true });
});
