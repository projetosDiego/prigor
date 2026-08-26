/**
 * Indicadores do painel.
 *
 * Cada métrica declara a janela de tempo que usa. No sistema anterior,
 * "faturamento do mês" somava pedidos ainda não faturados e a janela era
 * aberta à direita, então pedido com data futura entrava na conta.
 */
import { prisma } from '../db';
import { num } from './serializers';
import { CATEGORY_COMMISSION } from './financial-sync';
import { isManagement, sellerScope, type SessionPayload } from '../auth/guard';

export interface DashboardStats {
  period: { from: string; to: string };
  customers: { active: number };
  products: { forSale: number; supplies: number; lowStock: number };
  orders: {
    inMonth: number;
    open: number;
    openValue: number;
    monthGrossValue: number;
    monthBilledValue: number;
  };
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

  const notCancelled = { status: { not: 'cancelado' } };
  const monthFilter = { ...orderScope, ...notCancelled, orderDate: { gte: start, lte: end } };
  const openFilter = { ...orderScope, status: { in: ['novo', 'confirmado', 'em_producao'] } };
  const billedFilter = {
    ...orderScope,
    status: { in: ['entregue', 'faturado'] },
    orderDate: { gte: start, lte: end },
  };

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
          where: { type: 'receita', status: { in: ['pendente', 'atrasado'] } },
          _sum: { value: true },
        })
      : null,
    showsFinancial
      ? prisma.financialTransaction.aggregate({
          where: { type: 'despesa', status: { in: ['pendente', 'atrasado'] } },
          _sum: { value: true },
        })
      : null,
    showsFinancial
      ? prisma.financialTransaction.aggregate({
          where: {
            type: 'receita',
            status: { in: ['pendente', 'atrasado'] },
            dueDate: { lt: today() },
          },
          _sum: { value: true },
        })
      : null,
    prisma.financialTransaction.aggregate({
      where: {
        type: 'despesa',
        category: CATEGORY_COMMISSION,
        status: { in: ['pendente', 'atrasado'] },
        ...(scope.sellerId ? { order: { sellerId: scope.sellerId } } : {}),
      },
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

  // Resolve os nomes dos top produtos numa única consulta, em vez do N+1
  // que existia antes.
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

  return {
    period: { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) },
    customers: { active: activeCustomers },
    products: {
      forSale: productsForSale,
      supplies,
      lowStock: Number(lowStock[0]?.count ?? 0),
    },
    orders: {
      inMonth: monthOrders,
      open: openOrders,
      openValue: num(openValue._sum.total),
      monthGrossValue: num(monthGross._sum.total),
      monthBilledValue: num(billedValue._sum.total),
    },
    financial: {
      receivable: num(receivable?._sum.value),
      payable: num(payable?._sum.value),
      overdueReceivable: num(overdueReceivable?._sum.value),
      pendingCommissions: num(pendingCommissions._sum.value),
    },
    topProducts: topProductRows.map(
      (row: { productId: string; _sum: { quantity: unknown; subtotal: unknown } }) => ({
        productId: row.productId,
        name: nameById.get(row.productId) ?? '—',
        quantity: num(row._sum.quantity),
        total: num(row._sum.subtotal),
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
