/**
 * Indicadores do painel.
 *
 * Cada métrica declara a janela de tempo que usa. No sistema anterior,
 * "faturamento do mês" somava pedidos ainda não faturados e a janela era
 * aberta à direita, então pedido com data futura entrava na conta.
 */
import type { Prisma } from '@prisma/client';

import { prisma } from '../db';
import { num } from './serializers';
import { CATEGORY_COMMISSION } from './financial-sync';
import { isManagement, sellerScope, type SessionPayload } from '../auth/guard';

export interface DashboardStats {
  period: { from: string; to: string };
  customers: { active: number; inactiveCount?: number };
  products: { forSale: number; supplies: number; lowStock: number };
  orders: {
    inMonth: number;
    open: number;
    openValue: number;
    monthGrossValue: number;
    monthBilledValue: number;
    pendingDeliveries: number;
  };
  yesterday: {
    date: string;
    revenue: number;
    orders: number;
    averageTicket: number;
  };
  today: {
    date: string;
    revenue: number;
    orders: number;
    averageTicket: number;
  };
  monthProjection: {
    goal: number;
    realized: number;
    projection: number;
    percentGoal: number;
    daysElapsed: number;
    totalDays: number;
    prevMonthRevenue: number;
    growthPercent: number;
  };
  alerts: {
    deliveriesToday: number;
    overdueReceivableTotal: number;
    overdueReceivableCount: number;
    inactiveCustomersCount: number;
  };
  sellersRanking: Array<{
    id: string;
    name: string;
    realized: number;
    goal: number;
    percentGoal: number;
    ordersCount: number;
    commission: number;
  }>;
  financial: {
    receivable: number;
    payable: number;
    overdueReceivable: number;
    pendingCommissions: number;
  };
  topProducts: Array<{ productId: string; name: string; quantity: number; total: number }>;
  latestOrders: Array<{
    id: string;
    numero: number;
    customerName: string;
    orderDate: string | null;
    total: number;
    status: string;
  }>;
}

function monthWindow(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  // Fecha a janela no último dia do mês: pedido lançado para o mês que vem
  // não infla o resultado do mês corrente.
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return { start, end };
}

