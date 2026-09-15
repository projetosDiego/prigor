/**
 * PDF do pedido — layout "PEDIDO DE VENDA".
 *
 * Desenhado com pdf-lib (JS puro, sem binário nativo nem navegador headless).
 * Segue o modelo do documento entregue ao cliente: cabeçalho com dados da
 * empresa, blocos de cobrança/entrega, tabela de itens, totais, condições de
 * pagamento, observações e linhas de assinatura.
 */
import fs from 'node:fs';
import path from 'node:path';

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

import { formatBRL } from '../domain/money';
import type { OrderDTO } from './serializers';

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 42;
const LINE = 14;
const RIGHT = A4[0] - MARGIN;

const INK = rgb(0.12, 0.12, 0.13);
const MUTED = rgb(0.42, 0.42, 0.45);
const RULE = rgb(0.8, 0.8, 0.82);
const BAR = rgb(0.9, 0.9, 0.92);
const ACCENT = rgb(0.72, 0.45, 0.11);

export interface CompanyInfo {
  name: string;
  legalName: string;
  cnpj: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  phone: string;
  email: string;
}

export const DEFAULT_COMPANY: CompanyInfo = {
  name: process.env.COMPANY_NAME ?? 'Doces Prigor',
  legalName: process.env.COMPANY_LEGAL_NAME ?? 'Doces Prigor',
  cnpj: process.env.COMPANY_CNPJ ?? '',
  address: process.env.COMPANY_ADDRESS ?? '',
  city: process.env.COMPANY_CITY ?? 'Rio de Janeiro',
  state: process.env.COMPANY_STATE ?? 'RJ',
  zipCode: process.env.COMPANY_ZIP ?? '',
  phone: process.env.COMPANY_PHONE ?? '',
  email: process.env.COMPANY_EMAIL ?? '',
};

const PAYMENT_LABEL: Record<string, string> = {
  dinheiro: 'Dinheiro',
  pix: 'PIX',
  debito: 'Cartão de Débito',
  credito: 'Cartão de Crédito',
  boleto: 'Boleto',
  transferencia: 'Transferência',
};

function formatDate(value: string | null): string {
  if (!value) return '—';
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

function onlyDigits(v: string): string {
  return (v || '').replace(/\D/g, '');
}

function formatDoc(cnpj: string | null): string {
  const d = onlyDigits(cnpj ?? '');
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  return cnpj ?? '';
}

function formatCep(v: string | null): string {
  const d = onlyDigits(v ?? '');
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : (v ?? '');
}

function formatPhone(v: string | null): string {
  const d = onlyDigits(v ?? '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return v ?? '';
}

interface Writer {
  page: PDFPage;
  y: number;
}

function fit(value: string, font: PDFFont, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(value, size) <= maxWidth) return value;
  let out = value;
  while (out.length > 1 && font.widthOfTextAtSize(`${out}…`, size) > maxWidth) out = out.slice(0, -1);
  return `${out}…`;
}

function right(page: PDFPage, value: string, edge: number, y: number, font: PDFFont, size: number, color = INK): void {
  page.drawText(value, { x: edge - font.widthOfTextAtSize(value, size), y, size, font, color });
}

function center(page: PDFPage, value: string, cx: number, y: number, font: PDFFont, size: number, color = INK): void {
  page.drawText(value, { x: cx - font.widthOfTextAtSize(value, size) / 2, y, size, font, color });
}

function wrap(value: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = value.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else current = candidate;
  }
  if (current) lines.push(current);
  return lines;
}

