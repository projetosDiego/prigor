import { requireManager } from '@/server/auth/guard';
import { ok, route } from '@/server/http/respond';
import { resetMemberPin } from '@/server/services/loyalty-admin';
import { uuid } from '@/server/validation/common';

type Context = { params: Promise<{ id: string }> };

/** Gera PIN novo para o cliente que esqueceu. */
export const POST = route<Context>('clube.membro.pin', async (_request, { params }) => {
  const session = await requireManager();
  return ok(await resetMemberPin(session, uuid('Membro').parse((await params).id)));
});
