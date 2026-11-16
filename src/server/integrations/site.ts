/**
 * Transporte da integração com o site oficial: só autenticação da requisição.
 *
 * O site assina "<timestamp>.<corpo>" com HMAC-SHA256 usando o segredo
 * compartilhado `SITE_ORDERS_SECRET`. Sem a variável, a integração fica
 * desligada (o endpoint responde 503) e o resto do ERP segue normal.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

import { isFreshTimestamp } from '../domain/site-order';

export type SiteAuth = { ok: true } | { ok: false; status: 401 | 503; message: string };

export function siteOrdersSecret(): string {
  return (process.env.SITE_ORDERS_SECRET ?? '').trim();
}

export function verifySiteRequest(rawBody: string, timestamp: string | null, signature: string | null, nowSeconds = Math.floor(Date.now() / 1000)): SiteAuth {
  const secret = siteOrdersSecret();
  if (secret.length < 32) return { ok: false, status: 503, message: 'Integração com o site não configurada (SITE_ORDERS_SECRET).' };
  if (!timestamp || !signature) return { ok: false, status: 401, message: 'Assinatura ausente.' };
  if (!isFreshTimestamp(timestamp, nowSeconds)) return { ok: false, status: 401, message: 'Assinatura expirada.' };

  const expected = Buffer.from(`sha256=${createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex')}`);
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    return { ok: false, status: 401, message: 'Assinatura inválida.' };
  }
  return { ok: true };
}
