/**
 * Painel do vendedor.
 *
 * Todo o painel é escopado pelo `sellerId` da SESSÃO. Nenhum identificador de
 * vendedor é aceito por query string aqui — seria a forma mais direta de um
 * vendedor abrir o painel do colega.
 *
 * O modelo de pedido chama-se `order` (tabela `pedidos`); as consultas antes
 * apontavam para um `prisma.pedido` que não existe no schema.
 */
import { requireSeller } from '@/server/auth/guard';
import { prisma } from '@/server/db';
import { notFound } from '@/server/http/errors';
import { ok, route } from '@/server/http/respond';
import { num, timestamp } from '@/server/services/serializers';

/** Início do mês corrente, em hora local. */
function startOfMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
}

/** Segunda-feira da semana corrente, em hora local. */
function startOfWeek(): Date {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const offset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

interface DeliveryRow {
  id: string;
  numero: number;
  deliveryDate: Date | null;
  total: unknown;
  status: string;
  customer?: { tradeName: string } | null;
}

export const GET = route('painel.vendedor', async () => {
  const session = await requireSeller();
  const sellerId = session.sellerId;

  const seller = await prisma.seller.findUnique({
    where: { id: sellerId },
    select: { name: true, goal: true },
  });
  if (!seller) throw notFound('Cadastro de vendedor');

  const monthStart = startOfMonth();
  const weekStart = startOfWeek();
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);

  const stillOpen = {
    NOT: { OR: [{ pipelineStage: 'NOVO_REVENDEDOR' }, { status: 'PERDIDO' }] },
  };

  const [
    totalLeads,
    activeLeads,
    convertedLeads,
    lostLeads,
    visitsThisMonth,
    upcomingMeetings,
    recentActivities,
    weeklyDeliveries,
    commissionsSum,
  ] = await Promise.all([
    prisma.lead.count({ where: { sellerId } }),
    prisma.lead.count({ where: { sellerId, ...stillOpen } }),
    prisma.lead.count({ where: { sellerId, pipelineStage: 'NOVO_REVENDEDOR' } }),
    prisma.lead.count({ where: { sellerId, status: 'PERDIDO' } }),
    prisma.activity.count({
      where: { sellerId, type: 'VISIT', date: { gte: monthStart } },
    }),
    prisma.meeting.findMany({
      where: { sellerId, status: 'AGENDADA', date: { gte: new Date() } },
      include: { lead: { select: { id: true, tradeName: true, address: true } } },
      orderBy: { date: 'asc' },
      take: 5,
    }),
    prisma.activity.findMany({
      where: { sellerId },
      orderBy: { date: 'desc' },
      take: 5,
      include: { lead: { select: { tradeName: true } } },
    }),
    prisma.order.findMany({
      where: {
        sellerId,
        deliveryDate: { gte: weekStart, lt: weekEnd },
        status: { in: ['confirmado', 'em_producao', 'faturado'] },
      },
      orderBy: { deliveryDate: 'asc' },
      include: { customer: { select: { tradeName: true } } },
    }),
    prisma.order.aggregate({
      where: {
        sellerId,
        createdAt: { gte: monthStart },
        status: { in: ['faturado', 'entregue'] },
      },
      _sum: { commissionVal: true },
    }),
  ]);

  const goal = seller.goal || 10;

  return ok({
    success: true,
    sellerName: seller.name,
    summary: {
      totalLeads,
      activeLeads,
      convertedLeads,
      lostLeads,
      visitsThisMonth,
      goal,
      goalProgress: convertedLeads,
      goalPercent: Math.min(100, Math.round((convertedLeads / goal) * 100)),
      monthlyCommissions: num(commissionsSum._sum.commissionVal),
    },
    upcomingMeetings,
    recentActivities,
    weeklyDeliveries: (weeklyDeliveries as DeliveryRow[]).map((row) => ({
      id: row.id,
      numero: row.numero,
      cliente: row.customer?.tradeName ?? '—',
      data_entrega: timestamp(row.deliveryDate),
      total: num(row.total),
      status: row.status,
    })),
  });
});
