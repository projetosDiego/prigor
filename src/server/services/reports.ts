/**
 * Relatórios gerenciais (consultas agregadas, somente leitura).
 */
import type { Prisma } from '@prisma/client';

import { prisma } from '../db';
import { num } from './serializers';

export interface CustomerReportRow {
  customerId: string;
  customerName: string;
  phone: string | null;
  orders: number;
  total: number;
  average: number;
  lastOrderDate: string | null;
  daysSinceLastOrder: number;
  lastOrderTotal: number | null;
  previousOrderTotal: number | null;
  trendPercent: number | null;
  trend: 'growing' | 'stable' | 'dropping' | 'none';
  weeklyAlert: boolean;
}

/**
 * Consolida os pedidos por cliente (ignora cancelados) e analisa a tendência semanal.
 * `from`/`to` filtram pela data do pedido (opcionais).
 */
export async function customerReport(
  from: Date | null,
  to: Date | null,
): Promise<CustomerReportRow[]> {
  const where: Prisma.OrderWhereInput = { status: { not: 'cancelado' } };
  if (from || to) {
    where.orderDate = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
  }

  const groups = await prisma.order.groupBy({
    by: ['customerId'],
    where,
    _count: { _all: true },
    _sum: { total: true },
  });

  const ids = groups.map((g: { customerId: string }) => g.customerId);
  const customers = ids.length
    ? await prisma.customer.findMany({
        where: { id: { in: ids } },
        select: { id: true, tradeName: true, phone: true },
      })
    : [];
  const customerById = new Map<string, { tradeName: string; phone: string | null }>(
    customers.map((c) => [c.id, { tradeName: c.tradeName, phone: c.phone }]),
  );

  // Busca os últimos 2 pedidos de cada cliente no histórico geral para comparar pedidos consecutivos
  const recentOrders = ids.length
    ? await prisma.order.findMany({
        where: {
          customerId: { in: ids },
          status: { not: 'cancelado' },
        },
        select: {
          customerId: true,
          total: true,
          orderDate: true,
        },
        orderBy: { orderDate: 'desc' },
      })
    : [];

  const ordersByCustomer = new Map<string, Array<{ total: number; orderDate: Date }>>();
  for (const o of recentOrders) {
    const list = ordersByCustomer.get(o.customerId) ?? [];
    if (list.length < 2) {
      list.push({ total: num(o.total), orderDate: o.orderDate });
      ordersByCustomer.set(o.customerId, list);
    }
  }

  const now = new Date();
  const msPerDay = 1000 * 60 * 60 * 24;

  return groups
    .map((g: { customerId: string; _count: { _all: number }; _sum: { total: unknown } }) => {
      const total = num(g._sum.total);
      const orders = g._count._all;
      const cInfo = customerById.get(g.customerId);

      const customerHistory = ordersByCustomer.get(g.customerId) ?? [];
      const latest = customerHistory[0] ?? null;
      const previous = customerHistory[1] ?? null;

      let daysSinceLastOrder = 999;
      let lastOrderDate: string | null = null;
      let lastOrderTotal: number | null = null;
      let previousOrderTotal: number | null = null;
      let trendPercent: number | null = null;
      let trend: 'growing' | 'stable' | 'dropping' | 'none' = 'none';
      let weeklyAlert = false;

      if (latest) {
        lastOrderDate = latest.orderDate.toISOString().slice(0, 10);
        lastOrderTotal = latest.total;
        daysSinceLastOrder = Math.max(0, Math.floor((now.getTime() - latest.orderDate.getTime()) / msPerDay));

        // Se faz mais de 7 dias desde a última compra (comum em clientes semanais)
        if (daysSinceLastOrder > 7) {
          weeklyAlert = true;
        }
      }

      if (latest && previous && previous.total > 0) {
        previousOrderTotal = previous.total;
        trendPercent = Number((((latest.total - previous.total) / previous.total) * 100).toFixed(1));

        if (trendPercent < -15) {
          trend = 'dropping';
          weeklyAlert = true; // Alerta de queda relevante em relação ao pedido anterior
        } else if (trendPercent > 15) {
          trend = 'growing';
        } else {
          trend = 'stable';
        }
      }

      return {
        customerId: g.customerId,
        customerName: cInfo?.tradeName ?? '—',
        phone: cInfo?.phone ?? null,
        orders,
        total,
        average: orders > 0 ? total / orders : 0,
        lastOrderDate,
        daysSinceLastOrder,
        lastOrderTotal,
        previousOrderTotal,
        trendPercent,
        trend,
        weeklyAlert,
      };
    })
    .sort((a, b) => b.total - a.total);
}

