/**
 * Consulta de CEP (proxy da BrasilAPI).
 *
 * Três coisas que faltavam: prazo máximo para a chamada externa (uma API lenta
 * prendia o handler indefinidamente), forma fixa na resposta em vez de repassar
 * o JSON de terceiro inteiro, e nenhum corpo de erro externo chegando ao
 * cliente — o motivo vai para o log, o usuário vê uma mensagem nossa.
 */
import { requireUser } from '@/server/auth/guard';
import { notFound } from '@/server/http/errors';
import { logger } from '@/server/http/logger';
import { ok, route } from '@/server/http/respond';
import { parseQuery } from '@/server/validation/common';
import { cepQuerySchema } from '@/server/validation/crm';

const TIMEOUT_MS = 5000;

interface BrasilApiCep {
  cep?: string;
  state?: string;
  city?: string;
  neighborhood?: string;
  street?: string;
}

export const GET = route('ferramentas.cep', async (request) => {
  await requireUser();
  const { cep } = parseQuery(request, cepQuerySchema);

  let response: Response;
  try {
    response = await fetch(`https://brasilapi.com.br/api/cep/v1/${cep}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      next: { revalidate: 86400 },
    });
  } catch (error) {
    logger.warn('serviço de CEP indisponível', { route: 'ferramentas.cep', error });
    throw notFound('CEP');
  }

  if (!response.ok) {
    // O corpo do erro externo fica no log; para o cliente é só "não encontrado".
    logger.warn('serviço de CEP respondeu com erro', {
      route: 'ferramentas.cep',
      status: response.status,
    });
    throw notFound('CEP');
  }

  const data = (await response.json()) as BrasilApiCep;

  return ok({
    cep: data.cep ?? cep,
    state: data.state ?? '',
    city: data.city ?? '',
    neighborhood: data.neighborhood ?? '',
    street: data.street ?? '',
  });
});
