import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSession } from '@/lib/auth';
import { recalculateAllLeadsScores } from '@/lib/scoring';

// GET /api/settings/score - Get current weights and history
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    let settings = await prisma.scoreSettings.findFirst();
    if (!settings) {
      // Criar padrão caso não exista
      settings = await prisma.scoreSettings.create({
        data: {
          categoryWeight: 25,
          compatibilityWeight: 20,
          commercialWeight: 15,
          regionWeight: 15,
          digitalWeight: 10,
          nearbyWeight: 10,
          dataQualityWeight: 5,
        },
      });
    }

    const history = await prisma.scoreHistory.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return NextResponse.json({ settings, history });
  } catch (error) {
    console.error('Error fetching score settings:', error);
    return NextResponse.json({ error: 'Erro ao buscar configurações de score.' }, { status: 500 });
  }
}

// POST /api/settings/score - Update weights and recalculate lead scores
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || (session.role !== 'ADMIN' && session.role !== 'MANAGER')) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 });
    }

    const body = await request.json();
    const {
      categoryWeight,
      compatibilityWeight,
      commercialWeight,
      regionWeight,
      digitalWeight,
      nearbyWeight,
      dataQualityWeight,
      reason,
    } = body;

    const wCat = parseInt(categoryWeight || 0);
    const wComp = parseInt(compatibilityWeight || 0);
    const wComm = parseInt(commercialWeight || 0);
    const wReg = parseInt(regionWeight || 0);
    const wDig = parseInt(digitalWeight || 0);
    const wNear = parseInt(nearbyWeight || 0);
    const wDq = parseInt(dataQualityWeight || 0);

    const sum = wCat + wComp + wComm + wReg + wDig + wNear + wDq;
    if (sum !== 100) {
      return NextResponse.json(
        { error: `A soma dos pesos deve ser exatamente 100%. Soma informada: ${sum}%` },
        { status: 400 }
      );
    }

    // Buscar configurações atuais
    const current = await prisma.scoreSettings.findFirst();

    let updated;
    if (current) {
      updated = await prisma.scoreSettings.update({
        where: { id: current.id },
        data: {
          categoryWeight: wCat,
          compatibilityWeight: wComp,
          commercialWeight: wComm,
          regionWeight: wReg,
          digitalWeight: wDig,
          nearbyWeight: wNear,
          dataQualityWeight: wDq,
        },
      });
    } else {
      updated = await prisma.scoreSettings.create({
        data: {
          categoryWeight: wCat,
          compatibilityWeight: wComp,
          commercialWeight: wComm,
          regionWeight: wReg,
          digitalWeight: wDig,
          nearbyWeight: wNear,
          dataQualityWeight: wDq,
        },
      });
    }

    // Gravar no histórico de modificações
    await prisma.scoreHistory.create({
      data: {
        weights: updated as any,
        updatedBy: session.name,
        reason: reason || 'Ajuste de calibragem de score.',
      },
    });

    // Gravar auditoria administrativa
    await prisma.auditLog.create({
      data: {
        userId: session.userId,
        action: 'CHANGE_SCORE_WEIGHTS',
        entity: 'ScoreSettings',
        entityId: updated.id,
        oldValue: current as any,
        newValue: updated as any,
      },
    });

    // Disparar o recálculo imediato de todos os leads ativos
    const recalculatedCount = await recalculateAllLeadsScores(session.name);

    return NextResponse.json({
      success: true,
      settings: updated,
      recalculatedCount,
      message: `Pesos salvos com sucesso. ${recalculatedCount} leads ativos foram recalculados.`,
    });
  } catch (error: any) {
    console.error('Error updating score settings:', error);
    return NextResponse.json({ error: error.message || 'Erro ao salvar pesos do score.' }, { status: 500 });
  }
}
