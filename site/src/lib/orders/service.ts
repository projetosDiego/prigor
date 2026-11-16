import 'server-only';
import { Prisma, type ShopOrder } from '@prisma/client';

import { db } from '../db';
import { getNatalSettings, natalCatalog } from '../natal/config';
import { isAllowedDate, todayInSaoPaulo } from '../natal/dates';
import { amountDue, priceCart } from '../natal/pricing';
import { onlyDigits } from '../text';
import { checkoutSchema } from './schema';
import type { StoredLine } from './types';

export type CreateOrderResult =
  | { ok: true; order: ShopOrder }
  | { ok: false; error: string; field?: string };

/**
 * Cria o pedido do site. O preço é SEMPRE recalculado aqui a partir do
 * catálogo do servidor — o carrinho do navegador só diz o que e quanto.
 */
export async function createShopOrder(raw: unknown): Promise<CreateOrderResult> {
  const parsed = checkoutSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue?.message ?? 'Dados inválidos.', field: issue?.path.join('.') };
  }
  const input = parsed.data;

  const settings = await getNatalSettings();
  if (!settings.active || !settings.acceptingOrders) {
    return { ok: false, error: 'As encomendas pelo site estão encerradas. Fale com a gente pelo WhatsApp.' };
  }

  const priced = priceCart(input.items, natalCatalog(settings), settings.rules);
  if (priced.errors.length) return { ok: false, error: priced.errors[0]! };
  if (!priced.lines.length) return { ok: false, error: 'Seu carrinho está vazio.' };
  if (priced.hasCorporate && input.customer.type !== 'PJ') {
    return { ok: false, error: 'Os preços para empresas exigem CNPJ.', field: 'customer.document' };
  }

  if (!isAllowedDate(input.deliveryDate, todayInSaoPaulo(), settings.dates)) {
    return { ok: false, error: 'Essa data não está mais disponível. Escolha outra.', field: 'deliveryDate' };
  }
  if (input.fulfillment === 'RETIRADA' && !settings.pickupPoints.includes(input.pickupPoint)) {
    return { ok: false, error: 'Escolha um ponto de retirada da lista.', field: 'pickupPoint' };
  }

  const lines: StoredLine[] = priced.lines.map(({ sku, name, option, channel, quantity, unitCents, grossCents, discountPct, discountCents, totalCents }) => ({
    sku, name, option, channel, quantity, unitCents, grossCents, discountPct, discountCents, totalCents,
  }));
  const isDelivery = input.fulfillment === 'ENTREGA';
  const a = input.address;

  const base = {
    campaign: `natal${settings.year}`,
    customerType: input.customer.type,
    document: onlyDigits(input.customer.document),
    name: input.customer.name,
    companyName: input.customer.type === 'PJ' ? input.customer.companyName : '',
    phone: onlyDigits(input.customer.phone),
    email: input.customer.email,
    fulfillment: input.fulfillment,
    pickupPoint: isDelivery ? '' : input.pickupPoint,
    zipCode: isDelivery ? onlyDigits(a.zipCode) : '',
    street: isDelivery ? a.street : '',
    number: isDelivery ? a.number : '',
    complement: isDelivery ? a.complement : '',
    neighborhood: isDelivery ? a.neighborhood : '',
    city: isDelivery ? a.city : '',
    state: isDelivery ? a.state.toUpperCase() : '',
    deliveryDate: input.deliveryDate,
    items: JSON.stringify(lines),
    subtotalCents: priced.subtotalCents,
    discountCents: priced.discountCents,
    totalCents: priced.totalCents,
    paymentPlan: input.paymentPlan,
    paymentMethod: input.paymentMethod,
    amountDueCents: amountDue(priced.totalCents, input.paymentPlan, settings.depositPct),
    notes: input.notes,
    utmSource: input.utmSource,
  };

  // Código sequencial por campanha (NAT-0001…). Em caso de corrida, tenta o próximo.
  for (let attempt = 0; attempt < 5; attempt++) {
    const count = await db.shopOrder.count({ where: { campaign: base.campaign } });
    const code = `NAT-${String(count + 1 + attempt).padStart(4, '0')}`;
    try {
      const order = await db.shopOrder.create({ data: { ...base, code } });
      return { ok: true, order };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') continue;
      throw e;
    }
  }
  return { ok: false, error: 'Não foi possível registrar o pedido agora. Tente de novo em instantes.' };
}
