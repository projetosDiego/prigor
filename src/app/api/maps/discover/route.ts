/**
 * "Perto de mim": busca no Google estabelecimentos ao redor do GPS do vendedor
 * e grava os novos como leads da carteira dele.
 *
 * Cada chamada custa uma busca no Google, então há um teto por usuário por dia
 * além da trava financeira global do motor de prospecção.
 */
import { requireUser } from '@/server/auth/guard';
import { rateLimited } from '@/server/http/errors';
import { hit } from '@/server/http/rate-limit';
import { ok, readJson, route } from '@/server/http/respond';
import { discoverNearby } from '@/server/services/discover';
import { discoverNearbySchema } from '@/server/validation/crm';

/** Buscas por usuário por dia. 3 vendedores × 10 ≈ 900/mês: dentro da cota grátis. */
const DAILY_SEARCHES_PER_USER = 10;

export const POST = route('mapa.descobrir', async (request) => {
  const session = await requireUser();
  const input = discoverNearbySchema.parse(await readJson(request));

  const limit = hit(`discover:${session.userId}`, DAILY_SEARCHES_PER_USER, 24 * 60 * 60);
  if (!limit.allowed) {
    throw rateLimited(`Você já fez ${DAILY_SEARCHES_PER_USER} buscas hoje. O limite volta amanhã.`);
  }

  const result = await discoverNearby(session, input);
  return ok({ success: true, remainingToday: limit.remaining, ...result });
});