export async function renderOrderPdf(
  order: OrderDTO,
  company: CompanyInfo = DEFAULT_COMPANY,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const page = pdf.addPage(A4);
  const w: Writer = { page, y: A4[1] - MARGIN };

  pdf.setTitle(`Pedido ${order.numero} — ${company.name}`);
  pdf.setProducer(company.name);
  pdf.setCreationDate(new Date());

  // ── Título ────────────────────────────────────────────────────────────────
  page.drawText(`Pedido: ${order.numero}`, { x: MARGIN, y: w.y, size: 11, font: bold, color: INK });
  w.y -= LINE + 6;

  // ── Cabeçalho: logo + dados da empresa ─────────────────────────────────────
  const headerTop = w.y;
  try {
    const logoBytes = fs.readFileSync(path.join(process.cwd(), 'logo.png'));
    const logo = await pdf.embedPng(logoBytes);
    const logoW = 78;
    const logoH = (logo.height / logo.width) * logoW;
    page.drawImage(logo, { x: MARGIN, y: headerTop - logoH + 6, width: logoW, height: logoH });
  } catch {
    // Sem logo: segue sem imagem.
  }

  const companyLines = [
    company.legalName,
    company.cnpj ? `CNPJ: ${formatDoc(company.cnpj)}` : '',
    company.address,
    [company.zipCode ? formatCep(company.zipCode) : '', company.city && `${company.city} - ${company.state}`]
      .filter(Boolean)
      .join(' - '),
    company.phone ? formatPhone(company.phone) : '',
  ].filter(Boolean);

  let cy = headerTop;
  for (const line of companyLines) {
    right(page, line, RIGHT, cy, regular, 8, MUTED);
    cy -= LINE - 3;
  }

  w.y = Math.min(headerTop - 70, cy) - 6;

  // ── Helpers de seção ────────────────────────────────────────────────────────
  const sectionTitle = (title: string): void => {
    page.drawRectangle({ x: MARGIN, y: w.y - 2, width: RIGHT - MARGIN, height: 13, color: BAR });
    page.drawRectangle({ x: MARGIN, y: w.y - 2, width: 3, height: 13, color: ACCENT });
    page.drawText(title, { x: MARGIN + 8, y: w.y + 1, size: 8.5, font: bold, color: INK });
    w.y -= LINE + 6;
  };
  const pair = (label: string, value: string, x: number, valueColor = INK): number => {
    page.drawText(label, { x, y: w.y, size: 8, font: regular, color: MUTED });
    const lw = regular.widthOfTextAtSize(label, 8);
    page.drawText(value || '—', { x: x + lw + 4, y: w.y, size: 9, font: bold, color: valueColor });
    return x + lw + 4 + bold.widthOfTextAtSize(value || '—', 9);
  };

  // ── PEDIDO DE VENDA ─────────────────────────────────────────────────────────
  sectionTitle('PEDIDO DE VENDA');
  pair('Pedido:', String(order.numero), MARGIN);
  pair('Vendedor:', order.sellerName ?? 'Administrador', MARGIN + 150);
  w.y -= LINE;
  const cliente = order.customerLegalName && order.customerLegalName !== order.customerName
    ? `${order.customerName} (${order.customerLegalName})`
    : (order.customerName ?? '—');
  pair('Cliente:', fit(cliente, bold, 9, 420), MARGIN);
  w.y -= LINE;
  if (order.customerCnpj) {
    pair('CNPJ:', formatDoc(order.customerCnpj), MARGIN);
    w.y -= LINE;
  }
  pair('Data de criação:', formatDate(order.orderDate), MARGIN);
  pair('Data de entrega:', formatDate(order.deliveryDate), MARGIN + 210);
  w.y -= LINE + 8;

  // ── Endereços ────────────────────────────────────────────────────────────────
  const bill = order.billingAddress ?? order.deliveryAddress;
  const ship = order.deliveryAddress;
  const drawAddress = (titulo: string, a: typeof order.deliveryAddress): void => {
    sectionTitle(titulo);
    pair('Endereço:', a?.address ?? '—', MARGIN);
    pair('Número:', a?.number ?? '—', MARGIN + 300);
    w.y -= LINE;
    pair('Bairro:', a?.neighborhood ?? '—', MARGIN);
    pair('CEP:', a ? formatCep(a.zipCode) : '—', MARGIN + 170);
    pair('Cidade:', a?.city ?? '—', MARGIN + 300);
    pair('Estado:', a?.state ?? '—', MARGIN + 430);
    w.y -= LINE + 8;
  };
  drawAddress('ENDEREÇO DE COBRANÇA', bill);
  drawAddress('ENDEREÇO DE ENTREGA', ship);

  // ── ITENS DO PEDIDO ──────────────────────────────────────────────────────────
  sectionTitle('ITENS DO PEDIDO');
  const C_REF = MARGIN + 6;
  const C_DESC = MARGIN + 82;
  const C_UNID = 330;
  const C_QTD = 400;
  const C_UNIT = 460;
  const C_DESC_V = 505;
  const C_TOTAL = RIGHT - 6;
  const TBL_X = MARGIN;
  const TBL_W = RIGHT - MARGIN;
  const HEAD_H = 17;
  const ROW_H = 17;
  const HEAD_BG = rgb(0.16, 0.17, 0.20);
  const HEAD_FG = rgb(1, 1, 1);
  const ZEBRA = rgb(0.965, 0.965, 0.975);
  const SUM_BG = rgb(0.98, 0.95, 0.88);

  // Faixa de cabeçalho da tabela
  const drawItemsHeader = (): void => {
    w.page.drawRectangle({ x: TBL_X, y: w.y - 5, width: TBL_W, height: HEAD_H, color: HEAD_BG });
    const hy = w.y;
    w.page.drawText('REFERÊNCIA', { x: C_REF, y: hy, size: 7, font: bold, color: HEAD_FG });
    w.page.drawText('DESCRIÇÃO', { x: C_DESC, y: hy, size: 7, font: bold, color: HEAD_FG });
    center(w.page, 'UNID.', C_UNID, hy, bold, 7, HEAD_FG);
    right(w.page, 'QTD.', C_QTD, hy, bold, 7, HEAD_FG);
    right(w.page, 'UNITÁRIO', C_UNIT, hy, bold, 7, HEAD_FG);
    right(w.page, 'DESCONTO', C_DESC_V, hy, bold, 7, HEAD_FG);
    right(w.page, 'TOTAL', C_TOTAL, hy, bold, 7, HEAD_FG);
    w.y -= HEAD_H;
  };
  drawItemsHeader();

  // Linhas dos itens (zebra)
  let totalQty = 0;
  let rowIndex = 0;
  for (const item of order.items) {
    if (w.y < 210) {
      const np = pdf.addPage(A4);
      w.page = np;
      w.y = A4[1] - MARGIN;
      drawItemsHeader();
    }
    if (rowIndex % 2 === 1) {
      w.page.drawRectangle({ x: TBL_X, y: w.y - 5, width: TBL_W, height: ROW_H, color: ZEBRA });
    }
    const ty = w.y;
    totalQty += item.quantity;
    w.page.drawText(fit(item.reference ?? '—', regular, 8, 68), { x: C_REF, y: ty, size: 8, font: regular, color: MUTED });
    w.page.drawText(fit(item.productName ?? '—', bold, 8.5, C_UNID - C_DESC - 55), { x: C_DESC, y: ty, size: 8.5, font: bold, color: INK });
    center(w.page, item.unit ?? 'UN', C_UNID, ty, regular, 8, INK);
    right(w.page, item.quantity.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 3 }), C_QTD, ty, regular, 8, INK);
    right(w.page, formatBRL(item.unitPrice), C_UNIT, ty, regular, 8, INK);
    right(w.page, item.discountItem ? `- ${formatBRL(item.discountItem)}` : '—', C_DESC_V, ty, regular, 8, item.discountItem ? INK : MUTED);
    right(w.page, formatBRL(item.subtotal), C_TOTAL, ty, bold, 8.5, INK);
    w.y -= ROW_H;
    rowIndex += 1;
  }

  // Régua de fechamento da tabela
  page.drawLine({ start: { x: TBL_X, y: w.y + 1 }, end: { x: RIGHT, y: w.y + 1 }, thickness: 0.8, color: RULE });
  w.y -= LINE + 4;

  // Resumo dos itens: quantidade à esquerda, total destacado em caixa à direita
  const SUM_W = 236;
  const SUM_H = 22;
  const sumX = RIGHT - SUM_W;
  const sumY = w.y - 7;
  const sumTextY = sumY + 7;
  page.drawText('Quantidade de itens:', { x: MARGIN, y: sumTextY, size: 8, font: regular, color: MUTED });
  page.drawText(totalQty.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 3 }), {
    x: MARGIN + regular.widthOfTextAtSize('Quantidade de itens:', 8) + 5, y: sumTextY, size: 9, font: bold, color: INK,
  });
  page.drawRectangle({ x: sumX, y: sumY, width: SUM_W, height: SUM_H, color: SUM_BG, borderColor: ACCENT, borderWidth: 0.8 });
  page.drawText('Valor total dos itens', { x: sumX + 12, y: sumTextY, size: 8, font: bold, color: MUTED });
  right(page, formatBRL(order.subtotal), sumX + SUM_W - 12, sumTextY, bold, 11, ACCENT);
  w.y -= SUM_H + 10;

  // ── VALOR TOTAL DE PEDIDO ────────────────────────────────────────────────────
  sectionTitle('VALOR TOTAL DE PEDIDO');
  page.drawText('Total dos Itens', { x: MARGIN, y: w.y, size: 7.5, font: bold, color: MUTED });
  page.drawText('Desconto', { x: MARGIN + 140, y: w.y, size: 7.5, font: bold, color: MUTED });
  page.drawText('Frete', { x: MARGIN + 280, y: w.y, size: 7.5, font: bold, color: MUTED });
  page.drawText('Outros custos', { x: MARGIN + 400, y: w.y, size: 7.5, font: bold, color: MUTED });
  w.y -= LINE;
  page.drawText(formatBRL(order.subtotal), { x: MARGIN, y: w.y, size: 9, font: regular, color: INK });
  page.drawText(order.discount ? `- ${formatBRL(order.discount)}` : 'R$ 0,00', { x: MARGIN + 140, y: w.y, size: 9, font: regular, color: INK });
  page.drawText(order.shipping ? formatBRL(order.shipping) : 'R$ 0,00', { x: MARGIN + 280, y: w.y, size: 9, font: regular, color: INK });
  page.drawText(order.otherCosts ? formatBRL(order.otherCosts) : 'R$ 0,00', { x: MARGIN + 400, y: w.y, size: 9, font: regular, color: INK });
  w.y -= LINE + 14;
  page.drawRectangle({ x: MARGIN, y: w.y - 13, width: RIGHT - MARGIN, height: 30, color: rgb(0.98, 0.93, 0.83) });
  page.drawRectangle({ x: MARGIN, y: w.y - 13, width: 4, height: 30, color: ACCENT });
  page.drawText('VALOR TOTAL DO PEDIDO', { x: MARGIN + 16, y: w.y, size: 11, font: bold, color: INK });
  right(page, formatBRL(order.total), RIGHT - 16, w.y - 3, bold, 18, ACCENT);
  w.y -= 34;

  // ── FORMA / CONDIÇÕES DE PAGAMENTO ────────────────────────────────────────────
  sectionTitle('FORMA / CONDIÇÕES DE PAGAMENTO');
  const P_DESC = MARGIN;
  const P_VENC = MARGIN + 150;
  const P_PGTO = MARGIN + 250;
  const P_VAL = MARGIN + 350;
  const P_SALDO = MARGIN + 430;
  page.drawText('Descrição', { x: P_DESC, y: w.y, size: 7.5, font: bold, color: MUTED });
  page.drawText('Vencimento', { x: P_VENC, y: w.y, size: 7.5, font: bold, color: MUTED });
  page.drawText('Pagamento', { x: P_PGTO, y: w.y, size: 7.5, font: bold, color: MUTED });
  page.drawText('Valor', { x: P_VAL, y: w.y, size: 7.5, font: bold, color: MUTED });
  page.drawText('Saldo', { x: P_SALDO, y: w.y, size: 7.5, font: bold, color: MUTED });
  w.y -= 4;
  page.drawLine({ start: { x: MARGIN, y: w.y }, end: { x: RIGHT, y: w.y }, thickness: 0.6, color: RULE });
  w.y -= LINE;
  const pago = order.paymentStatus === 'pago';
  page.drawText(PAYMENT_LABEL[order.paymentMethod] ?? order.paymentMethod, { x: P_DESC, y: w.y, size: 8, font: regular, color: INK });
  page.drawText(formatDate(order.dueDate), { x: P_VENC, y: w.y, size: 8, font: regular, color: INK });
  page.drawText(pago ? 'Pago' : 'Em aberto', { x: P_PGTO, y: w.y, size: 8, font: regular, color: INK });
  page.drawText(formatBRL(order.total), { x: P_VAL, y: w.y, size: 8, font: regular, color: INK });
  page.drawText(pago ? formatBRL(0) : formatBRL(order.total), { x: P_SALDO, y: w.y, size: 8, font: regular, color: INK });
  w.y -= LINE + 10;

  // ── OBSERVAÇÕES ───────────────────────────────────────────────────────────────
  sectionTitle('OBSERVAÇÕES');
  if (order.notes) {
    for (const line of wrap(order.notes, regular, 9, RIGHT - MARGIN)) {
      if (w.y < 150) {
        const np = pdf.addPage(A4);
        w.page = np;
        w.y = A4[1] - MARGIN;
      }
      w.page.drawText(line, { x: MARGIN, y: w.y, size: 9, font: regular, color: INK });
      w.y -= LINE - 2;
    }
  } else {
    w.y -= LINE * 2;
  }

  // ── Assinaturas ───────────────────────────────────────────────────────────────
  const signY = Math.max(w.y - 30, 90);
  const half = (RIGHT - MARGIN) / 2;
  w.page.drawLine({ start: { x: MARGIN + 20, y: signY }, end: { x: MARGIN + half - 20, y: signY }, thickness: 0.6, color: INK });
  w.page.drawLine({ start: { x: MARGIN + half + 20, y: signY }, end: { x: RIGHT - 20, y: signY }, thickness: 0.6, color: INK });
  center(w.page, 'Assinatura do Comprador', MARGIN + half / 2, signY - 12, regular, 8, MUTED);
  center(w.page, 'Assinatura do Recebedor', MARGIN + half + half / 2, signY - 12, regular, 8, MUTED);

  // Rodapé
  w.page.drawText(
    `Documento gerado em ${new Date().toLocaleString('pt-BR')} · não possui valor fiscal`,
    { x: MARGIN, y: 30, size: 7, font: regular, color: MUTED },
  );

  return pdf.save();
}

/**
 * Gera um único PDF combinando múltiplos pedidos em sequência,
 * permitindo a impressão rápida em lote sem necessidade de abrir cada arquivo individualmente.
 */
export async function renderOrdersBatchPdf(
  orders: OrderDTO[],
  company: CompanyInfo = DEFAULT_COMPANY,
): Promise<Uint8Array> {
  const mergedPdf = await PDFDocument.create();

  for (const order of orders) {
    const singleBytes = await renderOrderPdf(order, company);
    const singleDoc = await PDFDocument.load(singleBytes);
    const copiedPages = await mergedPdf.copyPages(singleDoc, singleDoc.getPageIndices());
    for (const page of copiedPages) {
      mergedPdf.addPage(page);
    }
  }

  return mergedPdf.save();
}
