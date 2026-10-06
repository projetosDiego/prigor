/**
 * Link de documentos do pedido para o cliente (boleto, NF, espelho), sem login.
 *
 * O link é `<orderId>.<assinatura>`: a assinatura é um HMAC do id com o
 * segredo do servidor, então não dá para adivinhar o link de outro pedido
 * (ao contrário do número do pedido, que é sequencial). Sem tabela nova:
 * o link é sempre o mesmo para o mesmo pedido.
 *
 * Trocar o JWT_SECRET invalida todos os links já enviados (é o "revogar tudo").
 */
import crypto from 'node:crypto';

const PURPOSE = 'prigor-order-docs-v1:';
const SIG_LENGTH = 24; // 24 chars base64url ≈ 144 bits

export function signOrderId(orderId: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(PURPOSE + orderId).digest('base64url').slice(0, SIG_LENGTH);
}

export function buildOrderDocsRef(orderId: string, secret: string): string {
  return `${orderId}.${signOrderId(orderId, secret)}`;
}

/** Devolve o orderId se a assinatura confere; senão null. Comparação em tempo constante. */
export function verifyOrderDocsRef(ref: string, secret: string): string | null {
  const dot = ref.lastIndexOf('.');
  if (dot <= 0 || dot === ref.length - 1) return null;
  const orderId = ref.slice(0, dot);
  const sig = ref.slice(dot + 1);
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(orderId) || sig.length !== SIG_LENGTH) return null;
  const expected = Buffer.from(signOrderId(orderId, secret));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  return orderId;
}
