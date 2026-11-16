/**
 * Grava no ERP o pedido feito no site oficial.
 *
 * - Idempotente: o código do site (NAT-0007) é a chave em `eventos_integracao`;
 *   reenviar devolve o mesmo pedido em vez de duplicar.
 * - Cliente reaproveitado por CPF/CNPJ; endereço de entrega vira um endereço
 *   do cliente, sem sobrescrever o cadastro principal.
 * - Produto localizado pelo SKU. Se ainda não existir no ERP, é criado
 *   (categoria da campanha, sem controle de estoque) para o pedido não se perder.
 * - O pedido entra como "novo", sem vendedor e sem comissão. A confirmação do
 *   pagamento continua sendo feita pela gerência.
 */
import { Prisma } from '@prisma/client';

import { prisma, UNIQUE_VIOLATION } from '../db';
import { priceSiteOrder, siteOrderNotes, sitePaymentMethod } from '../domain/site-order';
import { validationError } from '../http/errors';
import type { SiteOrderPayload } from '../validation/site-order';
import type { Tx } from '../tx';
import { sendNewOrderNotification } from './email';

const PROVIDER = 'site';

export type SiteOrderResult = { orderId: string; orderNumber: number; duplicate: boolean };

async function findProcessed(code: string): Promise<SiteOrderResult | null> {
  const event = await prisma.integrationEvent.findUnique({
    where: { provider_externalId: { provider: PROVIDER, externalId: code } },
    select: { payload: true },
  });
  const p = event?.payload as { orderId?: string; orderNumber?: number } | undefined;
  return p?.orderId && p.orderNumber ? { orderId: p.orderId, orderNumber: p.orderNumber, duplicate: true } : null;
}

async function upsertCustomer(tx: Tx, c: SiteOrderPayload['customer'], address: SiteOrderPayload['fulfillment']['address']): Promise<string> {
  const isPJ = c.type === 'PJ';
  const existing = isPJ
    ? await tx.customer.findUnique({ where: { cnpj: c.document }, select: { id: true } })
    : await tx.customer.findFirst({ where: { cpf: c.document }, select: { id: true } });

  if (existing) {
    await tx.customer.update({ where: { id: existing.id }, data: { mobile: c.phone, ...(c.email ? { email: c.email } : {}) } });
    return existing.id;
  }

  const created = await tx.customer.create({
    data: {
      tradeName: isPJ ? c.companyName || c.name : c.name,
      legalName: isPJ ? c.companyName || c.name : c.name,
      cnpj: isPJ ? c.document : null,
      cpf: isPJ ? null : c.document,
      phone: c.phone,
      mobile: c.phone,
      email: c.email || null,
      address: address?.street ?? null,
      number: address?.number ?? null,
      complement: address?.complement || null,
      neighborhood: address?.neighborhood ?? null,
      city: address?.city ?? null,
      state: address?.state ?? null,
      zipCode: address?.zipCode ?? null,
      category: 'Cliente do site',
      notes: isPJ ? `Responsável: ${c.name}. Cadastrado pelo site.` : 'Cadastrado pelo site.',
    },
    select: { id: true },
  });
  return created.id;
}

async function resolveProducts(tx: Tx, items: SiteOrderPayload['items'], campaign: string): Promise<Map<string, string>> {
  const skus = [...new Set(items.map((i) => i.sku))];
  const found = await tx.product.findMany({ where: { sku: { in: skus } }, select: { id: true, sku: true } });
  const ids = new Map(found.map((p) => [p.sku!, p.id]));
  for (const item of items) {
    if (ids.has(item.sku)) continue;
    const created = await tx.product.create({
      data: {
        sku: item.sku,
        name: item.name,
        category: campaign.replace(/^natal(\d{4})$/, 'Natal $1'),
        salePrice: item.unitPrice,
        type: 'venda',
        trackStock: false,
        description: 'Criado automaticamente por um pedido do site.',
      },
      select: { id: true },
    });
    ids.set(item.sku, created.id);
  }
  return ids;
}

export async function receiveSiteOrder(payload: SiteOrderPayload): Promise<SiteOrderResult> {
  const already = await findProcessed(payload.code);
  if (already) return already;

  const priced = priceSiteOrder(payload.items, payload.totals.total);
  if (!priced.ok) throw validationError(priced.reason);

  try {
    const result = await prisma.$transaction(async (tx: Tx) => {
      const customerId = await upsertCustomer(tx, payload.customer, payload.fulfillment.address);
      const productIds = await resolveProducts(tx, payload.items, payload.campaign);

      let deliveryAddressId: string | null = null;
      const a = payload.fulfillment.address;
      if (payload.fulfillment.type === 'ENTREGA' && a) {
        const addr = await tx.customerAddress.create({
          data: {
            customerId,
            label: `Entrega site ${payload.code}`,
            address: a.street,
            number: a.number,
            complement: a.complement,
            neighborhood: a.neighborhood,
            city: a.city,
            state: a.state,
            zipCode: a.zipCode,
          },
          select: { id: true },
        });
        deliveryAddressId = addr.id;
      }

      const order = await tx.order.create({
        data: {
          customerId,
          deliveryAddressId,
          sellerId: null,
          status: 'novo',
          paymentMethod: sitePaymentMethod(payload.payment.method),
          orderDate: new Date(),
          deliveryDate: new Date(`${payload.deliveryDate}T12:00:00Z`),
          discount: '0.00',
          shipping: '0.00',
          otherCosts: '0.00',
          subtotal: priced.subtotal.toFixed(2),
          total: priced.total.toFixed(2),
          commissionVal: '0.00',
          notes: siteOrderNotes({
            code: payload.code,
            campaign: payload.campaign,
            fulfillment: payload.fulfillment,
            payment: payload.payment,
            lines: payload.items,
            customerNotes: payload.notes,
          }),
          items: {
            create: priced.lines.map((l) => ({
              productId: productIds.get(l.sku)!,
              quantity: String(l.quantity),
              unitPrice: l.unitPrice,
              discountItem: l.discountItem.toFixed(2),
              subtotal: l.subtotal.toFixed(2),
            })),
          },
        },
        select: { id: true, numero: true },
      });

      await tx.integrationEvent.create({
        data: {
          provider: PROVIDER,
          externalId: payload.code,
          type: 'order.created',
          payload: { ...payload, orderId: order.id, orderNumber: order.numero } as unknown as Prisma.InputJsonValue,
          processedAt: new Date(),
        },
      });

      return { orderId: order.id, orderNumber: order.numero, duplicate: false };
    });

    void sendNewOrderNotification(result.orderId).catch(() => undefined);
    return result;
  } catch (error) {
    // Dois envios simultâneos do mesmo pedido: o segundo perde a corrida e devolve o primeiro.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_VIOLATION) {
      const winner = await findProcessed(payload.code);
      if (winner) return winner;
    }
    throw error;
  }
}
