import { requireManager } from '@/server/auth/guard';
import { ok, route } from '@/server/http/respond';
import { deleteMember, getMemberDetail } from '@/server/services/loyalty-admin';
import { uuid } from '@/server/validation/common';

type Context = { params: Promise<{ id: string }> };

export const GET = route<Context>('clube.membro.detalhe', async (_request, { params }) => {
  await requireManager();
  return ok(await getMemberDetail(uuid('Membro').parse((await params).id)));
});

/** Exclui o cliente do Clube (e tudo dele). */
export const DELETE = route<Context>('clube.membro.excluir', async (_request, { params }) => {
  const session = await requireManager();
  await deleteMember(session, uuid('Membro').parse((await params).id));
  return ok({ ok: true });
});
