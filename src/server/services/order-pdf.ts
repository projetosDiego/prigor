/**
 * PDF do pedido.
 *
 * Substitui o `reportlab` do backend Python. Usa `pdf-lib`, que é JavaScript
 * puro: não precisa de binário nativo nem de navegador headless, então o
 * container de produção continua pequeno.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

import { formatBRL } from '../domain/money';
import type { OrderDTO } from './serializers';

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 42;
const LINE = 14;

const INK = rgb(0.12, 0.12, 0.13);
const MUTED = rgb(0.45, 0.45, 0.47);
const RULE = rgb(0.85, 0.85, 0.87);
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

const STATUS_LABEL: Record<string, string> = {
  novo: 'Novo',
  confirmado: 'Confirmado',
  em_producao: 'Em produção',
  entregue: 'Entregue',
  faturado: 'Faturado',
  cancelado: 'Cancelado',
};

const PAYMENT_LABEL: Record<string, string> = {
  dinheiro: 'Dinheiro',
  pix: 'PIX',
  debito: 'Débito',
  credito: 'Crédito',
  boleto: 'Boleto',
  transferencia: 'Transferência',
};

function formatDate(value: string | null): string {
  if (!value) return '—';
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

interface Writer {
  page: PDFPage;
  y: number;
}

function text(
  writer: Writer,
  value: string,
  options: { x?: number; size?: number; font: PDFFont; color?: typeof INK },
): void {
  writer.page.drawText(value, {
    x: options.x ?? MARGIN,
    y: writer.y,
    size: options.size ?? 9,
    font: options.font,
    color: options.color ?? INK,
  });
}

function rule(writer: Writer): void {
  writer.page.drawLine({
    start: { x: MARGIN, y: writer.y },
    end: { x: A4[0] - MARGIN, y: writer.y },
    thickness: 0.6,
    color: RULE,
  });
}

/** Trunca respeitando a largura disponível, sem cortar no meio de forma feia. */
function fit(value: string, font: PDFFont, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(value, size) <= maxWidth) return value;
  let out = value;
  while (out.length > 1 && font.widthOfTextAtSize(`${out}…`, size) > maxWidth) {
    out = out.slice(0, -1);
  }
  return `${out}…`;
}

function right(page: PDFPage, value: string, rightEdge: number, y: number, font: PDFFont, size: number, color = INK): void {
  const width = font.widthOfTextAtSize(value, size);
  page.drawText(value, { x: rightEdge - width, y, size, font, color });
}

