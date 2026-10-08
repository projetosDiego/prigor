/**
 * Impressão em lote com os documentos de faturamento.
 *
 * Por pedido (gerência):
 *  - com NF autorizada e boleto → DANFE + boleto;
 *  - só boleto                  → espelho do pedido + boleto;
 *  - só NF                      → DANFE;
 *  - nenhum                     → espelho do pedido (como sempre).
 * Vendedor recebe só o espelho. Documento que falhar ao baixar (banco/provedor
 * fora do ar) cai para o espelho e vira aviso — a impressão nunca trava inteira.
 */
import { PDFDocument } from 'pdf-lib';

import { prisma } from '../db';
import { isManagement, type SessionPayload } from '../auth/guard';
import { logger } from '../http/logger';
import { boletoPdf } from './boletos';
import { invoiceDanfe } from './invoices';
import { renderOrderPdf } from './order-pdf';
import type { OrderDTO } from './serializers';

export interface BatchPrintResult {
  pdf: Uint8Array;
  warnings: string[];
  summary: { orders: number; invoices: number; boletos: number; mirrors: number };
}

async function append(target: PDFDocument, bytes: Uint8Array | Buffer): Promise<void> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = await target.copyPages(doc, doc.getPageIndices());
  for (const p of pages) target.addPage(p);
}

export async function renderBatchWithDocuments(
  session: SessionPayload,
  orders: OrderDTO[],
): Promise<BatchPrintResult> {
  const out = await PDFDocument.create();
  const warnings: string[] = [];
  const summary = { orders: orders.length, invoices: 0, boletos: 0, mirrors: 0 };
  const withDocs = isManagement(session);

  const ids = orders.map((o) => o.id);
  const [boletos, invoices] = withDocs
    ? await Promise.all([
        prisma.boleto.findMany({
          where: { orderId: { in: ids }, status: { in: ['registrado', 'pago'] }, nossoNumero: { not: null } },
          select: { id: true, orderId: true },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.invoice.findMany({
          where: { orderId: { in: ids }, status: 'autorizada', providerId: { not: null } },
          select: { id: true, orderId: true },
          orderBy: { createdAt: 'desc' },
        }),
      ])
    : [[], []];
  const boletoOf = new Map<string, string>();
  for (const b of boletos) if (!boletoOf.has(b.orderId)) boletoOf.set(b.orderId, b.id);
  const invoiceOf = new Map<string, string>();
  for (const i of invoices) if (!invoiceOf.has(i.orderId)) invoiceOf.set(i.orderId, i.id);

  for (const order of orders) {
    const invoiceId = invoiceOf.get(order.id);
    const boletoId = boletoOf.get(order.id);
    let printedDanfe = false;

    if (invoiceId) {
      try {
        await append(out, (await invoiceDanfe(session, invoiceId)).data);
        printedDanfe = true;
        summary.invoices += 1;
      } catch (error) {
        logger.warn('lote: DANFE falhou', { route: 'pedidos.lote', orderId: order.id, error });
        warnings.push(`Pedido #${order.numero}: não consegui baixar a nota; saiu o espelho no lugar.`);
      }
    }

    // Espelho: quando não há nota impressa (só boleto, nenhum documento ou nota que falhou).
    if (!printedDanfe) {
      await append(out, await renderOrderPdf(order));
      summary.mirrors += 1;
    }

    if (boletoId) {
      try {
        await append(out, (await boletoPdf(session, boletoId)).pdf);
        summary.boletos += 1;
      } catch (error) {
        logger.warn('lote: boleto falhou', { route: 'pedidos.lote', orderId: order.id, error });
        warnings.push(`Pedido #${order.numero}: não consegui baixar o boleto no banco.`);
      }
    }
  }

  return { pdf: await out.save(), warnings, summary };
}