export interface SellerReportOrderItem {
  id: string;
  numero: number;
  orderDate: string;
  total: number;
  commissionVal: number;
  status: string;
}

export interface SellerReportCustomerDetail {
  customerId: string;
  customerName: string;
  total: number;
  commissionVal: number;
  ordersCount: number;
  orders: SellerReportOrderItem[];
}

export interface SellerReportRow {
  sellerId: string;
  sellerName: string;
  orders: number;
  realized: number;
  commission: number;
  goal: number;
  projection: number;
  pctGoal: number;
  customers: SellerReportCustomerDetail[];
}

function currentMonthRange(): { from: Date; to: Date } {
  const now = new Date();
  return {
    from: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
    to: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)),
  };
}

/**
 * Vendas por vendedor no período, com meta (R$), comissão acumulada,
 * clientes compradores com pedidos e valores, projeção e % da meta.
 * Sem período informado, usa o mês corrente.
 */
export async function sellerReport(
  fromIn: Date | null,
  toIn: Date | null,
): Promise<{ period: { from: string; to: string }; rows: SellerReportRow[] }> {
  const def = currentMonthRange();
  const from = fromIn ?? def.from;
  const to = toIn ?? def.to;

  const sellers = await prisma.seller.findMany({
    where: { active: true },
    select: { id: true, name: true, goalRevenue: true },
  });

  const sellerIds = sellers.map((s) => s.id);

  const [groups, ordersList] = await Promise.all([
    prisma.order.groupBy({
      by: ['sellerId'],
      where: { status: { not: 'cancelado' }, sellerId: { in: sellerIds }, orderDate: { gte: from, lte: to } },
      _count: { _all: true },
      _sum: { total: true, commissionVal: true },
    }),
    prisma.order.findMany({
      where: {
        status: { not: 'cancelado' },
        sellerId: { in: sellerIds },
        orderDate: { gte: from, lte: to },
      },
      select: {
        id: true,
        numero: true,
        sellerId: true,
        customerId: true,
        orderDate: true,
        total: true,
        commissionVal: true,
        status: true,
        customer: { select: { tradeName: true } },
      },
      orderBy: { orderDate: 'desc' },
    }),
  ]);

  const bySeller = new Map<string | null, { _count: { _all: number }; _sum: { total: unknown; commissionVal: unknown } }>(
    groups.map((g) => [g.sellerId, g]),
  );

  // Agrupamento de clientes e pedidos por vendedor
  const customersBySeller = new Map<string, Map<string, SellerReportCustomerDetail>>();
  for (const o of ordersList) {
    if (!o.sellerId) continue;
    let custMap = customersBySeller.get(o.sellerId);
    if (!custMap) {
      custMap = new Map();
      customersBySeller.set(o.sellerId, custMap);
    }

    let cust = custMap.get(o.customerId);
    if (!cust) {
      cust = {
        customerId: o.customerId,
        customerName: o.customer?.tradeName ?? '—',
        total: 0,
        commissionVal: 0,
        ordersCount: 0,
        orders: [],
      };
      custMap.set(o.customerId, cust);
    }

    const orderTotal = num(o.total);
    const orderComm = num(o.commissionVal);
    cust.total += orderTotal;
    cust.commissionVal += orderComm;
    cust.ordersCount += 1;
    cust.orders.push({
      id: o.id,
      numero: o.numero,
      orderDate: o.orderDate.toISOString().slice(0, 10),
      total: orderTotal,
      commissionVal: orderComm,
      status: o.status,
    });
  }

  const msDay = 86_400_000;
  const startDay = Math.floor(from.getTime() / msDay);
  const endDay = Math.floor(to.getTime() / msDay);
  const todayDay = Math.floor(Date.now() / msDay);
  const totalDays = Math.max(1, endDay - startDay + 1);
  const elapsedDays = Math.min(totalDays, Math.max(1, todayDay - startDay + 1));

  const rows: SellerReportRow[] = sellers
    .map((sv) => {
      const g = bySeller.get(sv.id);
      const realized = num(g?._sum?.total);
      const commission = num(g?._sum?.commissionVal);
      const orders = g?._count?._all ?? 0;
      const goal = num(sv.goalRevenue);
      const projection = elapsedDays > 0 ? (realized / elapsedDays) * totalDays : realized;
      const pctGoal = goal > 0 ? (realized / goal) * 100 : 0;
      const customerMap = customersBySeller.get(sv.id);
      const customers = customerMap
        ? Array.from(customerMap.values()).sort((a, b) => b.total - a.total)
        : [];

      return {
        sellerId: sv.id,
        sellerName: sv.name,
        orders,
        realized,
        commission,
        goal,
        projection,
        pctGoal,
        customers,
      };
    })
    .sort((a, b) => b.realized - a.realized);

  return { period: { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) }, rows };
}

