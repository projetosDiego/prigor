import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSession } from '@/lib/auth';
import { PipelineStage, Role } from '@prisma/client';

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || (session.role !== Role.ADMIN && session.role !== Role.MANAGER)) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 });
    }

    // 1. Distribuição de Leads por Estágio (Funil de Vendas)
    const stageCounts = await prisma.lead.groupBy({
      by: ['pipelineStage'],
      _count: { _all: true },
    });

    const funnel: Record<PipelineStage, number> = {
      NOVO: 0,
      QUALIFICADO: 0,
      ATRIBUIDO: 0,
      ABORDADO: 0,
      CONTATO_REALIZADO: 0,
      INTERESSADO: 0,
      REUNIAO: 0,
      AMOSTRA: 0,
      NEGOCIACAO: 0,
      NOVO_REVENDEDOR: 0,
      PERDIDO: 0,
    };

    stageCounts.forEach((item) => {
      funnel[item.pipelineStage] = item._count._all;
    });

    // 2. Totalizadores Gerais
    const totalLeads = await prisma.lead.count();
    const totalCustomers = await prisma.customer.count();
    const activeSellersCount = await prisma.seller.count({ where: { active: true } });

    // 3. Taxa de Conversão Geral
    const convertedCount = funnel.NOVO_REVENDEDOR;
    const conversionRate = totalLeads > 0 ? (convertedCount / totalLeads) * 100 : 0;

    // 4. Tempo Médio de Conversão (Leads Convertidos)
    const convertedLeads = await prisma.lead.findMany({
      where: {
        pipelineStage: PipelineStage.NOVO_REVENDEDOR,
        convertedCustomerId: { not: null },
      },
      select: {
        createdAt: true,
        updatedAt: true, // Data da mudança final de estágio
      },
    });

    let avgConversionTimeDays = 0;
    if (convertedLeads.length > 0) {
      const totalTimeMs = convertedLeads.reduce((sum, lead) => {
        const diff = lead.updatedAt.getTime() - lead.createdAt.getTime();
        return sum + diff;
      }, 0);
      const avgMs = totalTimeMs / convertedLeads.length;
      avgConversionTimeDays = parseFloat((avgMs / (1000 * 60 * 60 * 24)).toFixed(1));
    }

    // 5. Performance por Vendedor
    const sellers = await prisma.seller.findMany({
      include: {
        _count: {
          select: {
            leads: true,
            customers: true,
            activities: true,
          },
        },
      },
    });

    const sellerPerformance = await Promise.all(
      sellers.map(async (seller) => {
        // Obter número de conversões do vendedor
        const conversions = await prisma.lead.count({
          where: {
            sellerId: seller.id,
            pipelineStage: PipelineStage.NOVO_REVENDEDOR,
          },
        });

        // Contar visitas reais
        const visits = await prisma.activity.count({
          where: {
            sellerId: seller.id,
            type: 'VISIT',
          },
        });

        const conversionRateSeller =
          seller._count.leads > 0 ? (conversions / seller._count.leads) * 100 : 0;

        return {
          id: seller.id,
          name: seller.name,
          leadsReceived: seller._count.leads,
          visitsLogged: visits,
          conversions,
          goal: seller.goal,
          conversionRate: parseFloat(conversionRateSeller.toFixed(1)),
        };
      })
    );

    // 6. Performance por Bairro (Top 10)
    const neighborhoodLeads = await prisma.lead.groupBy({
      by: ['neighborhood'],
      _count: { _all: true },
    });

    const neighborhoodPerformance = await Promise.all(
      neighborhoodLeads.slice(0, 10).map(async (n) => {
        const conversions = await prisma.lead.count({
          where: {
            neighborhood: n.neighborhood,
            pipelineStage: PipelineStage.NOVO_REVENDEDOR,
          },
        });
        const total = n._count._all;
        return {
          neighborhood: n.neighborhood,
          totalLeads: total,
          conversions,
          conversionRate: total > 0 ? parseFloat(((conversions / total) * 100).toFixed(1)) : 0,
        };
      })
    );

    // 7. Performance por Categoria de Estabelecimento
    const categoryLeads = await prisma.lead.groupBy({
      by: ['category'],
      _count: { _all: true },
    });

    const categoryPerformance = await Promise.all(
      categoryLeads.map(async (c) => {
        const conversions = await prisma.lead.count({
          where: {
            category: c.category,
            pipelineStage: PipelineStage.NOVO_REVENDEDOR,
          },
        });
        const total = c._count._all;
        return {
          category: c.category,
          totalLeads: total,
          conversions,
          conversionRate: total > 0 ? parseFloat(((conversions / total) * 100).toFixed(1)) : 0,
        };
      })
    );

    return NextResponse.json({
      success: true,
      summary: {
        totalLeads,
        totalCustomers,
        activeSellersCount,
        conversionRate: parseFloat(conversionRate.toFixed(1)),
        avgConversionTimeDays,
      },
      funnel,
      sellerPerformance,
      neighborhoodPerformance,
      categoryPerformance,
    });
  } catch (error) {
    console.error('Error generating admin dashboard:', error);
    return NextResponse.json({ error: 'Erro ao compilar dados do dashboard administrativo.' }, { status: 500 });
  }
}
