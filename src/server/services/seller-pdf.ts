/**
 * PDF de fechamento e comissão individual do vendedor.
 *
 * Gera um relatório elegante com os totais vendidos, comissão direta,
 * comissão de supervisão (se aplicável), adiantamentos e líquido a pagar,
 * além do detalhamento de todos os clientes atendidos e pedidos.
 */
import fs from 'node:fs';
import path from 'node:path';

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { SellerReportRow } from './reports';
import { DEFAULT_COMPANY, type CompanyInfo } from './order-pdf';

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 36;
const LINE = 13;
const RIGHT = A4[0] - MARGIN;

const INK = rgb(0.12, 0.12, 0.13);
const MUTED = rgb(0.42, 0.42, 0.45);
const RULE = rgb(0.85, 0.85, 0.88);
const BAR = rgb(0.95, 0.95, 0.96);
const BRAND_AMBER = rgb(0.72, 0.35, 0.08);
const SUCCESS_GREEN = rgb(0.1, 0.55, 0.25);

/** Helvetica (WinAnsi) não codifica todo Unicode: troca o que não cabe por '?'. */
function safe(value: string): string {
  return value.replace(/[^\u0020-\u007E\u00A0-\u00FF\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u2026\u20AC]/g, '?');
}

function pct(value: number): string {
  return `${value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function brl(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(val: string): string {
  if (!val) return '—';
  const parts = val.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return val;
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

function center(page: PDFPage, value: string, centerX: number, y: number, font: PDFFont, size: number, color = INK): void {
  page.drawText(value, { x: centerX - font.widthOfTextAtSize(value, size) / 2, y, size, font, color });
}

interface Writer {
  page: PDFPage;
  y: number;
}

export async function renderSellerReportPdf(
  seller: SellerReportRow,
  period: { from: string; to: string },
  company: CompanyInfo = DEFAULT_COMPANY,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page = pdf.addPage(A4);
  const w: Writer = { page, y: A4[1] - MARGIN };

  pdf.setTitle(`Fechamento Comercial — ${seller.sellerName}`);
  pdf.setProducer(company.name);
  pdf.setCreationDate(new Date());

  const checkPage = (requiredSpace: number) => {
    if (w.y - requiredSpace < MARGIN + 30) {
      page = pdf.addPage(A4);
      w.page = page;
      w.y = A4[1] - MARGIN;
      // Cabeçalho da página continuada
      page.drawText(`Fechamento Comercial: ${safe(seller.sellerName)} (continuação)`, {
        x: MARGIN,
        y: w.y,
        size: 9,
        font: bold,
        color: MUTED,
      });
      w.y -= LINE + 10;
    }
  };

  // ── CABEÇALHO COM LOGO E DADOS ───────────────────────────────────────────
  const headerTop = w.y;
  try {
    const logoBytes = fs.readFileSync(path.join(process.cwd(), 'logo.png'));
    const logo = await pdf.embedPng(logoBytes);
    const logoW = 85;
    const logoH = (logo.height / logo.width) * logoW;
    page.drawImage(logo, { x: MARGIN, y: headerTop - logoH + 8, width: logoW, height: logoH });
  } catch {
    // segue sem imagem
  }

  // Título e dados da empresa à direita
  right(page, 'FECHAMENTO & COMISSIONAMENTO', RIGHT, headerTop, bold, 12, BRAND_AMBER);
  right(page, `Período: ${formatDate(period.from)} até ${formatDate(period.to)}`, RIGHT, headerTop - LINE - 2, bold, 9, INK);
  right(page, company.name, RIGHT, headerTop - (LINE * 2) - 4, regular, 8, MUTED);
  right(page, `CNPJ: ${company.cnpj} · Tel: ${company.phone}`, RIGHT, headerTop - (LINE * 3) - 4, regular, 8, MUTED);

  w.y = headerTop - 55;

  // Linha divisória
  page.drawLine({
    start: { x: MARGIN, y: w.y },
    end: { x: RIGHT, y: w.y },
    thickness: 1,
    color: BRAND_AMBER,
  });
  w.y -= 16;

  // ── QUADRO DE IDENTIFICAÇÃO DO VENDEDOR ──────────────────────────────────
  page.drawRectangle({
    x: MARGIN,
    y: w.y - 32,
    width: RIGHT - MARGIN,
    height: 38,
    color: BAR,
  });

  page.drawText('VENDEDOR / REPRESENTANTE:', { x: MARGIN + 10, y: w.y - 8, size: 8, font: bold, color: MUTED });
  page.drawText(safe(seller.sellerName).toUpperCase(), { x: MARGIN + 10, y: w.y - 23, size: 12, font: bold, color: INK });

  if (seller.supervisorName) {
    right(page, `Supervisor: ${safe(seller.supervisorName)}`, RIGHT - 10, w.y - 12, bold, 9, INK);
  } else if (seller.subordinatesCount > 0) {
    right(page, `SUPERVISOR DE EQUIPE (${seller.subordinatesCount} vendedores subordinados)`, RIGHT - 10, w.y - 12, bold, 8.5, BRAND_AMBER);
  }

  w.y -= 46;

  // ── QUADRO RESUMO DE COMISSÃO E PAGAMENTO ────────────────────────────────
  const boxH = 68;
  page.drawRectangle({
    x: MARGIN,
    y: w.y - boxH,
    width: RIGHT - MARGIN,
    height: boxH,
    borderColor: RULE,
    borderWidth: 1,
    color: rgb(1, 1, 1),
  });

  const colW = (RIGHT - MARGIN) / 4;

  // Col 1: Total Realizado
  page.drawText('TOTAL VENDIDO', { x: MARGIN + 10, y: w.y - 14, size: 7.5, font: bold, color: MUTED });
  page.drawText(brl(seller.realized), { x: MARGIN + 10, y: w.y - 30, size: 12, font: bold, color: INK });
  page.drawText(`${seller.orders} pedido(s) faturado(s)`, { x: MARGIN + 10, y: w.y - 44, size: 7.5, font: regular, color: MUTED });

  // Col 2: Comissão Direta
  page.drawText('COMISSÃO DIRETA', { x: MARGIN + colW + 10, y: w.y - 14, size: 7.5, font: bold, color: MUTED });
  page.drawText(brl(seller.commission), { x: MARGIN + colW + 10, y: w.y - 30, size: 12, font: bold, color: INK });
  if (seller.supervisorCommission > 0) {
    page.drawText(`+ ${brl(seller.supervisorCommission)} de supervisão`, { x: MARGIN + colW + 10, y: w.y - 44, size: 7.5, font: bold, color: BRAND_AMBER });
  } else {
    page.drawText('Sobre vendas da própria carteira', { x: MARGIN + colW + 10, y: w.y - 44, size: 7.5, font: regular, color: MUTED });
  }

  // Col 3: Adiantamentos / Vales
  page.drawText('ADIANTAMENTOS / VALES', { x: MARGIN + (colW * 2) + 10, y: w.y - 14, size: 7.5, font: bold, color: MUTED });
  page.drawText(`- ${brl(seller.advancesTotal)}`, { x: MARGIN + (colW * 2) + 10, y: w.y - 30, size: 12, font: bold, color: seller.advancesTotal > 0 ? rgb(0.8, 0.1, 0.1) : MUTED });
  page.drawText(seller.advancesTotal > 0 ? 'Desconto abatido na comissão' : 'Nenhum adiantamento no período', { x: MARGIN + (colW * 2) + 10, y: w.y - 44, size: 7.5, font: regular, color: MUTED });

  // Col 4: Líquido a Pagar
  page.drawRectangle({
    x: MARGIN + (colW * 3),
    y: w.y - boxH,
    width: colW,
    height: boxH,
    color: rgb(0.92, 0.97, 0.93),
  });
  page.drawText('LÍQUIDO A RECEBER', { x: MARGIN + (colW * 3) + 10, y: w.y - 14, size: 8, font: bold, color: SUCCESS_GREEN });
  page.drawText(brl(seller.netCommission), { x: MARGIN + (colW * 3) + 10, y: w.y - 34, size: 14, font: bold, color: SUCCESS_GREEN });
  page.drawText('Valor final aprovado', { x: MARGIN + (colW * 3) + 10, y: w.y - 48, size: 7.5, font: bold, color: MUTED });

  w.y -= boxH + 20;

  // ── SEÇÃO DE CLIENTES E PEDIDOS ──────────────────────────────────────────
  page.drawText(`CLIENTES ATENDIDOS & PEDIDOS REALIZADOS (${seller.customers.length} clientes)`, {
    x: MARGIN,
    y: w.y,
    size: 9.5,
    font: bold,
    color: INK,
  });
  w.y -= 14;

  // Cabeçalho da tabela de clientes
  page.drawRectangle({
    x: MARGIN,
    y: w.y - 14,
    width: RIGHT - MARGIN,
    height: 18,
    color: BAR,
  });
  page.drawText('CLIENTE / PONTO DE VENDA', { x: MARGIN + 6, y: w.y - 9, size: 8, font: bold, color: MUTED });
  page.drawText('PEDIDOS', { x: MARGIN + 230, y: w.y - 9, size: 8, font: bold, color: MUTED });
  page.drawText('VALOR TOTAL', { x: RIGHT - 140, y: w.y - 9, size: 8, font: bold, color: MUTED });
  right(page, 'COMISSÃO', RIGHT - 6, w.y - 9, bold, 8, MUTED);

  w.y -= 20;

  for (const cust of seller.customers) {
    checkPage(30 + (cust.orders.length * 14));

    // Linha do cliente
    page.drawRectangle({
      x: MARGIN,
      y: w.y - 13,
      width: RIGHT - MARGIN,
      height: 16,
      color: rgb(0.98, 0.98, 0.99),
    });

    const custName = fit(safe(cust.customerName), bold, 8.5, 215);
    page.drawText(custName, { x: MARGIN + 6, y: w.y - 9, size: 8.5, font: bold, color: INK });
    page.drawText(`${cust.ordersCount} pedido(s)`, { x: MARGIN + 230, y: w.y - 9, size: 8, font: regular, color: MUTED });
    page.drawText(brl(cust.total), { x: RIGHT - 140, y: w.y - 9, size: 8.5, font: bold, color: INK });
    right(page, brl(cust.commissionVal), RIGHT - 6, w.y - 9, bold, 8.5, SUCCESS_GREEN);
    w.y -= 16;

    // Subtabela de pedidos daquele cliente
    for (const ord of cust.orders) {
      checkPage(14);
      page.drawText(`> Pedido #${ord.numero}  ·  Data: ${formatDate(ord.orderDate)}  ·  Status: ${safe(ord.status).toUpperCase()}`, {
        x: MARGIN + 20,
        y: w.y - 8,
        size: 7.5,
        font: regular,
        color: MUTED,
      });
      page.drawText(brl(ord.total), { x: RIGHT - 140, y: w.y - 8, size: 7.5, font: regular, color: INK });
      right(page, brl(ord.commissionVal), RIGHT - 6, w.y - 8, regular, 7.5, MUTED);
      w.y -= 13;
    }

    w.y -= 4;
  }

  // ── SEÇÃO DE ASSINATURAS ─────────────────────────────────────────────────
  checkPage(70);
  w.y -= 30;

  const signW = 190;
  // Assinatura Empresa
  page.drawLine({
    start: { x: MARGIN + 20, y: w.y },
    end: { x: MARGIN + 20 + signW, y: w.y },
    thickness: 0.8,
    color: MUTED,
  });
  center(page, company.name, MARGIN + 20 + (signW / 2), w.y - 12, bold, 8, INK);
  center(page, 'Gerência Comercial / Financeiro', MARGIN + 20 + (signW / 2), w.y - 22, regular, 7.5, MUTED);

  // Assinatura Vendedor
  page.drawLine({
    start: { x: RIGHT - 20 - signW, y: w.y },
    end: { x: RIGHT - 20, y: w.y },
    thickness: 0.8,
    color: MUTED,
  });
  center(page, safe(seller.sellerName), RIGHT - 20 - (signW / 2), w.y - 12, bold, 8, INK);
  center(page, 'De acordo / Recebido', RIGHT - 20 - (signW / 2), w.y - 22, regular, 7.5, MUTED);

  return pdf.save();
}


