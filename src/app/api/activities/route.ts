import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSession } from '@/lib/auth';
import { ActivityType, MeetingStatus, SampleResult, PipelineStage } from '@prisma/client';

// GET /api/activities - Fetch activity history (filtered)
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const leadId = searchParams.get('leadId');
    const customerId = searchParams.get('customerId');
    const sellerId = searchParams.get('sellerId');

    const filter: any = {};
    if (leadId) filter.leadId = leadId;
    if (customerId) filter.customerId = customerId;
    if (sellerId) filter.sellerId = sellerId;

    // Se o usuário logado for vendedor, restringir para suas próprias ações,
    // a menos que esteja filtrando por um lead atribuído a ele (o que já é verificado no middleware/lead)
    if (session.role === 'SELLER') {
      filter.sellerId = session.sellerId;
    }

    const activities = await prisma.activity.findMany({
      where: filter,
      orderBy: { date: 'desc' },
      include: {
        seller: { select: { id: true, name: true } },
        lead: { select: { id: true, tradeName: true } },
        customer: { select: { id: true, tradeName: true } },
      },
    });

    return NextResponse.json({ activities });
  } catch (error) {
    console.error('Error fetching activities:', error);
    return NextResponse.json({ error: 'Erro ao carregar atividades.' }, { status: 500 });
  }
}

// POST /api/activities - Register a new seller activity
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    const body = await request.json();
    const {
      leadId,
      customerId,
      type,
      description,
      latitude,
      longitude,
      result,
      // Dados extras para Amostra (SAMPLE)
      sampleQuantity,
      sampleFlavors,
      sampleResult,
      // Dados extras para Reunião (MEETING)
      meetingDate,
      meetingLocation,
      meetingObservation,
      meetingStatus,
    } = body;

    if (!type || !description) {
      return NextResponse.json({ error: 'Tipo de atividade e descrição são obrigatórios.' }, { status: 400 });
    }

    if (!leadId && !customerId) {
      return NextResponse.json({ error: 'É necessário associar a atividade a um Lead ou Cliente.' }, { status: 400 });
    }

    // Se o usuário logado for SELLER, usar seu sellerId
    const finalSellerId = session.role === 'SELLER' ? session.sellerId : (body.sellerId || null);

    const lat = latitude ? parseFloat(latitude) : null;
    const lng = longitude ? parseFloat(longitude) : null;

    const activity = await prisma.$transaction(async (tx) => {
      // 1. Criar a atividade base
      const act = await tx.activity.create({
        data: {
          leadId: leadId || null,
          customerId: customerId || null,
          sellerId: finalSellerId,
          type: type as ActivityType,
          description,
          latitude: lat,
          longitude: lng,
          result: result || null,
        },
      });

      // 2. Se for uma amostra, salvar dados de controle de estoque/amostra
      if (type === ActivityType.SAMPLE && leadId) {
        if (!finalSellerId) {
          throw new Error('Amostras exigem um vendedor responsável associado.');
        }
        await tx.sample.create({
          data: {
            leadId,
            sellerId: finalSellerId,
            product: 'Brownie Recheado 7x5 cm',
            quantity: sampleQuantity ? parseInt(sampleQuantity) : 1,
            flavors: sampleFlavors || null,
            observation: description,
            result: (sampleResult as SampleResult) || null,
          },
        });
      }

      // 3. Se for uma reunião, criar o agendamento
      if (type === ActivityType.MEETING && leadId) {
        if (!finalSellerId) {
          throw new Error('Reuniões exigem um vendedor responsável associado.');
        }
        await tx.meeting.create({
          data: {
            leadId,
            sellerId: finalSellerId,
            date: meetingDate ? new Date(meetingDate) : new Date(),
            location: meetingLocation || null,
            observation: meetingObservation || description,
            status: (meetingStatus as MeetingStatus) || MeetingStatus.AGENDADA,
          },
        });
      }

      // 4. Mudar estágio do lead caso ocorra visita/amostra/reunião automaticamente
      if (leadId) {
        let newStage = null;
        if (type === ActivityType.VISIT) newStage = PipelineStage.ABORDADO;
        if (type === ActivityType.MEETING) newStage = PipelineStage.REUNIAO;
        if (type === ActivityType.SAMPLE) newStage = PipelineStage.AMOSTRA;

        if (newStage) {
          // Atualizar o lead
          await tx.lead.update({
            where: { id: leadId },
            data: { pipelineStage: newStage },
          });

          // Registrar mudança de estágio também no log da mesma transação
          await tx.activity.create({
            data: {
              leadId,
              sellerId: finalSellerId,
              type: ActivityType.STATUS_CHANGE,
              description: `Estágio do pipeline atualizado automaticamente para [${newStage}] devido ao registro de atividade: [${type}].`,
            },
          });
        }
      }

      return act;
    });

    return NextResponse.json({ success: true, activity });
  } catch (error: any) {
    console.error('Error creating activity:', error);
    return NextResponse.json({ error: error.message || 'Erro ao registrar atividade.' }, { status: 500 });
  }
}
