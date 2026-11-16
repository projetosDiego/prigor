/**
 * Pix "copia e cola" (BR Code estático com valor), padrão do Banco Central.
 *
 * Funciona com qualquer banco e qualquer chave Pix, sem API: o valor e a
 * identificação do pedido vão dentro do código. A confirmação do pagamento é
 * feita pela equipe (extrato / conciliação de Pix do ERP).
 */

function tlv(id: string, value: string): string {
  return `${id}${String(value.length).padStart(2, '0')}${value}`;
}

/** CRC16/CCITT-FALSE (polinômio 0x1021, inicial 0xFFFF), exigido pelo BR Code. */
export function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/** Remove acentos e caracteres fora do permitido, em maiúsculas. */
function ascii(value: string, max: number): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 .-]/g, '')
    .trim()
    .toUpperCase()
    .slice(0, max);
}

/** Normaliza a chave: telefone ganha +55, CPF/CNPJ só dígitos, e-mail/aleatória como estão. */
export function normalizePixKey(raw: string): string {
  const key = raw.trim();
  if (!key) return '';
  if (key.includes('@')) return key.toLowerCase();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)) return key.toLowerCase();
  const digits = key.replace(/\D/g, '');
  if (key.startsWith('+')) return `+${digits}`;
  if (digits.length === 11 && /^\d{2}9/.test(digits) && !/[.\-/]/.test(key)) return `+55${digits}`; // celular
  return digits; // CPF (11) ou CNPJ (14)
}

export function buildPixPayload({ key, name, city, amountCents, txid }: { key: string; name: string; city: string; amountCents: number; txid: string }): string {
  const account = tlv('00', 'br.gov.bcb.pix') + tlv('01', normalizePixKey(key));
  const reference = ascii(txid, 25).replace(/[^A-Z0-9]/g, '') || '***';
  const body =
    tlv('00', '01') +
    tlv('26', account) +
    tlv('52', '0000') +
    tlv('53', '986') +
    tlv('54', (amountCents / 100).toFixed(2)) +
    tlv('58', 'BR') +
    tlv('59', ascii(name, 25) || 'DOCES PRIGOR') +
    tlv('60', ascii(city, 15) || 'RIO DE JANEIRO') +
    tlv('62', tlv('05', reference)) +
    '6304';
  return body + crc16(body);
}
