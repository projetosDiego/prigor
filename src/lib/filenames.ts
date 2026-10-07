/**
 * Nome de arquivo dos documentos (pedido, boleto, NF), no padrão
 * "<Documento> <Cliente> Pedido <nº>.<ext>", ex.: "Boleto Kinn Pedido 11001.pdf".
 * Sem dependência de servidor: usado pelas rotas e pelo navegador.
 */

const SUFIXOS_EMPRESA = new Set(['ltda', 'me', 'epp', 'eireli', 'mei', 's/a', 'sa', 's.a.', 'ltda.', 'me.', 'epp.']);

/** Nome curto e seguro do cliente para usar em nome de arquivo. */
export function shortCustomerName(name?: string | null, max = 40): string {
  let n = (name ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!n) return 'Cliente';

  const words = n.split(' ');
  while (words.length > 1 && SUFIXOS_EMPRESA.has(words[words.length - 1].toLowerCase())) words.pop();
  n = words.join(' ');

  // Tudo em maiúsculas vira "Capitalizado" (siglas curtas ficam como estão).
  if (n === n.toUpperCase() && n !== n.toLowerCase()) {
    n = n
      .split(' ')
      .map((w) => (w.length <= 3 || !/^\p{L}+$/u.test(w) ? w : w.charAt(0) + w.slice(1).toLowerCase()))
      .join(' ');
  }
  if (n.length > max) n = n.slice(0, max).replace(/\s+\S*$/, '').trim() || n.slice(0, max);
  return n.replace(/[. ]+$/, '');
}

/** Ex.: docFilename('Boleto', 'KINN LTDA', 11001, 'pdf') → "Boleto Kinn Pedido 11001.pdf" */
export function docFilename(
  kind: string,
  customer: string | null | undefined,
  orderNumber: number | string,
  ext: string,
): string {
  const cli = shortCustomerName(customer);
  // O próprio pedido não repete a palavra: "Pedido Kinn 11001".
  const base = (kind === 'Pedido' ? `Pedido ${cli} ${orderNumber}` : `${kind} ${cli} Pedido ${orderNumber}`).replace(/\s+/g, ' ').trim();
  return `${base}.${ext.replace(/^\./, '')}`;
}

/** Cabeçalho Content-Disposition com nome UTF-8 (acentos) e alternativa ASCII. */
export function contentDisposition(type: 'inline' | 'attachment', filename: string): string {
  const ascii = filename
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7e]/g, '_')
    .replace(/["\\]/g, '_');
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

/** Lê o nome do arquivo do cabeçalho Content-Disposition (UTF-8 tem prioridade). */
export function filenameFromDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const utf = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (utf) {
    try {
      return decodeURIComponent(utf[1].trim());
    } catch {
      /* cai no filename simples */
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(header);
  return plain ? plain[1].trim() : fallback;
}
