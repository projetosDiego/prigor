import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSession } from '@/lib/auth';
import { PipelineStage, Role } from '@prisma/client';

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    let sellerId = session.sellerId;
    if (session.role !== Role.SELLER) {
      return NextResponse.json({ error: 'Apenas vendedores podem acessar este painel diretamente.' }, { status: 403 });
    }

    if (!sellerId) {
      return NextResponse.json({ error: 'Vendedor não vinculado a um cadastro.' }, { status: 400 });
    }

    const seller = await prisma.seller.findUnique({
      where: { id: sellerId },
    });

    if (!seller) {
      return NextResponse.json({ error: 'Cadastro de vendedor não encontrado.' }, { status: 404 });
    }

    // 1. Contagens de Leads
    const totalLeads = await prisma.lead.count({
      where: { sellerId },
    });

    const activeLeads = await prisma.lead.count({
      where: {
        sellerId,
        NOT: {
          OR: [
            { pipelineStage: PipelineStage.NOVO_REVENDEDOR },
            { status: 'PERDIDO' }
          ]
        }
      },
    });

    const convertedLeads = await prisma.lead.count({
      where: {
        sellerId,
        pipelineStage: PipelineStage.NOVO_REVENDEDOR,
      },
    });

    const lostLeads = await prisma.lead.count({
      where: {
        sellerId,
        status: 'PERDIDO',
      },
    });

    // 2. Atividades e visitas no mês
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const visitsThisMonth = await prisma.activity.count({
      where: {
        sellerId,
        type: 'VISIT',
        date: { gte: startOfMonth },
      },
    });

    // 3. Reuniões pendentes
    const upcomingMeetings = await prisma.meeting.findMany({
      where: {
        sellerId,
        status: 'AGENDADA',
        date: { gte: new Date() },
      },
      include: {
        lead: { select: { id: true, tradeName: true, address: true } },
      },
      orderBy: { date: 'asc' },
      take: 5,
    });

    // 4. Progresso de metas (Goal vs Converted)
    const goal = seller.goal || 10;
    const goalProgress = convertedLeads;
    const goalPercent = Math.min(100, Math.round((goalProgress / goal) * 100));

    // 5. Atividades recentes do vendedor
    const recentActivities = await prisma.activity.findMany({
      where: { sellerId },
      orderBy: { date: 'desc' },
      take: 5,
      include: {
        lead: { select: { tradeName: true } },
      },
    });

    // 6. [NOVO] Agenda de Entregas da Semana (segunda a domingo)
    const today = new Date();
    const dayOfWeek = today.getDay();
    const diffToMonday = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    const startOfWeek = new Date(today.setDate(diffToMonday));
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 7);

    const weeklyDeliveries = await prisma.pedido.findMany({
      where: {
        sellerId,
        deliveryDate: {
          gte: startOfWeek,
          lt: endOfWeek
        },
        status: {
          in: ['confirmado', 'em_producao', 'faturado']
        }
      },
      orderBy: { deliveryDate: 'asc' },
      include: {
        customer: {
          select: { tradeName: true }
        }
      }
    });

    const formattedDeliveries = weeklyDeliveries.map(d => ({
      id: d.id,
      numero: d.numero,
      cliente: d.customer.tradeName,
      data_entrega: d.deliveryDate?.toISOString(),
      total: d.total,
      status: d.status
    }));

    // 7. [NOVO] Comissões do Mês Acumuladas
    const commissionsSum = await prisma.pedido.aggregate({
      where: {
        sellerId,
        createdAt: { gte: startOfMonth },
        status: { in: ['faturado', 'entregue'] }
      },
      _sum: {
        commissionVal: true
      }
    });
    const monthlyCommissions = commissionsSum._sum.commissionVal || 0.0;

    return NextResponse.json({
      success: true,
      sellerName: seller.name,
      summary: {
        totalLeads,
        activeLeads,
        convertedLeads,
        lostLeads,
        visitsThisMonth,
        goal,
        goalProgress,
        goalPercent,
        monthlyCommissions
      },
      upcomingMeetings,
      recentActivities,
      weeklyDeliveries: formattedDeliveries
    });
  } catch (error) {
    console.error('Error generating seller dashboard:', error);
    return NextResponse.json({ error: 'Erro ao compilar dados do painel do vendedor.' }, { status: 500 });
  }
}