export interface DailySalesOrderItem {
  id: string;
  numero: number;
  orderDate: string;
  createdAt: string;
  status: string;
  paymentMethod: string;
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
  customer: {
    id: string;
    tradeName: string;
    document: string | null;
    phone: string | null;
    neighborhood: string | null;
    city: string | null;
  };
  seller: {
    id: string;
    name: string;
  } | null;
  items: Array<{
    id: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
  }>;
}

export interface DailySalesReport {
  date: string;
  formattedDate: string;
  summary: {
    totalRevenue: number;
    totalOrders: number;
    averageTicket: number;
    totalItems: number;
    totalCustomers: number;
    byPaymentMethod: Array<{ method: string; total: number; count: number }>;
    bySeller: Array<{ sellerId: string | null; sellerName: string; total: number; count: number }>;
    byStatus: Array<{ status: string; count: number; total: number }>;
    topProducts: Array<{ productName: string; quantity: number; total: number }>;
  };
  orders: DailySalesOrderItem[];
}

export async function dailySalesReport(
  dateStr?: string | null,
  includeCancelled = false,
): Promise<DailySalesReport> {
  // Define a data alvo (AAAA-MM-DD)
  const targetDate = dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)
    ? dateStr
    : new Date().toISOString().slice(0, 10);

  const startOfDay = new Date(`${targetDate}T00:00:00.000Z`);
  const endOfDay = new Date(`${targetDate}T23:59:59.999Z`);

  const where: Prisma.OrderWhereInput = {
    OR: [
      { orderDate: { gte: startOfDay, lte: endOfDay } },
      { createdAt: { gte: startOfDay, lte: endOfDay } },
    ],
    ...(includeCancelled ? {} : { status: { not: 'cancelado' } }),
  };

  const orders = await prisma.order.findMany({
    where,
    include: {
      customer: {
        select: {
          id: true,
          tradeName: true,
          cnpj: true,
          cpf: true,
          phone: true,
          neighborhood: true,
          city: true,
        },
      },
      seller: {
        select: {
          id: true,
          name: true,
        },
      },
      items: {
        include: {
          product: {
            select: { name: true },
          },
        },
      },
    },
    orderBy: [{ createdAt: 'desc' }, { numero: 'desc' }],
  });

  // Métricas agregadas
  let totalRevenue = 0;
  let totalOrders = 0;
  let totalItems = 0;
  const customerIds = new Set<string>();

  const paymentMap = new Map<string, { total: number; count: number }>();
  const sellerMap = new Map<string, { name: string; total: number; count: number }>();
  const statusMap = new Map<string, { count: number; total: number }>();
  const productMap = new Map<string, { quantity: number; total: number }>();

  const orderRows: DailySalesOrderItem[] = orders.map((o) => {
    const isCancelled = o.status === 'cancelado';
    const total = num(o.total);
    const subtotal = num(o.subtotal);
    const discount = num(o.discount);
    const shipping = num(o.shipping);

    if (!isCancelled) {
      totalRevenue += total;
      totalOrders += 1;
      customerIds.add(o.customerId);

      // Forma de pagamento
      const pm = o.paymentMethod || 'Não informado';
      const prevPm = paymentMap.get(pm) ?? { total: 0, count: 0 };
      paymentMap.set(pm, { total: prevPm.total + total, count: prevPm.count + 1 });

      // Vendedor
      const sellerKey = o.sellerId ?? 'sem_vendedor';
      const sellerName = o.seller?.name ?? 'Venda Direta / Sem Vendedor';
      const prevSeller = sellerMap.get(sellerKey) ?? { name: sellerName, total: 0, count: 0 };
      sellerMap.set(sellerKey, { name: sellerName, total: prevSeller.total + total, count: prevSeller.count + 1 });
    }

    // Status
    const st = o.status;
    const prevSt = statusMap.get(st) ?? { count: 0, total: 0 };
    statusMap.set(st, { count: prevSt.count + 1, total: prevSt.total + total });

    // Itens
    const mappedItems = o.items.map((it) => {
      const q = num(it.quantity);
      const up = num(it.unitPrice);
      const sub = num(it.subtotal);
      const pName = it.product?.name ?? 'Produto';

      if (!isCancelled) {
        totalItems += q;
        const prevProd = productMap.get(pName) ?? { quantity: 0, total: 0 };
        productMap.set(pName, { quantity: prevProd.quantity + q, total: prevProd.total + sub });
      }

      return {
        id: it.id,
        productName: pName,
        quantity: q,
        unitPrice: up,
        subtotal: sub,
      };
    });

    const doc = o.customer?.cnpj || o.customer?.cpf || null;

    return {
      id: o.id,
      numero: o.numero,
      orderDate: o.orderDate.toISOString().slice(0, 10),
      createdAt: o.createdAt.toISOString(),
      status: o.status,
      paymentMethod: o.paymentMethod || 'Pix',
      subtotal,
      discount,
      shipping,
      total,
      customer: {
        id: o.customer?.id ?? o.customerId,
        tradeName: o.customer?.tradeName ?? 'Cliente não identificado',
        document: doc,
        phone: o.customer?.phone ?? null,
        neighborhood: o.customer?.neighborhood ?? null,
        city: o.customer?.city ?? null,
      },
      seller: o.seller ? { id: o.seller.id, name: o.seller.name } : null,
      items: mappedItems,
    };
  });

  const byPaymentMethod = Array.from(paymentMap.entries())
    .map(([method, data]) => ({ method, ...data }))
    .sort((a, b) => b.total - a.total);

  const bySeller = Array.from(sellerMap.entries())
    .map(([sellerId, data]) => ({
      sellerId: sellerId === 'sem_vendedor' ? null : sellerId,
      sellerName: data.name,
      total: data.total,
      count: data.count,
    }))
    .sort((a, b) => b.total - a.total);

  const byStatus = Array.from(statusMap.entries())
    .map(([status, data]) => ({ status, ...data }))
    .sort((a, b) => b.count - a.count);

  const topProducts = Array.from(productMap.entries())
    .map(([productName, data]) => ({ productName, ...data }))
    .sort((a, b) => b.quantity - a.quantity);

  // Formata a data em português
  const [year, month, day] = targetDate.split('-').map(Number);
  const dateObj = new Date(year, month - 1, day);
  const formattedDate = dateObj.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return {
    date: targetDate,
    formattedDate: formattedDate.charAt(0).toUpperCase() + formattedDate.slice(1),
    summary: {
      totalRevenue,
      totalOrders,
      averageTicket: totalOrders > 0 ? totalRevenue / totalOrders : 0,
      totalItems,
      totalCustomers: customerIds.size,
      byPaymentMethod,
      bySeller,
      byStatus,
      topProducts,
    },
    orders: orderRows,
  };
}