// ── RELATÓRIO GERAL (todos os vendedores) ───────────────────────────────────
const A4_LANDSCAPE: [number, number] = [841.89, 595.28];

export async function renderSellersSummaryPdf(
  rows: SellerReportRow[],
  period: { from: string; to: string },
  company: CompanyInfo = DEFAULT_COMPANY,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const W = A4_LANDSCAPE[0];
  const H = A4_LANDSCAPE[1];
  const R = W - MARGIN;

  pdf.setTitle('Relatório de Vendedores & Supervisão');
  pdf.setProducer(company.name);
  pdf.setCreationDate(new Date());

  // bordas direitas de cada coluna numérica
  const cols: Array<{ label: string; edge: number }> = [
    { label: 'PEDIDOS', edge: 275 },
    { label: 'REALIZADO', edge: 360 },
    { label: 'COM. DIRETA', edge: 440 },
    { label: 'SUPERVISÃO', edge: 510 },
    { label: 'ADIANT.', edge: 585 },
    { label: 'LÍQUIDO A PAGAR', edge: 670 },
    { label: 'META', edge: 745 },
    { label: '% META', edge: R - 6 },
  ];

  let page = pdf.addPage(A4_LANDSCAPE);
  let y = H - MARGIN;

  const drawTableHeader = () => {
    page.drawRectangle({ x: MARGIN, y: y - 14, width: R - MARGIN, height: 18, color: BAR });
    page.drawText('VENDEDOR / EQUIPE', { x: MARGIN + 6, y: y - 9, size: 8, font: bold, color: MUTED });
    for (const c of cols) right(page, c.label, c.edge, y - 9, bold, 7.5, MUTED);
    y -= 22;
  };

  // Cabeçalho do documento
  try {
    const logoBytes = fs.readFileSync(path.join(process.cwd(), 'logo.png'));
    const logo = await pdf.embedPng(logoBytes);
    const logoW = 85;
    const logoH = (logo.height / logo.width) * logoW;
    page.drawImage(logo, { x: MARGIN, y: y - logoH + 8, width: logoW, height: logoH });
  } catch {
    // segue sem imagem
  }
  right(page, 'RELATÓRIO DE VENDEDORES & SUPERVISÃO', R, y, bold, 12, BRAND_AMBER);
  right(page, `Período: ${formatDate(period.from)} até ${formatDate(period.to)}`, R, y - LINE - 2, bold, 9, INK);
  right(page, safe(company.name), R, y - LINE * 2 - 4, regular, 8, MUTED);
  y -= 55;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: R, y }, thickness: 1, color: BRAND_AMBER });
  y -= 14;

  drawTableHeader();

  const newPage = () => {
    page = pdf.addPage(A4_LANDSCAPE);
    y = H - MARGIN;
    page.drawText('Relatório de Vendedores & Supervisão (continuação)', { x: MARGIN, y, size: 9, font: bold, color: MUTED });
    y -= LINE + 10;
    drawTableHeader();
  };

  const rowValues = (r: SellerReportRow): string[] => [
    String(r.orders),
    brl(r.realized),
    brl(r.commission),
    brl(r.supervisorCommission),
    r.advancesTotal > 0 ? `- ${brl(r.advancesTotal)}` : brl(0),
    brl(r.netCommission),
    brl(r.goal),
    pct(r.pctGoal),
  ];

  for (const r of rows) {
    if (y - 18 < MARGIN + 40) newPage();
    const label = r.subordinatesCount > 0 ? `${r.sellerName} (supervisor)` : r.sellerName;
    page.drawText(fit(safe(label), bold, 8.5, 190), { x: MARGIN + 6, y: y - 9, size: 8.5, font: bold, color: INK });
    const vals = rowValues(r);
    cols.forEach((c, i) => {
      const isNet = i === 5;
      const isAdv = i === 4 && r.advancesTotal > 0;
      right(page, vals[i], c.edge, y - 9, isNet ? bold : regular, 8, isNet ? SUCCESS_GREEN : isAdv ? rgb(0.8, 0.1, 0.1) : INK);
    });
    page.drawLine({ start: { x: MARGIN, y: y - 14 }, end: { x: R, y: y - 14 }, thickness: 0.4, color: RULE });
    y -= 17;
  }

  // Linha de totais
  if (y - 24 < MARGIN + 40) newPage();
  const tot = rows.reduce(
    (a, r) => ({
      orders: a.orders + r.orders,
      realized: a.realized + r.realized,
      commission: a.commission + r.commission,
      supervisorCommission: a.supervisorCommission + r.supervisorCommission,
      advancesTotal: a.advancesTotal + r.advancesTotal,
      netCommission: a.netCommission + r.netCommission,
      goal: a.goal + r.goal,
    }),
    { orders: 0, realized: 0, commission: 0, supervisorCommission: 0, advancesTotal: 0, netCommission: 0, goal: 0 },
  );
  page.drawRectangle({ x: MARGIN, y: y - 16, width: R - MARGIN, height: 20, color: rgb(0.92, 0.97, 0.93) });
  page.drawText('TOTAL GERAL', { x: MARGIN + 6, y: y - 10, size: 8.5, font: bold, color: INK });
  const totVals = [
    String(tot.orders),
    brl(tot.realized),
    brl(tot.commission),
    brl(tot.supervisorCommission),
    tot.advancesTotal > 0 ? `- ${brl(tot.advancesTotal)}` : brl(0),
    brl(tot.netCommission),
    brl(tot.goal),
    pct(tot.goal > 0 ? (tot.realized / tot.goal) * 100 : 0),
  ];
  cols.forEach((c, i) => right(page, totVals[i], c.edge, y - 10, bold, 8.5, i === 5 ? SUCCESS_GREEN : INK));

  // Rodapé com numeração
  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    center(p, `${safe(company.name)} · Página ${i + 1} de ${pages.length}`, W / 2, 20, regular, 7.5, MUTED);
  });

  return pdf.save();
}
