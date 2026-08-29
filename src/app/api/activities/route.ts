/**
 * Atividades: linha do tempo do lead/cliente e registro de ações do vendedor.
 *
 * Registrar uma atividade move o lead de estágio — visita, reunião e amostra
 * têm cada uma o seu destino no funil. Tudo isso continua numa transação: uma
 * amostra sem o avanço de estágio deixaria o funil mentindo.
 */
import {
  assertOwnedBySeller,
  isManagement,
  requireUser,
  sellerScope,
} from '@/server/auth/guard';
import { prisma } from '@/server/db';
import { badRequest, notFound } from '@/server/http/errors';
import { created, ok, readJson, route } from '@/server/http/respond';
import { paginated } from '@/server/services/serializers';
import { parseQuery } from '@/server/validation/common';
import {
  activityCreateSchema,
  activityListQuerySchema,
  type ActivityTypeValue,
} from '@/server/validation/crm';
import type { Tx } from '@/server/tx';
import type { PipelineStage } from '@prisma/client';

/** Estágio para o qual cada tipo de atividade empurra o lead. */
const STAGE_BY_ACTIVITY: Partial<Record<ActivityTypeValue, PipelineStage>> = {
  VISIT: 'ABORDADO',
  MEETING: 'REUNIAO',
  SAMPLE: 'AMOSTRA',
};

export const GET = route('atividades.listar', async (request) => {
  const session = await requireUser();
  const query = parseQuery(request, activityListQuerySchema);

  const where: Record<string, unknown> = {
    ...(query.leadId ? { leadId: query.leadId } : {}),
    ...(query.customerId ? { customerId: query.customerId } : {}),
    ...(query.type ? { type: query.type } : {}),
  };

  if (query.leadId) {
    // Timeline de um lead: mostra tudo, inclusive os eventos automáticos que
    // não têm vendedor — desde que o lead seja da carteira de quem pede.
    const lead = await prisma.lead.findUnique({
      where: { id: query.leadId },
      select: { sellerId: true },
    });
    if (!lead) throw notFound('Lead');
    assertOwnedBySeller(session, lead, 'lead');
  } else if (query.customerId) {
    const customer = await prisma.customer.findUnique({
      where: { id: query.customerId },
      select: { sellerId: true },
    });
    if (!customer) throw notFound('Cliente');
    assertOwnedBySeller(session, customer, 'cliente');
  } else {
    // Sem âncora, o vendedor só enxerga as próprias ações.
    Object.assign(where, sellerScope(session));
  }

  if (isManagement(session) && query.sellerId) {
    where.sellerId = query.sellerId;
  }

  const [rows, total] = await Promise.all([
    prisma.activity.findMany({
      where,
      orderBy: { date: 'desc' },
      include: {
        seller: { select: { id: true, name: true } },
        lead: { select: { id: true, tradeName: true } },
        customer: { select: { id: true, tradeName: true } },
      },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.activity.count({ where }),
  ]);

  return ok({
    ...paginated(rows, total, query.page, query.pageSize),
  });
});

export const POST = route('atividades.criar', async (request) => {
  const session = await requireUser();
  const input = activityCreateSchema.parse(await readJson(request));

  // Vendedor sempre registra em seu próprio nome; só gestão escolhe o vendedor.
  const sellerId = isManagement(session) ? input.sellerId : session.sellerId;

  if (input.leadId) {
    const lead = await prisma.lead.findUnique({
      where: { id: input.leadId },
      select: { sellerId: true },
    });
    if (!lead) throw notFound('Lead');
    assertOwnedBySeller(session, lead, 'lead');
  }

  if (input.customerId) {
    const customer = await prisma.customer.findUnique({
      where: { id: input.customerId },
      select: { sellerId: true },
    });
    if (!customer) throw notFound('Cliente');
    assertOwnedBySeller(session, customer, 'cliente');
  }

  if ((input.type === 'SAMPLE' || input.type === 'MEETING') && !sellerId) {
    throw badRequest('Amostras e reuniões exigem um vendedor responsável associado.');
  }

  const activity = await prisma.$transaction(async (tx: Tx) => {
    const record = await tx.activity.create({
      data: {
        leadId: input.leadId,
        customerId: input.customerId,
        sellerId,
        type: input.type,
        description: input.description,
        latitude: input.latitude,
        longitude: input.longitude,
        result: input.result,
      },
    });

    if (input.type === 'SAMPLE' && input.leadId && sellerId) {
      await tx.sample.create({
        data: {
          leadId: input.leadId,
          sellerId,
          product: 'Brownie Recheado 7x5 cm',
          quantity: input.sampleQuantity,
          flavors: input.sampleFlavors,
          observation: input.description,
          result: input.sampleResult ?? null,
        },
      });
    }

    if (input.type === 'MEETING' && input.leadId && sellerId) {
      await tx.meeting.create({
        data: {
          leadId: input.leadId,
          sellerId,
          date: input.meetingDate ?? new Date(),
          location: input.meetingLocation,
          observation: input.meetingObservation ?? input.description,
          status: input.meetingStatus,
        },
      });
    }

    const newStage = input.leadId ? STAGE_BY_ACTIVITY[input.type] : undefined;
    if (input.leadId && newStage) {
      await tx.lead.update({
        where: { id: input.leadId },
        data: { pipelineStage: newStage },
      });

      await tx.activity.create({
        data: {
          leadId: input.leadId,
          sellerId,
          type: 'STATUS_CHANGE',
          description: `Estágio do pipeline atualizado automaticamente para [${newStage}] devido ao registro de atividade: [${input.type}].`,
        },
      });
    }

    return record;
  });

  return created({ success: true, activity });
});