export interface InactiveCustomerRow {
  customerId: string;
  tradeName: string;
  legalName: string | null;
  document: string | null;
  phone: string | null;
  city: string | null;
  neighborhood: string | null;
  sellerId: string | null;
  sellerName: string;
  lastOrderDate: string | null;
  daysInactive: number;
  lastOrderTotal: number;
  totalOrders: number;
  totalRevenueHistorical: number;
  suggestedWhatsAppMessage: string;
}

export interface InactiveCustomersReport {
  thresholdDays: number;
  totalInactive: number;
  totalHistoricalLost: number;
  customers: InactiveCustomerRow[];
}

export async function inactiveCustomersReport(
  thresholdDays = 15,
  sellerId?: string | null,
): Promise<InactiveCustomersReport> {
  const customerWhere: Prisma.CustomerWhereInput = {
    active: true,
    ...(sellerId ? { sellerId } : {}),
  };

  const customers = await prisma.customer.findMany({
    where: customerWhere,
    include: {
      seller: { select: { id: true, name: true } },
      orders: {
        where: { status: { not: 'cancelado' } },
        select: { id: true, total: true, orderDate: true },
        orderBy: { orderDate: 'desc' },
      },
    },
  });

  const now = new Date();
  const msPerDay = 1000 * 60 * 60 * 24;

  const inactiveList: InactiveCustomerRow[] = [];
  let totalHistoricalLost = 0;

  for (const c of customers) {
    const latestOrder = c.orders[0] ?? null;
    let daysInactive = 999;
    let lastDateStr: string | null = null;
    let lastOrderVal = 0;

    if (latestOrder) {
      daysInactive = Math.max(0, Math.floor((now.getTime() - latestOrder.orderDate.getTime()) / msPerDay));
      lastDateStr = latestOrder.orderDate.toISOString().slice(0, 10);
      lastOrderVal = num(latestOrder.total);
    } else {
      daysInactive = Math.max(0, Math.floor((now.getTime() - c.createdAt.getTime()) / msPerDay));
    }

    if (daysInactive >= thresholdDays) {
      const histTotal = c.orders.reduce((acc, o) => acc + num(o.total), 0);
      totalHistoricalLost += histTotal;

      const doc = c.cnpj || c.cpf || null;
      const msg = `Olá ${c.tradeName}! Tudo bem? Sentimos sua falta por aqui na Doces Prigor. 🍬 Como está o estoque aí na sua loja? Posso separar o seu pedido desta semana com condições especiais para reposição?`;

      inactiveList.push({
        customerId: c.id,
        tradeName: c.tradeName,
        legalName: c.legalName,
        document: doc,
        phone: c.phone || c.mobile || null,
        city: c.city,
        neighborhood: c.neighborhood,
        sellerId: c.sellerId,
        sellerName: c.seller?.name ?? 'Sem Vendedor',
        lastOrderDate: lastDateStr,
        daysInactive,
        lastOrderTotal: lastOrderVal,
        totalOrders: c.orders.length,
        totalRevenueHistorical: histTotal,
        suggestedWhatsAppMessage: msg,
      });
    }
  }

  inactiveList.sort((a, b) => b.totalRevenueHistorical - a.totalRevenueHistorical);

  return {
    thresholdDays,
    totalInactive: inactiveList.length,
    totalHistoricalLost,
    customers: inactiveList,
  };
}

