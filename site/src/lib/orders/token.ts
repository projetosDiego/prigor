import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Link da página do pedido: /natal2026/pedido/NAT-0007?t=<token>.
 * O token impede que alguém veja pedidos alheios trocando o número na URL.
 */
function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error('SESSION_SECRET ausente ou curto.');
  return s;
}

export function orderToken(code: string): string {
  return createHmac('sha256', secret()).update(`order:${code}`).digest('base64url').slice(0, 22);
}

export function checkOrderToken(code: string, token: string | undefined): boolean {
  if (!token) return false;
  const a = Buffer.from(orderToken(code));
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function orderPath(code: string): string {
  return `/natal2026/pedido/${code}?t=${orderToken(code)}`;
}
