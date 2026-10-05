/**
 * Inscrição Estadual pelo CNPJ — API pública do CNPJ.ws.
 * https://docs.cnpj.ws/referencia-de-api/api-publica/consultando-cnpj
 *
 * Limite gratuito: 3 consultas por minuto (por IP). Uso pontual (botão e
 * conferência antes de emitir NF) cabe folgado. Para volume maior, há plano pago.
 */

export type IeIndicator = '1' | '2' | '9'; // 1 contribuinte · 2 isento · 9 não contribuinte

export interface StateRegistration {
  ie: string | null;
  indicator: IeIndicator;
  state: string | null;
  /** Todas as IEs encontradas (para mostrar ao usuário quando houver mais de uma UF). */
  all: Array<{ ie: string; state: string; active: boolean }>;
}

export class CnpjLookupError extends Error {
  constructor(
    message: string,
    readonly kind: 'not_found' | 'rate_limited' | 'unavailable',
  ) {
    super(message);
    this.name = 'CnpjLookupError';
  }
}

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === 'object' ? (v as Json) : {});

/**
 * Pura. Escolhe a IE ativa da UF do cliente (ou da UF do estabelecimento).
 * Sem IE ativa na UF → não contribuinte (9).
 */
export function pickStateRegistration(body: unknown, preferredState?: string | null): StateRegistration {
  const est = obj(obj(body).estabelecimento);
  const estState = String(obj(est.estado).sigla ?? '').toUpperCase() || null;
  const uf = (preferredState ?? '').trim().toUpperCase() || estState;
  const list = Array.isArray(est.inscricoes_estaduais) ? est.inscricoes_estaduais : [];
  const all = list
    .map((r) => {
      const o = obj(r);
      return {
        ie: String(o.inscricao_estadual ?? '').replace(/\D/g, ''),
        state: String(obj(o.estado).sigla ?? '').toUpperCase(),
        active: o.ativo === true,
      };
    })
    .filter((r) => r.ie);
  const match = all.find((r) => r.active && r.state === uf);
  return match
    ? { ie: match.ie, indicator: '1', state: match.state, all }
    : { ie: null, indicator: '9', state: uf, all };
}

export async function lookupStateRegistration(cnpj: string, preferredState?: string | null): Promise<StateRegistration> {
  const digits = cnpj.replace(/\D/g, '');
  if (digits.length !== 14) throw new CnpjLookupError('CNPJ inválido.', 'not_found');
  let res: Response;
  try {
    res = await fetch(`https://publica.cnpj.ws/cnpj/${digits}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new CnpjLookupError('Consulta de IE indisponível no momento. Tente de novo em instantes.', 'unavailable');
  }
  if (res.status === 429) {
    throw new CnpjLookupError('Limite de consultas atingido (3 por minuto). Aguarde 1 minuto e tente de novo.', 'rate_limited');
  }
  if (res.status === 404 || res.status === 400) throw new CnpjLookupError('CNPJ não encontrado na Receita.', 'not_found');
  if (!res.ok) throw new CnpjLookupError('Consulta de IE indisponível no momento.', 'unavailable');
  return pickStateRegistration(await res.json(), preferredState);
}
