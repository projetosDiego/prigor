import { z } from 'zod';

import { prisma } from '@/server/db';
import { badRequest } from '@/server/http/errors';
import { ok, route, readJson } from '@/server/http/respond';
import { getSellerByCode } from '@/server/services/sellers';
import { calculateOrder } from '@/server/domain/orders';
import { num } from '@/server/services/serializers';
import { sendNewOrderNotification } from '@/server/services/email';

const optionalNullableString = z
  .union([z.string().trim(), z.null()])
  .optional()
  .transform((v) => (v && v.trim().length > 0 ? v.trim() : undefined));

const publicOrderItemSchema = z.object({
  productId: z.string().uuid('ID do produto inválido'),
  quantity: z.number().positive('Quantidade deve ser maior que zero'),
  unitPrice: z.union([z.number().positive('Preço unitário deve ser positivo'), z.null()]).optional().transform((v) => (v !== null ? v : undefined)),
});

const publicCustomerSchema = z.object({
  id: z.union([z.string().uuid(), z.null()]).optional().transform((v) => (v ? v : undefined)),
  tradeName: z.string().trim().min(2, 'Nome / Razão Social é obrigatório'),
  legalName: optionalNullableString,
  cnpj: optionalNullableString,
  cpf: optionalNullableString,
  phone: z.string().trim().min(8, 'Telefone / WhatsApp de contato é obrigatório'),
  address: z.string().trim().min(2, 'Endereço é obrigatório'),
  number: optionalNullableString,
  complement: optionalNullableString,
  neighborhood: z.string().trim().min(2, 'Bairro é obrigatório'),
  city: z.string().trim().default('Rio de Janeiro'),
  state: z.string().trim().default('RJ'),
  zipCode: optionalNullableString,
});

const publicDeliveryAddressSchema = z.object({
  address: z.string().trim().min(2, 'Endereço de entrega é obrigatório'),
  number: optionalNullableString,
  complement: optionalNullableString,
  neighborhood: z.string().trim().min(2, 'Bairro de entrega é obrigatório'),
  city: z.string().trim().default('Rio de Janeiro'),
  state: z.string().trim().default('RJ'),
  zipCode: optionalNullableString,
});

const publicOrderSubmitSchema = z.object({
  customer: publicCustomerSchema,
  deliveryAddress: publicDeliveryAddressSchema.optional(),
  sellerCode: optionalNullableString,
  deliveryDate: optionalNullableString,
  paymentMethod: z.string().trim().default('Pix'),
  notes: optionalNullableString,
  items: z.array(publicOrderItemSchema).min(1, 'Selecione ao menos um produto para o pedido.'),
});

