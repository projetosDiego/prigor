import { requireUser } from '@/server/auth/guard';
import { ok, route } from '@/server/http/respond';
import { lookupByCode } from '@/server/services/stock';

type Context = { params: Promise<{ code: string }> };

export const GET = route<Context>('produtos.lookup', async (_request, { params }) => {
  await requireUser();
  const { code } = await params;
  return ok(await lookupByCode(decodeURIComponent(code)));
});
