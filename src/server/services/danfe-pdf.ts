/**
 * DANFE próprio da Doces Prigor, gerado a partir do XML autorizado.
 *
 * Segue o leiaute obrigatório do DANFE (MOC – Anexo II): canhoto, emitente,
 * quadro DANFE, chave de acesso com código de barras, protocolo, destinatário,
 * faturas, cálculo do imposto, transportador, produtos e dados adicionais —
 * com a identidade visual da Prigor (logo, cores, destaque do total).
 *
 * O documento fiscal é o XML; o DANFE é só a representação dele. Se este
 * gerador falhar, a rota cai no DANFE do provedor.
 */
import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';

import { code128C } from '../../lib/barcode128';
import { parseNfeXml, type DanfeData, type DanfeItem } from '../domain/nfe-xml';
import { logoBytes } from './logo';

const A4: [number, number] = [595.28, 841.89];
const M = 18; // margem
const W = A4[0] - M * 2; // largura útil (559)

const INK = rgb(0.1, 0.1, 0.11);
const MUTED = rgb(0.4, 0.4, 0.43);
const LINE = rgb(0.55, 0.55, 0.58);
const ACCENT = rgb(0.72, 0.45, 0.11); // âmbar Prigor
const ACCENT_BG = rgb(0.99, 0.95, 0.88);
const HEAD_BG = rgb(0.95, 0.95, 0.96);

// ─── Utilitários ────────────────────────────────────────────────────────────