export async function renderOrderPdf(
  order: OrderDTO,
  company: CompanyInfo = DEFAULT_COMPANY,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page = pdf.addPage(A4);
  const writer: Writer = { page, y: A4[1] - MARGIN };
  const rightEdge = A4[0] - MARGIN;

  pdf.setTitle(`Pedido ${order.numero} — ${company.name}`);
  pdf.setProducer(company.name);
  pdf.setCreationDate(new Date());

  // Cabeçalho
  text(writer, company.name, { font: bold, size: 18, color: ACCENT });
  right(page, `PEDIDO #${order.numero}`, rightEdge, writer.y, bold, 14);
  writer.y -= LINE + 2;

  const companyLines = [
    company.legalName,
    company.cnpj ? `CNPJ ${company.cnpj}` : '',
    [company.address, company.city && `${company.city}/${company.state}`, company.zipCode]
      .filter(Boolean)
      .join(' · '),
    [company.phone, company.email].filter(Boolean).join(' · '),
  ].filter(Boolean);

  for (const line of companyLines) {
    text(writer, line, { font: regular, size: 8, color: MUTED });
    writer.y -= LINE - 3;
  }

  writer.y -= 4;
  right(page, `Emissão: ${formatDate(order.orderDate)}`, rightEdge, writer.y + 10, regular, 8, MUTED);
  rule(writer);
  writer.y -= LINE + 4;

  // Cliente e condições
  text(writer, 'CLIENTE', { font: bold, size: 8, color: MUTED });
  text(writer, 'CONDIÇÕES', { font: bold, size: 8, color: MUTED, x: 330 });
  writer.y -= LINE;

  text(writer, fit(order.customerName ?? '—', bold, 11, 270), { font: bold, size: 11 });
  text(writer, `Status: ${STATUS_LABEL[order.status] ?? order.status}`, {
    font: regular,
    size: 9,
    x: 330,
  });
  writer.y -= LINE - 2;

  const address = order.deliveryAddress;
  const addressLine = address
    ? [address.address, address.number, address.neighborhood, address.city]
        .filter(Boolean)
        .join(', ')
    : '';

  if (addressLine) {
    text(writer, fit(addressLine, regular, 9, 270), { font: regular, size: 9, color: MUTED });
  }
  text(writer, `Pagamento: ${PAYMENT_LABEL[order.paymentMethod] ?? order.paymentMethod}`, {
    font: regular,
    size: 9,
    x: 330,
  });
  writer.y -= LINE - 2;

  if (address?.phone) {
    text(writer, `Telefone: ${address.phone}`, { font: regular, size: 9, color: MUTED });
  }
  text(writer, `Entrega: ${formatDate(order.deliveryDate)}`, { font: regular, size: 9, x: 330 });
  writer.y -= LINE - 2;

  text(writer, `Vencimento: ${formatDate(order.dueDate)}`, { font: regular, size: 9, x: 330 });
  writer.y -= LINE + 6;

  // Tabela de itens
  const COL_QTY = 330;
  const COL_UNIT = 400;
  const COL_DISC = 470;
  const COL_TOTAL = rightEdge;

  rule(writer);
  writer.y -= LINE;
  text(writer, 'ITEM', { font: bold, size: 8, color: MUTED });
  right(page, 'QTD', COL_QTY, writer.y, bold, 8, MUTED);
  right(page, 'UNIT.', COL_UNIT, writer.y, bold, 8, MUTED);
  right(page, 'DESC.', COL_DISC, writer.y, bold, 8, MUTED);
  right(page, 'TOTAL', COL_TOTAL, writer.y, bold, 8, MUTED);
  writer.y -= 6;
  rule(writer);
  writer.y -= LINE;

  for (const item of order.items) {
    if (writer.y < 150) {
      page = pdf.addPage(A4);
      writer.page = page;
      writer.y = A4[1] - MARGIN;
    }

    text(writer, fit(item.productName ?? '—', regular, 9, 260), { font: regular, size: 9 });
    right(page, item.quantity.toLocaleString('pt-BR'), COL_QTY, writer.y, regular, 9);
    right(page, formatBRL(item.unitPrice), COL_UNIT, writer.y, regular, 9);
    right(page, item.discountItem ? formatBRL(item.discountItem) : '—', COL_DISC, writer.y, regular, 9);
    right(page, formatBRL(item.subtotal), COL_TOTAL, writer.y, bold, 9);
    writer.y -= LINE;
  }

  writer.y -= 2;
  rule(writer);
  writer.y -= LINE + 2;

  // Totais
  const totals: Array<[string, string, boolean]> = [
    ['Subtotal', formatBRL(order.subtotal), false],
    ...(order.discount ? ([['Desconto', `- ${formatBRL(order.discount)}`, false]] as Array<[string, string, boolean]>) : []),
    ...(order.shipping ? ([['Frete', formatBRL(order.shipping)]] as unknown as Array<[string, string, boolean]>) : []),
    ...(order.otherCosts ? ([['Outros custos', formatBRL(order.otherCosts)]] as unknown as Array<[string, string, boolean]>) : []),
    ['TOTAL', formatBRL(order.total), true],
  ];

  for (const [label, value, strong] of totals) {
    const font = strong ? bold : regular;
    const size = strong ? 12 : 9;
    right(page, label, COL_DISC, writer.y, font, size, strong ? INK : MUTED);
    right(page, value, COL_TOTAL, writer.y, font, size, strong ? ACCENT : INK);
    writer.y -= strong ? LINE + 4 : LINE;
  }

  if (order.notes) {
    writer.y -= 6;
    text(writer, 'OBSERVAÇÕES', { font: bold, size: 8, color: MUTED });
    writer.y -= LINE;
    for (const line of wrap(order.notes, regular, 9, rightEdge - MARGIN)) {
      text(writer, line, { font: regular, size: 9 });
      writer.y -= LINE - 2;
    }
  }

  // Rodapé
  const footer = `Documento gerado em ${new Date().toLocaleString('pt-BR')} · não possui valor fiscal`;
  page.drawText(footer, { x: MARGIN, y: 30, size: 7, font: regular, color: MUTED });

  return pdf.save();
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
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 8);
}