export interface ProductAbcRow {
  productId: string;
  productName: string;
  category: string | null;
  unit: string;
  quantitySold: number;
  totalRevenue: number;
  sharePercent: number;
  cumulativeShare: number;
  classification: 'A' | 'B' | 'C';
}

export interface ProductAbcReport {
  period: { from: string | null; to: string | null };
  totalRevenue: number;
  totalItemsSold: number;
  summary: {
    classA: { count: number; total: number; share: number };
    classB: { count: number; total: number; share: number };
    classC: { count: number; total: number; share: number };
  };
  products: ProductAbcRow[];
}

export async function productAbcReport(
  from?: Date | null,
  to?: Date | null,
): Promise<ProductAbcReport> {
  const whereOrder: Prisma.OrderWhereInput = { status: { not: 'cancelado' } };
  if (from || to) {
    whereOrder.orderDate = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
  }

  const items = await prisma.orderItem.groupBy({
    by: ['productId'],
    where: { order: whereOrder },
    _sum: { quantity: true, subtotal: true },
    orderBy: { _sum: { subtotal: 'desc' } },
  });

  const productIds = items.map((i) => i.productId);
  const products = productIds.length
    ? await prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, name: true, category: true, unit: true },
      })
    : [];

  const productMap = new Map<string, { name: string; category: string | null; unit: string }>(
    products.map((p) => [p.id, { name: p.name, category: p.category, unit: p.unit }]),
  );

  const totalRevenue = items.reduce((acc, it) => acc + num(it._sum.subtotal), 0);
  const totalItemsSold = items.reduce((acc, it) => acc + num(it._sum.quantity), 0);

  let cumulativeTotal = 0;
  let classACount = 0;
  let classATotal = 0;
  let classBCount = 0;
  let classBTotal = 0;
  let classCCount = 0;
  let classCTotal = 0;

  const rows: ProductAbcRow[] = items.map((it) => {
    const rev = num(it._sum.subtotal);
    const qty = num(it._sum.quantity);
    cumulativeTotal += rev;

    const sharePercent = totalRevenue > 0 ? (rev / totalRevenue) * 100 : 0;
    const cumulativeShare = totalRevenue > 0 ? (cumulativeTotal / totalRevenue) * 100 : 0;

    let classification: 'A' | 'B' | 'C' = 'C';
    if (cumulativeShare <= 80 || cumulativeShare - sharePercent < 80) {
      classification = 'A';
      classACount++;
      classATotal += rev;
    } else if (cumulativeShare <= 95 || cumulativeShare - sharePercent < 95) {
      classification = 'B';
      classBCount++;
      classBTotal += rev;
    } else {
      classification = 'C';
      classCCount++;
      classCTotal += rev;
    }

    const pInfo = productMap.get(it.productId);

    return {
      productId: it.productId,
      productName: pInfo?.name ?? 'Produto',
      category: pInfo?.category ?? null,
      unit: pInfo?.unit ?? 'un',
      quantitySold: qty,
      totalRevenue: rev,
      sharePercent: Number(sharePercent.toFixed(2)),
      cumulativeShare: Number(cumulativeShare.toFixed(2)),
      classification,
    };
  });

  return {
    period: {
      from: from ? from.toISOString().slice(0, 10) : null,
      to: to ? to.toISOString().slice(0, 10) : null,
    },
    totalRevenue,
    totalItemsSold,
    summary: {
      classA: { count: classACount, total: classATotal, share: totalRevenue > 0 ? (classATotal / totalRevenue) * 100 : 0 },
      classB: { count: classBCount, total: classBTotal, share: totalRevenue > 0 ? (classBTotal / totalRevenue) * 100 : 0 },
      classC: { count: classCCount, total: classCTotal, share: totalRevenue > 0 ? (classCTotal / totalRevenue) * 100 : 0 },
    },
    products: rows,
  };
}