export const POST = route('public.orders.create', async (request) => {
  const body = await readJson(request);
  const parsed = publicOrderSubmitSchema.safeParse(body);

  if (!parsed.success) {
    throw badRequest(parsed.error.issues[0]?.message ?? 'Dados do pedido inválidos.');
  }

  const { customer: custData, deliveryAddress: deliveryAddrData, sellerCode, deliveryDate, paymentMethod, notes, items } = parsed.data;

  // 1. Resolver vendedor
  let sellerId: string | null = null;
  if (sellerCode) {
    const s = await getSellerByCode(sellerCode);
    if (s) sellerId = s.id;
  }

  // 2. Resolver ou criar cliente
  let customerId = custData.id;
  const cleanDigits = (custData.cnpj || custData.cpf || '').replace(/\D/g, '');
  const isCnpj = cleanDigits.length === 14;
  const isCpf = cleanDigits.length === 11;

  if (customerId) {
    const existing = await prisma.customer.findUnique({ where: { id: customerId } });
    if (existing) {
      if (!sellerId && existing.sellerId) sellerId = existing.sellerId;
      const shouldUpdateAddress = !deliveryAddrData;
      // Atualiza telefone e endereço garantindo dados mais recentes
      await prisma.customer.update({
        where: { id: customerId },
        data: {
          phone: custData.phone,
          ...(shouldUpdateAddress
            ? {
                address: custData.address || existing.address,
                number: custData.number || existing.number,
                complement: custData.complement || existing.complement,
                neighborhood: custData.neighborhood || existing.neighborhood,
                city: custData.city || existing.city,
                state: custData.state || existing.state,
                zipCode: custData.zipCode?.replace(/\D/g, '') || existing.zipCode,
              }
            : {}),
          ...(sellerId && !existing.sellerId ? { sellerId } : {}),
        },
      });
    } else {
      customerId = undefined;
    }
  }

  if (!customerId) {
    // Procura por CNPJ ou CPF para reaproveitar cadastro
    let existing = null;
    if (isCnpj) {
      existing = await prisma.customer.findFirst({ where: { cnpj: cleanDigits } });
    } else if (isCpf) {
      existing = await prisma.customer.findFirst({ where: { cpf: cleanDigits } });
    }

    if (existing) {
      customerId = existing.id;
      if (!sellerId && existing.sellerId) sellerId = existing.sellerId;
      const shouldUpdateAddress = !deliveryAddrData;
      await prisma.customer.update({
        where: { id: customerId },
        data: {
          phone: custData.phone,
          ...(shouldUpdateAddress
            ? {
                address: custData.address || existing.address,
                number: custData.number || existing.number,
                complement: custData.complement || existing.complement,
                neighborhood: custData.neighborhood || existing.neighborhood,
                city: custData.city || existing.city,
                state: custData.state || existing.state,
                zipCode: custData.zipCode?.replace(/\D/g, '') || existing.zipCode,
              }
            : {}),
          ...(sellerId && !existing.sellerId ? { sellerId } : {}),
        },
      });
    } else {
      const createdCustomer = await prisma.customer.create({
        data: {
          tradeName: custData.tradeName,
          legalName: custData.legalName || custData.tradeName,
          cnpj: isCnpj ? cleanDigits : null,
          cpf: isCpf ? cleanDigits : null,
          phone: custData.phone,
          address: custData.address,
          number: custData.number || '',
          complement: custData.complement || '',
          neighborhood: custData.neighborhood,
          city: custData.city,
          state: custData.state,
          zipCode: custData.zipCode?.replace(/\D/g, '') || '',
          sellerId,
        },
      });
      customerId = createdCustomer.id;
    }
  }

  // 2b. Boleto: qualquer cliente pode pedir; sem liberação, a gerência aprova ao faturar
  //     (o pedido aparece como "boleto a aprovar" na lista da gerência).

  // 3. Buscar produtos no banco e validar preços
  const productIds = items.map((i) => i.productId);
  const dbProducts = await prisma.product.findMany({
    where: { id: { in: productIds }, active: true },
    select: { id: true, name: true, salePrice: true, commissionPct: true },
  });

  const productMap = new Map(dbProducts.map((p) => [p.id, p]));

  let hasNegotiatedPrice = false;
  const calculatedItems = items.map((item) => {
    const prod = productMap.get(item.productId);
    if (!prod) throw badRequest(`Produto não encontrado ou inativo.`);

    const standardPrice = Number(prod.salePrice);
    const unitPrice = item.unitPrice !== undefined ? Number(item.unitPrice) : standardPrice;

    // Se o preço informado for diferente do padrão da tabela, ativa a trava
    if (Math.abs(unitPrice - standardPrice) > 0.009) {
      hasNegotiatedPrice = true;
    }

    return {
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: unitPrice.toFixed(2),
      discountItem: '0.00',
      productCommissionPct: prod.commissionPct ? String(prod.commissionPct) : null,
    };
  });

  const calculated = calculateOrder(calculatedItems, {
    discount: '0.00',
    shipping: '0.00',
    otherCosts: '0.00',
    sellerCommissionPct: null,
  });

  // Se tem preço negociado, exige aprovação da gerência e trava a impressão
  const approvedByAdmin = !hasNegotiatedPrice;

  const todayIso = new Date().toISOString().split('T')[0];
  const finalDeliveryDate = deliveryDate || todayIso;

  // 4. Salvar pedido no banco
  let deliveryAddressId: string | null = null;
  if (deliveryAddrData && deliveryAddrData.address) {
    const da = await prisma.customerAddress.create({
      data: {
        customerId: customerId!,
        label: 'Entrega Pedido',
        address: deliveryAddrData.address,
        number: deliveryAddrData.number || '',
        complement: deliveryAddrData.complement || '',
        neighborhood: deliveryAddrData.neighborhood,
        city: deliveryAddrData.city || 'Rio de Janeiro',
        state: deliveryAddrData.state || 'RJ',
        zipCode: deliveryAddrData.zipCode?.replace(/\D/g, '') || '',
      },
    });
    deliveryAddressId = da.id;
  }

  const order = await prisma.order.create({
    data: {
      customerId: customerId!,
      sellerId,
      deliveryAddressId,
      status: 'novo',
      paymentMethod,
      orderDate: new Date(),
      deliveryDate: new Date(`${finalDeliveryDate}T12:00:00Z`),
      subtotal: calculated.subtotal.toFixed(2),
      total: calculated.total.toFixed(2),
      discount: '0.00',
      shipping: '0.00',
      otherCosts: '0.00',
      hasNegotiatedPrice,
      approvedByAdmin,
      notes: [
        notes,
        hasNegotiatedPrice ? '[Autoatendimento] Pedido contém valores negociados pelo cliente.' : '',
      ]
        .filter(Boolean)
        .join(' | '),
      items: {
        create: calculated.items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity.toFixed(3),
          unitPrice: item.unitPrice.toFixed(2),
          discountItem: item.discountItem.toFixed(2),
          subtotal: item.subtotal.toFixed(2),
        })),
      },
    },
    select: {
      id: true,
      numero: true,
      total: true,
      status: true,
      hasNegotiatedPrice: true,
      approvedByAdmin: true,
      seller: { select: { name: true } },
      customer: { select: { tradeName: true } },
    },
  });

  // Dispara notificação por e-mail (Hostinger SMTP) para a administração
  void sendNewOrderNotification(order.id).catch((err) => {
    console.error('[PUBLIC_ORDER] Erro ao disparar e-mail de notificação:', err);
  });

  return ok({
    success: true,
    orderId: order.id,
    orderNumber: order.numero,
    total: num(order.total),
    hasNegotiatedPrice: order.hasNegotiatedPrice,
    approvedByAdmin: order.approvedByAdmin,
    canPrintNow: true,
  });
});
