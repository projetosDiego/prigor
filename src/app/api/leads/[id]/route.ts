/**
 * Lead individual: atualização, transição de estágio, perda e conversão.
 *
 * A conversão em revendedor é a operação mais delicada do CRM: cria o cliente,
 * transfere o histórico e marca o lead. Continua inteira numa transação.
 */
import {
  assertOwnedBySeller,
  isManagement,
  requireAdmin,
  requireUser,
} from '@/server/auth/guard';
import { prisma } from '@/server/db';
import { forbidden, notFound } from '@/server/http/errors';
import { ok, readJson, route } from '@/server/http/respond';
import { leadUpdateSchema } from '@/server/validation/crm';

type Context = { params: Promise<{ id: string }> };

interface LeadUpdateData {
  [key: string]: unknown;
}

export const PUT = route<Context>('leads.atualizar', async (request, { params }) => {
  const session = await requireUser();
  const { id } = await params;
  const input = leadUpdateSchema.parse(await readJson(request));

  const existingLead = await prisma.lead.findUnique({
    where: { id },
    include: { seller: { select: { name: true } } },
  });

  if (!existingLead) throw notFound('Lead');

  // Vendedor só mexe na própria carteira; gestão passa direto.
  assertOwnedBySeller(session, existingLead, 'lead');

  const updateData: LeadUpdateData = {};
  const simpleFields = [
    'tradeName',
    'legalName',
    'cnpj',
    'phone',
    'mobile',
    'email',
    'address',
    'number',
    'complement',
    'neighborhood',
    'city',
    'state',
    'zipCode',
    'category',
    'priority',
    'score',
    'status',
    'latitude',
    'longitude',
  ] as const;

  for (const key of simpleFields) {
    const value = input[key];
    if (value !== undefined) updateData[key] = value;
  }

  const isReassignment =
    input.sellerId !== undefined && input.sellerId !== existingLead.sellerId;

  if (isReassignment) {
    if (!isManagement(session)) {
      throw forbidden('Vendedores não possuem permissão para reatribuir leads.');
    }
    updateData.sellerId = input.sellerId;
    updateData.status = input.sellerId ? 'ATIVO' : 'SEM_TERRITORIO';
  }

  const newStage = input.pipelineStage;
  const isStageChanged = Boolean(newStage) && newStage !== existingLead.pipelineStage;

  if (isStageChanged) {
    updateData.pipelineStage = newStage;
    // Primeiro contato: só marca uma vez, na saída do estágio NOVO.
    if (existingLead.pipelineStage === 'NOVO' && newStage !== 'NOVO') {
      updateData.firstContactAt = new Date();
    }
  }

  if (newStage === 'PERDIDO' || input.status === 'PERDIDO') {
    updateData.status = 'PERDIDO';
    if (input.lossReason !== undefined) updateData.lossReason = input.lossReason;
    updateData.lossNotes = input.lossNotes ?? null;
  }

  const result = await prisma.$transaction(async (tx: typeof prisma) => {
    const updatedLead = await tx.lead.update({
      where: { id },
      data: updateData,
      include: { seller: { select: { id: true, name: true } } },
    });

    if (isReassignment) {
      const destSeller = input.sellerId
        ? await tx.seller.findUnique({
            where: { id: input.sellerId },
            select: { name: true },
          })
        : null;
      const destSellerName = input.sellerId
        ? (destSeller?.name ?? 'Vendedor')
        : 'Fila de Triagem (Sem Vendedor)';

      await tx.activity.create({
        data: {
          leadId: id,
          type: 'ASSIGNMENT',
          description: `Lead transferido de [${existingLead.seller?.name ?? 'Sem Vendedor'}] para [${destSellerName}]. Motivo: Reatribuição manual.`,
        },
      });
    }

    if (isStageChanged) {
      await tx.activity.create({
        data: {
          leadId: id,
          type: 'STATUS_CHANGE',
          description: `Estágio do pipeline alterado de [${existingLead.pipelineStage}] para [${newStage}].`,
        },
      });
    }

    // Virou revendedor: nasce um cliente e o histórico do lead vai junto.
    if (newStage === 'NOVO_REVENDEDOR') {
      let existingCustomer: { id: string } | null = null;

      if (updatedLead.googlePlaceId) {
        existingCustomer = await tx.customer.findUnique({
          where: { googlePlaceId: updatedLead.googlePlaceId },
          select: { id: true },
        });
      }
      if (!existingCustomer && updatedLead.cnpj) {
        existingCustomer = await tx.customer.findUnique({
          where: { cnpj: updatedLead.cnpj },
          select: { id: true },
        });
      }

      if (!existingCustomer) {
        const customer = await tx.customer.create({
          data: {
            tradeName: updatedLead.tradeName,
            legalName: updatedLead.legalName,
            cnpj: updatedLead.cnpj,
            phone: updatedLead.phone,
            mobile: updatedLead.mobile,
            email: updatedLead.email,
            address: updatedLead.address,
            number: updatedLead.number,
            complement: updatedLead.complement,
            neighborhood: updatedLead.neighborhood,
            city: updatedLead.city,
            state: updatedLead.state,
            zipCode: updatedLead.zipCode,
            latitude: updatedLead.latitude,
            longitude: updatedLead.longitude,
            category: updatedLead.category,
            sellerId: updatedLead.sellerId,
            regionId: updatedLead.regionId,
            neighborhoodId: updatedLead.neighborhoodId,
            status: 'ATIVO',
            notes: `Convertido a partir do Lead em ${new Date().toLocaleDateString('pt-BR')}.`,
            googlePlaceId: updatedLead.googlePlaceId,
          },
        });

        await tx.lead.update({
          where: { id },
          data: { convertedCustomerId: customer.id },
        });

        await tx.activity.updateMany({
          where: { leadId: id },
          data: { customerId: customer.id },
        });

        await tx.activity.create({
          data: {
            leadId: id,
            customerId: customer.id,
            type: 'STATUS_CHANGE',
            description:
              'Parabéns! O lead foi convertido com sucesso em um Novo Revendedor da Doces Prigor!',
          },
        });

        await tx.auditLog.create({
          data: {
            userId: session.userId,
            action: 'CONVERT_LEAD',
            entity: 'Lead',
            entityId: id,
            newValue: { customerId: customer.id, leadId: id },
          },
        });
      }
    }

    return updatedLead;
  });

  await prisma.auditLog.create({
    data: {
      userId: session.userId,
      action: 'UPDATE_LEAD',
      entity: 'Lead',
      entityId: id,
      oldValue: existingLead,
      newValue: result,
    },
  });

  return ok({ success: true, lead: result });
});

export const PATCH = PUT;

export const DELETE = route<Context>('leads.excluir', async (_request, { params }) => {
  const session = await requireAdmin();
  const { id } = await params;

  const existing = await prisma.lead.findUnique({ where: { id } });
  if (!existing) throw notFound('Lead');

  await prisma.lead.delete({ where: { id } });

  await prisma.auditLog.create({
    data: {
      userId: session.userId,
      action: 'DELETE_LEAD',
      entity: 'Lead',
      entityId: id,
      oldValue: existing,
    },
  });

  return ok({ success: true, message: 'Lead excluído com sucesso.' });
});
