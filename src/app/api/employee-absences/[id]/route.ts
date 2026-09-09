import { requireManager } from '@/server/auth/guard';
import { ok, route } from '@/server/http/respond';
import { removeAbsence } from '@/server/services/team';

type Context = { params: Promise<{ id: string }> };

export const DELETE = route<Context>('funcionarios.faltas.remover', async (_request, { params }) => {
  await requireManager();
  const { id } = await params;
  await removeAbsence(id);
  return ok({ ok: true });
});
