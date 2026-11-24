import { currentLoyaltyHash } from '@/server/auth/loyalty-session';
import { rateLimited } from '@/server/http/errors';
import { clientIp, hit } from '@/server/http/rate-limit';
import { ok, readJson, route } from '@/server/http/respond';
import { submitTaskProof } from '@/server/services/loyalty';
import { uuid } from '@/server/validation/common';
import { loyaltyProofSchema } from '@/server/validation/loyalty';

type Context = { params: Promise<{ taskId: string }> };

/** Cliente manda o print da tarefa (vai para análise em até 24h). */
export const POST = route<Context>('public.clube.tarefa', async (request, { params }) => {
  if (!hit(`clube:print:${clientIp(request)}`, 20, 3600).allowed) throw rateLimited();
  const taskId = uuid('Tarefa').parse((await params).taskId);
  const input = loyaltyProofSchema.parse(await readJson(request));
  return ok({ member: await submitTaskProof(await currentLoyaltyHash(), taskId, input) });
});