function today(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export async function getDashboard(session: SessionPayload): Promise<DashboardStats> {
  const { start, end } = monthWindow();
  const scope = sellerScope(session);
  const orderScope = scope.sellerId ? { sellerId: scope.sellerId } : {};
  const customerScope = scope.sellerId ? { sellerId: scope.sellerId } : {};

  // `as const` preserva os literais: sem isso o TypeScript alarga para
  // `string` e o Prisma recusa, porque a coluna é enum.
  const notCancelled = { status: { not: 'cancelado' } } as const;
  const monthFilter = {
    ...orderScope,
    ...notCancelled,
    orderDate: { gte: start, lte: end },
  } satisfies Prisma.OrderWhereInput;
  const openFilter = {
    ...orderScope,
    status: { in: ['novo', 'confirmado', 'em_producao'] },
  } satisfies Prisma.OrderWhereInput;
  const billedFilter = {
    ...orderScope,
    status: { in: ['entregue', 'faturado'] },
    orderDate: { gte: start, lte: end },
  } satisfies Prisma.OrderWhereInput;

  // Gestão vê o financeiro consolidado; vendedor não vê contas da empresa.
  const showsFinancial = isManagement(session);

  const [
    activeCustomers,
    productsForSale,
    supplies,
    lowStock,
    monthOrders,
    monthGross,
    openOrders,
    openValue,
    billedValue,
    receivable,
    payable,
    overdueReceivable,
    pendingCommissions,
    topProductRows,
    latestOrders,
  ] = await Promise.all([
    prisma.customer.count({ where: { active: true, ...customerScope } }),
    prisma.product.count({ where: { active: true, type: 'venda' } }),
    prisma.product.count({ where: { active: true, type: 'insumo' } }),
    prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count FROM produtos
      WHERE ativo = true AND estoque_minimo > 0 AND estoque <= estoque_minimo
    `,
    prisma.order.count({ where: monthFilter }),
    prisma.order.aggregate({ where: monthFilter, _sum: { total: true } }),
    prisma.order.count({ where: openFilter }),
    prisma.order.aggregate({ where: openFilter, _sum: { total: true } }),
    prisma.order.aggregate({ where: billedFilter, _sum: { total: true } }),
    showsFinancial
      ? prisma.financialTransaction.aggregate({
          where: {
            type: 'receita',
            status: { in: ['pendente', 'atrasado'] },
          } satisfies Prisma.FinancialTransactionWhereInput,
          _sum: { value: true },
        })
      : null,
    showsFinancial
      ? prisma.financialTransaction.aggregate({
          where: {
            type: 'despesa',
            status: { in: ['pendente', 'atrasado'] },
          } satisfies Prisma.FinancialTransactionWhereInput,
          _sum: { value: true },
        })
      : null,
    showsFinancial
      ? prisma.financialTransaction.aggregate({
          where: {
            type: 'receita',
            status: { in: ['pendente', 'atrasado'] },
            dueDate: { lt: today() },
          } satisfies Prisma.FinancialTransactionWhereInput,
          _sum: { value: true },
        })
      : null,
    prisma.financialTransaction.aggregate({
      where: {
        type: 'despesa',
        category: CATEGORY_COMMISSION,
        status: { in: ['pendente', 'atrasado'] },
        ...(scope.sellerId ? { order: { sellerId: scope.sellerId } } : {}),
      } satisfies Prisma.FinancialTransactionWhereInput,
      _sum: { value: true },
    }),
    prisma.orderItem.groupBy({
      by: ['productId'],
      where: { order: monthFilter },
      _sum: { quantity: true, subtotal: true },
      orderBy: { _sum: { subtotal: 'desc' } },
      take: 5,
    }),
    prisma.order.findMany({
      where: { ...orderScope, ...notCancelled },
      include: { customer: { select: { tradeName: true } } },
      orderBy: { numero: 'desc' },
      take: 5,
    }),
  ]);

  // Cálculos de Ontem e Hoje
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const todayStart = new Date(`${todayStr}T00:00:00.000Z`);
  const todayEnd = new Date(`${todayStr}T23:59:59.999Z`);

  const yesterdayObj = new Date(now);
  yesterdayObj.setDate(yesterdayObj.getDate() - 1);
  const yesterdayStr = yesterdayObj.toISOString().slice(0, 10);
  const yesterdayStart = new Date(`${yesterdayStr}T00:00:00.000Z`);
  const yesterdayEnd = new Date(`${yesterdayStr}T23:59:59.999Z`);

  // Período equivalente no mês passado para comparação
  const prevMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const prevMonthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, now.getUTCDate()));

  const [
    yesterdayAgg,
    yesterdayCount,
    todayAgg,
    todayCount,
    prevMonthAgg,
    sellers,
    allSellersOrders,
    deliveriesTodayCount,
    overdueCount,
    allCustomersOrders,
  ] = await Promise.all([
    prisma.order.aggregate({
      where: {
        ...orderScope,
        ...notCancelled,
        orderDate: { gte: yesterdayStart, lte: yesterdayEnd },
      },
      _sum: { total: true },
    }),
    prisma.order.count({
      where: {
        ...orderScope,
        ...notCancelled,
        orderDate: { gte: yesterdayStart, lte: yesterdayEnd },
      },
    }),
    prisma.order.aggregate({
      where: {
        ...orderScope,
        ...notCancelled,
        orderDate: { gte: todayStart, lte: todayEnd },
      },
      _sum: { total: true },
    }),
    prisma.order.count({
      where: {
        ...orderScope,
        ...notCancelled,
        orderDate: { gte: todayStart, lte: todayEnd },
      },
    }),
    prisma.order.aggregate({
      where: {
        ...orderScope,
        ...notCancelled,
        orderDate: { gte: prevMonthStart, lte: prevMonthEnd },
      },
      _sum: { total: true },
    }),
    prisma.seller.findMany({
      where: { active: true },
      select: { id: true, name: true, goalRevenue: true },
    }),
    prisma.order.findMany({
      where: monthFilter,
      select: { sellerId: true, total: true, commissionVal: true },
    }),
    prisma.order.count({
      where: {
        ...orderScope,
        status: { in: ['confirmado', 'em_producao'] },
        OR: [
          { deliveryDate: { gte: todayStart, lte: todayEnd } },
          { orderDate: { gte: todayStart, lte: todayEnd } },
        ],
      },
    }),
    showsFinancial
      ? prisma.financialTransaction.count({
          where: {
            type: 'receita',
            status: { in: ['pendente', 'atrasado'] },
            dueDate: { lt: today() },
          },
        })
      : 0,
    prisma.order.findMany({
      where: {
        ...customerScope,
        ...notCancelled,
      },
      select: { customerId: true, orderDate: true },
      orderBy: { orderDate: 'desc' },
    }),
  ]);

  // Projeção do mês
  const monthRevenue = num(monthGross._sum?.total);
  const totalDaysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dayOfMonth = now.getDate();
  const daysElapsed = Math.max(1, dayOfMonth);
  const projection = (monthRevenue / daysElapsed) * totalDaysInMonth;

  const totalSellersGoal = sellers.reduce((acc, s) => acc + num(s.goalRevenue), 0);
  const companyGoal = totalSellersGoal > 0 ? totalSellersGoal : 50000;
  const percentGoal = companyGoal > 0 ? (monthRevenue / companyGoal) * 100 : 0;

  const prevMonthRevenue = num(prevMonthAgg._sum?.total);
  const growthPercent = prevMonthRevenue > 0
    ? ((monthRevenue - prevMonthRevenue) / prevMonthRevenue) * 100
    : 0;

  // Clientes sem compras há mais de 15 dias
  const fifteenDaysAgo = new Date();
  fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);
  const latestOrderDateByCustomer = new Map<string, Date>();
  for (const o of allCustomersOrders) {
    if (!latestOrderDateByCustomer.has(o.customerId)) {
      latestOrderDateByCustomer.set(o.customerId, o.orderDate);
    }
  }

  const activeCustomerList = await prisma.customer.findMany({
    where: { active: true, ...customerScope },
    select: { id: true, createdAt: true },
  });

  let inactiveCustomersCount = 0;
  for (const c of activeCustomerList) {
    const lastDate = latestOrderDateByCustomer.get(c.id);
    if (!lastDate) {
      if (c.createdAt < fifteenDaysAgo) inactiveCustomersCount++;
    } else if (lastDate < fifteenDaysAgo) {
      inactiveCustomersCount++;
    }
  }

  // Ranking de Vendedores
  const sellerStatsMap = new Map<string, { total: number; count: number; commission: number }>();
  for (const o of allSellersOrders) {
    if (o.sellerId) {
      const prev = sellerStatsMap.get(o.sellerId) ?? { total: 0, count: 0, commission: 0 };
      sellerStatsMap.set(o.sellerId, {
        total: prev.total + num(o.total),
        count: prev.count + 1,
        commission: prev.commission + num(o.commissionVal),
      });
    }
  }

  const sellersRanking = sellers.map((s) => {
    const st = sellerStatsMap.get(s.id) ?? { total: 0, count: 0, commission: 0 };
    const goal = num(s.goalRevenue);
    return {
      id: s.id,
      name: s.name,
      realized: st.total,
      goal,
      percentGoal: goal > 0 ? (st.total / goal) * 100 : 0,
      ordersCount: st.count,
      commission: st.commission,
    };
  }).sort((a, b) => b.realized - a.realized);

  const topIds = topProductRows.map((row: { productId: string }) => row.productId);
  const topNames = topIds.length
    ? await prisma.product.findMany({
        where: { id: { in: topIds } },
        select: { id: true, name: true },
      })
    : [];
  const nameById = new Map<string, string>(
    topNames.map((p: { id: string; name: string }) => [p.id, p.name]),
  );

  const pendingDeliveries = await prisma.order.count({
    where: { ...orderScope, status: { in: ['confirmado', 'em_producao'] } },
  });

  const yRev = num(yesterdayAgg._sum?.total);
  const tRev = num(todayAgg._sum?.total);

  return {
    period: { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) },
    customers: { active: activeCustomers, inactiveCount: inactiveCustomersCount },
    products: {
      forSale: productsForSale,
      supplies,
      lowStock: Number(lowStock[0]?.count ?? 0),
    },
    orders: {
      inMonth: monthOrders,
      open: openOrders,
      openValue: num(openValue._sum?.total),
      monthGrossValue: monthRevenue,
      monthBilledValue: num(billedValue._sum?.total),
      pendingDeliveries,
    },
    yesterday: {
      date: yesterdayStr,
      revenue: yRev,
      orders: yesterdayCount,
      averageTicket: yesterdayCount > 0 ? yRev / yesterdayCount : 0,
    },
    today: {
      date: todayStr,
      revenue: tRev,
      orders: todayCount,
      averageTicket: todayCount > 0 ? tRev / todayCount : 0,
    },
    monthProjection: {
      goal: companyGoal,
      realized: monthRevenue,
      projection,
      percentGoal,
      daysElapsed,
      totalDays: totalDaysInMonth,
      prevMonthRevenue,
      growthPercent,
    },
    alerts: {
      deliveriesToday: deliveriesTodayCount,
      overdueReceivableTotal: num(overdueReceivable?._sum?.value),
      overdueReceivableCount: overdueCount,
      inactiveCustomersCount,
    },
    sellersRanking,
    financial: {
      receivable: num(receivable?._sum?.value),
      payable: num(payable?._sum?.value),
      overdueReceivable: num(overdueReceivable?._sum?.value),
      pendingCommissions: num(pendingCommissions?._sum?.value),
    },
    topProducts: topProductRows.map(
      (row: { productId: string; _sum: { quantity: unknown; subtotal: unknown } | null }) => ({
        productId: row.productId,
        name: nameById.get(row.productId) ?? '—',
        quantity: num(row._sum?.quantity),
        total: num(row._sum?.subtotal),
      }),
    ),
    latestOrders: latestOrders.map(
      (row: {
        id: string;
        numero: number;
        orderDate: Date;
        total: unknown;
        status: string;
        customer?: { tradeName: string } | null;
      }) => ({
        id: row.id,
        numero: row.numero,
        customerName: row.customer?.tradeName ?? '—',
        orderDate: row.orderDate ? row.orderDate.toISOString().slice(0, 10) : null,
        total: num(row.total),
        status: row.status,
      }),
    ),
  };
}
