import { requireManager } from '@/server/auth/guard';
import { ok, readJson, route } from '@/server/http/respond';
import { confirmMemberWhatsapp } from '@/server/services/loyalty-admin';
import { uuid } from '@/server/validation/common';
import { loyaltyConfirmSchema } from '@/server/validation/loyalty';

type Context = { params: Promise<{ id: string }> };

export const POST = route<Context>('clube.membro.whatsapp', async (request, { params }) => {
  const session = await requireManager();
  const id = uuid('Membro').parse((await params).id);
  const { confirmed } = loyaltyConfirmSchema.parse(await readJson(request));
  await confirmMemberWhatsapp(session, id, confirmed);
  return ok({ ok: true });
});
