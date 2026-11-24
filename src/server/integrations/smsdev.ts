/**
 * Envio de SMS pela SMSDev (smsdev.com.br) — empresa brasileira, só precisa da chave.
 * API: GET https://api.smsdev.com.br/v1/send?key=...&type=9&number=...&msg=...
 */
import { logger } from '../http/logger';

export interface SmsResult {
  ok: boolean;
  id?: string;
  error?: string;
}

export async function sendSmsDev(apiKey: string, phoneDigits: string, text: string): Promise<SmsResult> {
  // SMSDEV_API_URL só existe para testes automatizados.
  const url = new URL(process.env.SMSDEV_API_URL || 'https://api.smsdev.com.br/v1/send');
  url.searchParams.set('key', apiKey);
  url.searchParams.set('type', '9');
  url.searchParams.set('number', `55${phoneDigits}`);
  url.searchParams.set('msg', text);
  try {
    const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(10_000) });
    type Item = { situacao?: string; codigo?: string; id?: string; descricao?: string };
    const raw = (await res.json().catch(() => null)) as Item | Item[] | null;
    // A SMSDev responde com uma LISTA ([{ situacao: "OK", ... }]); aceita objeto também.
    const body: Item | null = Array.isArray(raw) ? (raw[0] ?? null) : raw;
    if (res.ok && body?.situacao?.toUpperCase() === 'OK') return { ok: true, id: body.id };
    const error = body?.descricao ? `${body.descricao}${body.codigo ? ` (código ${body.codigo})` : ''}` : `HTTP ${res.status}`;
    logger.warn('smsdev recusou o envio', { error });
    return { ok: false, error };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.warn('smsdev indisponível', { error });
    return { ok: false, error };
  }
}
