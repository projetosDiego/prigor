import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSession } from '@/lib/auth';
import { Role } from '@prisma/client';

// GET /api/settings/api-usage - Get current API usage and settings
export async function GET() {
  try {
    const session = await getSession();
    if (!session || (session.role !== Role.ADMIN && session.role !== Role.MANAGER)) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 });
    }

    // Carregar configurações globais
    let settings = await prisma.systemSettings.findFirst();
    if (!settings) {
      settings = await prisma.systemSettings.create({
        data: {
          dailyCostLimit: 10.0,
          monthlyCostLimit: 150.0,
          currentDailyCost: 0.0,
          currentMonthlyCost: 0.0,
          apiPaused: false,
          nearbyRadiusKm: 5,
        },
      });
    }

    // Buscar histórico de chamadas recentes de API
    const recentUsage = await prisma.apiUsage.findMany({
      orderBy: { date: 'desc' },
      take: 50,
    });

    // Calcular percentuais consumidos
    const dailyPercent = Math.min(100, Math.round((settings.currentDailyCost / settings.dailyCostLimit) * 100)) || 0;
    const monthlyPercent = Math.min(100, Math.round((settings.currentMonthlyCost / settings.monthlyCostLimit) * 100)) || 0;

    return NextResponse.json({
      settings: {
        id: settings.id,
        dailyCostLimit: settings.dailyCostLimit,
        monthlyCostLimit: settings.monthlyCostLimit,
        currentDailyCost: parseFloat(settings.currentDailyCost.toFixed(3)),
        currentMonthlyCost: parseFloat(settings.currentMonthlyCost.toFixed(3)),
        apiPaused: settings.apiPaused,
        nearbyRadiusKm: settings.nearbyRadiusKm,
        whatsappTemplate: settings.whatsappTemplate,
        dailyPercent,
        monthlyPercent,
      },
      recentUsage,
    });
  } catch (error) {
    console.error('Error fetching API usage data:', error);
    return NextResponse.json({ error: 'Erro ao carregar controle de custos da API.' }, { status: 500 });
  }
}

// POST /api/settings/api-usage - Update API limits and manual controls
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || (session.role !== Role.ADMIN && session.role !== Role.MANAGER)) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 });
    }

    const body = await request.json();
    const {
      dailyCostLimit,
      monthlyCostLimit,
      apiPaused,
      nearbyRadiusKm,
      whatsappTemplate,
      resetCosts,
    } = body;

    const current = await prisma.systemSettings.findFirst();
    if (!current) {
      return NextResponse.json({ error: 'Configurações de sistema não inicializadas.' }, { status: 400 });
    }

    const updateData: any = {};

    if (dailyCostLimit !== undefined) updateData.dailyCostLimit = parseFloat(dailyCostLimit);
    if (monthlyCostLimit !== undefined) updateData.monthlyCostLimit = parseFloat(monthlyCostLimit);
    if (apiPaused !== undefined) updateData.apiPaused = apiPaused;
    if (nearbyRadiusKm !== undefined) updateData.nearbyRadiusKm = parseInt(nearbyRadiusKm);
    if (whatsappTemplate !== undefined) updateData.whatsappTemplate = whatsappTemplate;

    if (resetCosts === true) {
      updateData.currentDailyCost = 0.0;
      updateData.currentMonthlyCost = 0.0;
      updateData.apiPaused = false; // reativa em caso de reset de custo
    }

    const updated = await prisma.systemSettings.update({
      where: { id: current.id },
      data: updateData,
    });

    // Auditoria
    await prisma.auditLog.create({
      data: {
        userId: session.userId,
        action: 'UPDATE_SYSTEM_SETTINGS',
        entity: 'SystemSettings',
        entityId: current.id,
        oldValue: current as any,
        newValue: updated as any,
      },
    });

    return NextResponse.json({
      success: true,
      settings: updated,
      message: 'Configurações de limites de custo e parametrizações salvas com sucesso.',
    });
  } catch (error) {
    console.error('Error updating system settings:', error);
    return NextResponse.json({ error: 'Erro ao atualizar configurações do sistema.' }, { status: 500 });
  }
}