/** Fontes padrão do PDF só aceitam Latin-1: troca o que não couber. */
function safe(v: string | null | undefined): string {
  return (v ?? '')
    .normalize('NFC')
    .replace(/[–—]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/•/g, '·')
    .replace(/[^\u0009\u000A\u000D -~ -ÿ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const digits = (v: string) => v.replace(/\D/g, '');

export function formatDoc(v: string): string {
  const d = digits(v);
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return v;
}
const formatCep = (v: string) => (digits(v).length === 8 ? digits(v).replace(/^(\d{5})(\d{3})$/, '$1-$2') : v);
const formatKey = (v: string) => digits(v).replace(/(\d{4})(?=\d)/g, '$1 ');
const formatNumber = (n: string) => digits(n).padStart(9, '0').replace(/^(\d{3})(\d{3})(\d{3})$/, '$1.$2.$3');

export function money(v: string, dp = 2): string {
  const n = Number(v || 0);
  return n.toLocaleString('pt-BR', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}
function qty(v: string): string {
  const n = Number(v || 0);
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}
/** Data/hora ISO (com fuso) → "dd/mm/aaaa" e "hh:mm:ss" no horário de Brasília. */
function dateBR(iso: string): string {
  if (!iso) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso.split('-').reverse().join('/');
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}
function timeBR(iso: string): string {
  const d = new Date(iso);
  return !iso || Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

const FRETE: Record<string, string> = {
  '0': '0 - Emitente (CIF)',
  '1': '1 - Destinatário (FOB)',
  '2': '2 - Terceiros',
  '3': '3 - Próprio remetente',
  '4': '4 - Próprio destinatário',
  '9': '9 - Sem frete',
};

function fit(text: string, font: PDFFont, size: number, max: number): string {
  let t = safe(text);
  if (font.widthOfTextAtSize(t, size) <= max) return t;
  while (t.length > 1 && font.widthOfTextAtSize(`${t}…`.replace('…', '...'), size) > max) t = t.slice(0, -1);
  return `${t}...`;
}

function wrap(text: string, font: PDFFont, size: number, max: number): string[] {
  const out: string[] = [];
  for (const para of safe(text).split(/\s*\|\s*|\n/)) {
    let line = '';
    for (const word of para.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= max) line = next;
      else {
        if (line) out.push(line);
        line = word;
        while (font.widthOfTextAtSize(line, size) > max && line.length > 1) {
          let cut = line.length - 1;
          while (cut > 1 && font.widthOfTextAtSize(line.slice(0, cut), size) > max) cut--;
          out.push(line.slice(0, cut));
          line = line.slice(cut);
        }
      }
    }
    if (line) out.push(line);
  }
  return out;
}

// ─── Desenho ────────────────────────────────────────────────────────────────

interface Ctx {
  pdf: PDFDocument;
  page: PDFPage;
  reg: PDFFont;
  bold: PDFFont;
  logo: PDFImage | null;
  data: DanfeData;
  cancelled: boolean;
}

/** Caixa com rótulo pequeno em cima e valor embaixo. `top` é a coordenada do topo. */
function box(
  c: Ctx,
  x: number,
  top: number,
  w: number,
  h: number,
  label: string,
  value = '',
  opts: { align?: 'left' | 'right' | 'center'; size?: number; bold?: boolean; fill?: ReturnType<typeof rgb>; color?: ReturnType<typeof rgb> } = {},
): void {
  const { page, reg, bold } = c;
  page.drawRectangle({
    x, y: top - h, width: w, height: h,
    borderColor: LINE, borderWidth: 0.5,
    ...(opts.fill ? { color: opts.fill } : {}),
  });
  if (label) page.drawText(fit(label.toUpperCase(), reg, 5.2, w - 4), { x: x + 2, y: top - 6.5, size: 5.2, font: reg, color: MUTED });
  if (value !== '') {
    const size = opts.size ?? 7.5;
    const font = opts.bold ? bold : reg;
    const t = fit(value, font, size, w - 4);
    const tw = font.widthOfTextAtSize(t, size);
    const tx = opts.align === 'right' ? x + w - 2 - tw : opts.align === 'center' ? x + (w - tw) / 2 : x + 2;
    page.drawText(t, { x: tx, y: top - h + 3.5, size, font, color: opts.color ?? INK });
  }
}

function title(c: Ctx, top: number, text: string): number {
  c.page.drawText(text, { x: M, y: top - 7, size: 6.5, font: c.bold, color: ACCENT });
  return top - 9;
}

function barcode(c: Ctx, x: number, top: number, w: number, h: number, key: string): void {
  const bits = code128C(digits(key));
  const mod = w / bits.length;
  let run = 0;
  for (let i = 0; i <= bits.length; i++) {
    if (bits[i] === '1') run++;
    else if (run > 0) {
      c.page.drawRectangle({ x: x + (i - run) * mod, y: top - h, width: run * mod, height: h, color: INK });
      run = 0;
    }
  }
}

function watermark(c: Ctx): void {
  const text = c.cancelled ? 'CANCELADA' : c.data.environment === 2 ? 'SEM VALOR FISCAL' : '';
  if (!text) return;
  const size = c.cancelled ? 80 : 54;
  const tw = c.bold.widthOfTextAtSize(text, size);
  c.page.drawText(text, {
    x: A4[0] / 2 - (tw / 2) * 0.72,
    y: A4[1] / 2 - (tw / 2) * 0.69,
    size,
    font: c.bold,
    color: c.cancelled ? rgb(0.85, 0.2, 0.2) : rgb(0.6, 0.6, 0.6),
    opacity: 0.18,
    rotate: degrees(44),
  });
}

/** Canhoto + cabeçalho (emitente, quadro DANFE, chave). Devolve o topo livre. */
function header(c: Ctx, top: number, pageNo: number, pages: number, withStub: boolean): number {
  const d = c.data;
  let y = top;

  if (withStub) {
    const h = 44;
    const leftW = W - 100;
    c.page.drawRectangle({ x: M, y: y - h, width: leftW, height: h, borderColor: LINE, borderWidth: 0.5 });
    const recv = `RECEBEMOS DE ${safe(d.emit.name).toUpperCase()} OS PRODUTOS CONSTANTES DA NOTA FISCAL INDICADA AO LADO. ` +
      `EMISSÃO: ${dateBR(d.issuedAt)} · VALOR TOTAL: R$ ${money(d.totals.vNF)} · DESTINATÁRIO: ${safe(d.dest.name).toUpperCase()}`;
    wrap(recv, c.reg, 5.6, leftW - 6).slice(0, 3).forEach((l, i) => {
      c.page.drawText(l, { x: M + 3, y: y - 8 - i * 7, size: 5.6, font: c.reg, color: INK });
    });
    box(c, M, y - 24, 110, 20, 'Data de recebimento');
    box(c, M + 110, y - 24, leftW - 110, 20, 'Identificação e assinatura do recebedor');
    const rx = M + leftW;
    c.page.drawRectangle({ x: rx, y: y - h, width: 100, height: h, borderColor: LINE, borderWidth: 0.5, color: ACCENT_BG });
    c.page.drawText('NF-e', { x: rx + 50 - c.bold.widthOfTextAtSize('NF-e', 11) / 2, y: y - 14, size: 11, font: c.bold, color: ACCENT });
    const n = `Nº ${formatNumber(d.number)}`;
    c.page.drawText(n, { x: rx + 50 - c.bold.widthOfTextAtSize(n, 8) / 2, y: y - 26, size: 8, font: c.bold, color: INK });
    const s = `SÉRIE ${d.series.padStart(3, '0')}`;
    c.page.drawText(s, { x: rx + 50 - c.reg.widthOfTextAtSize(s, 7) / 2, y: y - 36, size: 7, font: c.reg, color: INK });
    y -= h + 5;
    // linha de corte
    for (let x = M; x < M + W; x += 6) c.page.drawLine({ start: { x, y }, end: { x: x + 3, y }, thickness: 0.5, color: MUTED });
    y -= 5;
  }

  // Emitente | DANFE | Chave
  const h = 104;
  const ew = 228;
  const dw = 92;
  const kw = W - ew - dw;
  c.page.drawRectangle({ x: M, y: y - h, width: ew, height: h, borderColor: LINE, borderWidth: 0.5 });
  let tx = M + 6;
  if (c.logo) {
    const lw = 62;
    const lh = Math.min((c.logo.height / c.logo.width) * lw, 62);
    c.page.drawImage(c.logo, { x: M + 6, y: y - 10 - lh, width: (c.logo.width / c.logo.height) * lh, height: lh });
    tx = M + 74;
  }
  const tw = M + ew - tx - 4;
  const emitName = wrap(d.emit.tradeName || d.emit.name, c.bold, 9, tw).slice(0, 2);
  let ey = y - 16;
  emitName.forEach((l) => { c.page.drawText(l, { x: tx, y: ey, size: 9, font: c.bold, color: ACCENT }); ey -= 10; });
  if (d.emit.tradeName && d.emit.tradeName !== d.emit.name) {
    wrap(d.emit.name, c.reg, 6, tw).slice(0, 2).forEach((l) => { c.page.drawText(l, { x: tx, y: ey, size: 6, font: c.reg, color: MUTED }); ey -= 7.5; });
  }
  ey -= 2;
  const addr = [
    [d.emit.street, d.emit.number, d.emit.complement].filter(Boolean).join(', '),
    `${d.emit.district} - ${d.emit.city}/${d.emit.state}`,
    `CEP ${formatCep(d.emit.zip)}${d.emit.phone ? ` · Fone ${d.emit.phone}` : ''}`,
  ];
  addr.forEach((l) => wrap(l, c.reg, 6.3, tw).forEach((w) => { c.page.drawText(w, { x: tx, y: ey, size: 6.3, font: c.reg, color: INK }); ey -= 8; }));

  // Quadro DANFE
  const dx = M + ew;
  c.page.drawRectangle({ x: dx, y: y - h, width: dw, height: h, borderColor: LINE, borderWidth: 0.5 });
  const cx = (t: string, f: PDFFont, s: number, yy: number, col = INK) =>
    c.page.drawText(t, { x: dx + dw / 2 - f.widthOfTextAtSize(t, s) / 2, y: yy, size: s, font: f, color: col });
  cx('DANFE', c.bold, 12, y - 15, ACCENT);
  cx('Documento Auxiliar da', c.reg, 5.6, y - 24);
  cx('Nota Fiscal Eletrônica', c.reg, 5.6, y - 31);
  c.page.drawText('0 - ENTRADA', { x: dx + 8, y: y - 44, size: 5.8, font: c.reg, color: INK });
  c.page.drawText('1 - SAÍDA', { x: dx + 8, y: y - 52, size: 5.8, font: c.reg, color: INK });
  c.page.drawRectangle({ x: dx + dw - 26, y: y - 56, width: 16, height: 16, borderColor: INK, borderWidth: 0.7 });
  c.page.drawText(d.type, { x: dx + dw - 21, y: y - 52, size: 10, font: c.bold, color: INK });
  cx(`Nº ${formatNumber(d.number)}`, c.bold, 8.5, y - 70);
  cx(`SÉRIE ${d.series.padStart(3, '0')}`, c.reg, 7.5, y - 81);
  cx(`FOLHA ${pageNo}/${pages}`, c.reg, 7.5, y - 92);

  // Chave de acesso
  const kx = dx + dw;
  c.page.drawRectangle({ x: kx, y: y - h, width: kw, height: h, borderColor: LINE, borderWidth: 0.5 });
  barcode(c, kx + 8, y - 6, kw - 16, 34, d.accessKey);
  box(c, kx, y - 44, kw, 22, 'Chave de acesso', formatKey(d.accessKey), { align: 'center', size: 7.6, bold: true });
  const consult = 'Consulta de autenticidade no portal nacional da NF-e www.nfe.fazenda.gov.br/portal ou no site da Sefaz Autorizadora';
  wrap(consult, c.reg, 6.3, kw - 10).forEach((l, i) =>
    c.page.drawText(l, { x: kx + kw / 2 - c.reg.widthOfTextAtSize(l, 6.3) / 2, y: y - 76 - i * 8, size: 6.3, font: c.reg, color: INK }),
  );
  y -= h;

  // Natureza | Protocolo
  box(c, M, y, W - 239, 20, 'Natureza da operação', d.operationNature.toUpperCase());
  box(c, M + W - 239, y, 239, 20, 'Protocolo de autorização de uso',
    d.protocol ? `${d.protocol} - ${dateBR(d.authorizedAt)} ${timeBR(d.authorizedAt)}` : '', { bold: true });
  y -= 20;
  const third = W / 3;
  box(c, M, y, third, 20, 'Inscrição estadual', d.emit.ie);
  box(c, M + third, y, third, 20, 'Inscrição estadual do subst. trib.', '');
  box(c, M + 2 * third, y, W - 2 * third, 20, 'CNPJ', formatDoc(d.emit.doc));
  return y - 20 - 4;
}

const COLS: Array<{ key: keyof DanfeItem | 'none'; label: string; w: number; align: 'left' | 'right' | 'center' }> = [
  { key: 'code', label: 'Código', w: 52, align: 'left' },
  { key: 'description', label: 'Descrição do produto/serviço', w: 118, align: 'left' },
  { key: 'ncm', label: 'NCM/SH', w: 38, align: 'center' },
  { key: 'cst', label: 'CSOSN', w: 24, align: 'center' },
  { key: 'cfop', label: 'CFOP', w: 24, align: 'center' },
  { key: 'unit', label: 'Un.', w: 26, align: 'center' },
  { key: 'quantity', label: 'Qtd.', w: 34, align: 'right' },
  { key: 'unitValue', label: 'V. unit.', w: 38, align: 'right' },
  { key: 'discount', label: 'V. desc.', w: 32, align: 'right' },
  { key: 'total', label: 'V. total', w: 42, align: 'right' },
  { key: 'bcIcms', label: 'BC ICMS', w: 34, align: 'right' },
  { key: 'vIcms', label: 'V. ICMS', w: 30, align: 'right' },
  { key: 'vIpi', label: 'V. IPI', w: 28, align: 'right' },
  { key: 'pIcms', label: '%ICMS', w: 20, align: 'right' },
  { key: 'pIpi', label: '%IPI', w: 19, align: 'right' },
];

function cell(it: DanfeItem, key: keyof DanfeItem): string {
  const v = it[key];
  if (key === 'quantity') return qty(v);
  if (key === 'unitValue') return money(v, Number(v) % 1 && String(v).split('.')[1]?.length > 2 ? 4 : 2);
  if (['discount', 'total', 'bcIcms', 'vIcms', 'vIpi', 'pIcms', 'pIpi'].includes(key)) return money(v);
  return v;
}

/** Desenha o cabeçalho da tabela e devolve o y abaixo dele. */
function tableHead(c: Ctx, top: number): number {
  let x = M;
  for (const col of COLS) {
    c.page.drawRectangle({ x, y: top - 14, width: col.w, height: 14, borderColor: LINE, borderWidth: 0.5, color: HEAD_BG });
    const t = fit(col.label.toUpperCase(), c.bold, 5, col.w - 2);
    c.page.drawText(t, { x: x + col.w / 2 - c.bold.widthOfTextAtSize(t, 5) / 2, y: top - 9, size: 5, font: c.bold, color: INK });
    x += col.w;
  }
  return top - 14;
}

function itemHeight(c: Ctx, it: DanfeItem): number {
  return Math.max(1, wrap(it.description, c.reg, 6, COLS[1].w - 4).length) * 7 + 4;
}

function drawItem(c: Ctx, top: number, it: DanfeItem): number {
  const lines = wrap(it.description, c.reg, 6, COLS[1].w - 4);
  const h = itemHeight(c, it);
  let x = M;
  for (const col of COLS) {
    c.page.drawRectangle({ x, y: top - h, width: col.w, height: h, borderColor: LINE, borderWidth: 0.3 });
    if (col.key === 'description') {
      lines.forEach((l, i) => c.page.drawText(l, { x: x + 2, y: top - 7.5 - i * 7, size: 6, font: c.reg, color: INK }));
    } else {
      const size = col.key === 'code' || col.key === 'unit' ? 5.5 : 6;
      const t = fit(cell(it, col.key as keyof DanfeItem), c.reg, size, col.w - 3);
      const tw = c.reg.widthOfTextAtSize(t, size);
      const tx = col.align === 'right' ? x + col.w - 2 - tw : col.align === 'center' ? x + col.w / 2 - tw / 2 : x + 2;
      c.page.drawText(t, { x: tx, y: top - 7.5, size, font: c.reg, color: INK });
    }
    x += col.w;
  }
  return top - h;
}

export interface DanfeOptions {
  cancelled?: boolean;
  /** Nome de marca quando o XML não traz nome fantasia (ex.: "Doces Prigor"). */
  brandName?: string | null;
  /** Telefone quando o XML não traz. */
  phone?: string | null;
  /** Rodapé discreto (ex.: "Emitido pelo PRIGOR"). */
  footer?: string;
}

export async function renderDanfe(xml: string, opts: DanfeOptions = {}): Promise<Buffer> {
  const data = parseNfeXml(xml);
  if (!data.emit.tradeName && opts.brandName) data.emit.tradeName = opts.brandName;
  if (!data.emit.phone && opts.phone) data.emit.phone = opts.phone;
  const pdf = await PDFDocument.create();
  pdf.setTitle(`DANFE NF-e ${data.number} - ${safe(data.emit.tradeName || data.emit.name)}`);
  pdf.setProducer('PRIGOR');
  const reg = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let logo: PDFImage | null = null;
  try {
    const bytes = logoBytes();
    logo = bytes ? await pdf.embedPng(bytes) : null;
  } catch {
    logo = null;
  }

  const ctx: Ctx = { pdf, page: pdf.addPage(A4), reg, bold, logo, data, cancelled: Boolean(opts.cancelled) };

  // Altura reservada aos dados adicionais (1ª página).
  const infLines = wrap(data.infCpl, reg, 6.5, W - 190 - 6);
  const addH = Math.max(70, infLines.length * 8 + 16);

  // Quantas folhas? Primeiro simula o espaço dos itens.
  const firstItemsSpace = (): number => {
    // topo - canhoto(54) - cabeçalho(148) - destinatário(9+60) - fatura(9+22) - imposto(9+40) - transp(9+60) - título itens(9) - head(14) - adicionais(9+addH) - rodapé(14)
    return A4[1] - M - 54 - 148 - 69 - 31 - 49 - 69 - 9 - 14 - (9 + addH) - 14;
  };
  const otherSpace = A4[1] - M - 148 - 9 - 14 - 14 - M;
  const heights = data.items.map((it) => itemHeight(ctx, it));
  let pages = 1;
  let room = firstItemsSpace();
  for (const h of heights) {
    if (h > room) { pages++; room = otherSpace; }
    room -= h;
  }

  // ── Página 1 ──
  let y = header(ctx, A4[1] - M, 1, pages, true);
  const d = data;

  y = title(ctx, y, 'DESTINATÁRIO / REMETENTE');
  box(ctx, M, y, W - 220, 20, 'Nome / razão social', d.dest.name, { bold: true });
  box(ctx, M + W - 220, y, 120, 20, 'CNPJ / CPF', formatDoc(d.dest.doc));
  box(ctx, M + W - 100, y, 100, 20, 'Data da emissão', dateBR(d.issuedAt));
  y -= 20;
  box(ctx, M, y, 239, 20, 'Endereço', [d.dest.street, d.dest.number, d.dest.complement].filter(Boolean).join(', '));
  box(ctx, M + 239, y, 140, 20, 'Bairro / distrito', d.dest.district);
  box(ctx, M + 379, y, 80, 20, 'CEP', formatCep(d.dest.zip));
  box(ctx, M + W - 100, y, 100, 20, 'Data da saída', '');
  y -= 20;
  box(ctx, M, y, 189, 20, 'Município', d.dest.city);
  box(ctx, M + 189, y, 30, 20, 'UF', d.dest.state, { align: 'center' });
  box(ctx, M + 219, y, 110, 20, 'Fone / fax', d.dest.phone);
  box(ctx, M + 329, y, 130, 20, 'Inscrição estadual', d.dest.ie);
  box(ctx, M + W - 100, y, 100, 20, 'Hora da saída', '');
  y -= 24;

  y = title(ctx, y, 'FATURA / DUPLICATAS');
  if (d.billing.installments.length) {
    const cw = Math.min(110, W / Math.max(d.billing.installments.length, 1));
    d.billing.installments.slice(0, 5).forEach((p, i) => {
      box(ctx, M + i * cw, y, cw, 22, `Dup. ${p.number}`, `${dateBR(p.dueDate)}  R$ ${money(p.value)}`, { bold: true });
    });
    const rest = W - Math.min(5, d.billing.installments.length) * cw;
    if (rest > 4) box(ctx, M + W - rest, y, rest, 22, d.billing.invoice ? `Fatura ${d.billing.invoice.number}` : '', d.billing.invoice ? `Valor líquido R$ ${money(d.billing.invoice.net)}` : '');
  } else {
    const pay = d.payments.map((p) => PAYMENT[p.code] ?? `Forma ${p.code}`).join(' · ');
    box(ctx, M, y, W, 22, 'Pagamento', pay ? `${pay} · R$ ${money(d.totals.vNF)}` : 'À vista');
  }
  y -= 26;

  y = title(ctx, y, 'CÁLCULO DO IMPOSTO');
  const t = d.totals;
  const c5 = W / 5;
  box(ctx, M, y, c5, 20, 'Base de cálc. do ICMS', money(t.vBC), { align: 'right' });
  box(ctx, M + c5, y, c5, 20, 'Valor do ICMS', money(t.vICMS), { align: 'right' });
  box(ctx, M + 2 * c5, y, c5, 20, 'Base de cálc. ICMS ST', money(t.vBCST), { align: 'right' });
  box(ctx, M + 3 * c5, y, c5, 20, 'Valor do ICMS ST', money(t.vST), { align: 'right' });
  box(ctx, M + 4 * c5, y, W - 4 * c5, 20, 'Valor total dos produtos', money(t.vProd), { align: 'right' });
  y -= 20;
  const c6 = (W - 120) / 5;
  box(ctx, M, y, c6, 20, 'Valor do frete', money(t.vFrete), { align: 'right' });
  box(ctx, M + c6, y, c6, 20, 'Valor do seguro', money(t.vSeg), { align: 'right' });
  box(ctx, M + 2 * c6, y, c6, 20, 'Desconto', money(t.vDesc), { align: 'right' });
  box(ctx, M + 3 * c6, y, c6, 20, 'Outras despesas', money(t.vOutro), { align: 'right' });
  box(ctx, M + 4 * c6, y, c6, 20, 'Valor do IPI', money(t.vIPI), { align: 'right' });
  box(ctx, M + W - 120, y, 120, 20, 'Valor total da nota', `R$ ${money(t.vNF)}`, { align: 'right', bold: true, size: 9, fill: ACCENT_BG, color: ACCENT });
  y -= 24;

  y = title(ctx, y, 'TRANSPORTADOR / VOLUMES TRANSPORTADOS');
  const tr = d.transport;
  box(ctx, M, y, 200, 20, 'Razão social', tr.carrierName);
  box(ctx, M + 200, y, 100, 20, 'Frete por conta', FRETE[tr.mode] ?? tr.mode);
  box(ctx, M + 300, y, 60, 20, 'Código ANTT', '');
  box(ctx, M + 360, y, 60, 20, 'Placa do veículo', '');
  box(ctx, M + 420, y, 25, 20, 'UF', '');
  box(ctx, M + 445, y, W - 445, 20, 'CNPJ / CPF', tr.carrierDoc ? formatDoc(tr.carrierDoc) : '');
  y -= 20;
  box(ctx, M, y, 250, 20, 'Endereço', tr.carrierAddress);
  box(ctx, M + 250, y, 170, 20, 'Município', tr.carrierCity);
  box(ctx, M + 420, y, 25, 20, 'UF', tr.carrierState);
  box(ctx, M + 445, y, W - 445, 20, 'Inscrição estadual', tr.carrierIe);
  y -= 20;
  const c6b = W / 6;
  [['Quantidade', tr.volumes], ['Espécie', tr.species], ['Marca', tr.brand], ['Numeração', tr.numbering],
    ['Peso bruto', tr.grossWeight ? money(tr.grossWeight, 3) : ''], ['Peso líquido', tr.netWeight ? money(tr.netWeight, 3) : '']]
    .forEach(([l, v], i) => box(ctx, M + i * c6b, y, i === 5 ? W - 5 * c6b : c6b, 20, l, v));
  y -= 24;

  y = title(ctx, y, 'DADOS DOS PRODUTOS / SERVIÇOS');
  y = tableHead(ctx, y);
  const addTop = M + 14 + 9 + addH; // topo do bloco de dados adicionais

  let pageNo = 1;
  for (const it of data.items) {
    const h = itemHeight(ctx, it);
    const limit = pageNo === 1 ? addTop : M + 14;
    if (y - h < limit) {
      watermark(ctx);
      if (pageNo === 1) drawAdditional(ctx, infLines, addH, opts.footer);
      ctx.page = pdf.addPage(A4);
      pageNo++;
      y = header(ctx, A4[1] - M, pageNo, pages, false);
      y = title(ctx, y, 'DADOS DOS PRODUTOS / SERVIÇOS (continuação)');
      y = tableHead(ctx, y);
    }
    y = drawItem(ctx, y, it);
  }
  if (pageNo === 1) drawAdditional(ctx, infLines, addH, opts.footer);
  watermark(ctx);

  return Buffer.from(await pdf.save());
}

const PAYMENT: Record<string, string> = {
  '01': 'Dinheiro', '03': 'Cartão de crédito', '04': 'Cartão de débito', '15': 'Boleto', '17': 'Pix', '90': 'Sem pagamento', '99': 'Outros',
};

function drawAdditional(c: Ctx, lines: string[], h: number, footer?: string): void {
  const top = M + 14 + 9 + h;
  c.page.drawText('DADOS ADICIONAIS', { x: M, y: top + 2, size: 6.5, font: c.bold, color: ACCENT });
  const fiscoW = 190;
  box(c, M, top, W - fiscoW, h, 'Informações complementares');
  lines.slice(0, Math.floor((h - 12) / 8)).forEach((l, i) =>
    c.page.drawText(l, { x: M + 3, y: top - 15 - i * 8, size: 6.5, font: c.reg, color: INK }),
  );
  box(c, M + W - fiscoW, top, fiscoW, h, 'Reservado ao fisco');
  if (c.data.infAdFisco) {
    wrap(c.data.infAdFisco, c.reg, 6, fiscoW - 6).slice(0, 8).forEach((l, i) =>
      c.page.drawText(l, { x: M + W - fiscoW + 3, y: top - 15 - i * 7.5, size: 6, font: c.reg, color: INK }),
    );
  }
  const f = safe(footer ?? '');
  if (f) c.page.drawText(f, { x: M + W / 2 - c.reg.widthOfTextAtSize(f, 6) / 2, y: M + 2, size: 6, font: c.reg, color: MUTED });
}
