import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSession } from '@/lib/auth';
import { PipelineStage, Role, ActivityType, LossReason } from '@prisma/client';

// PUT /api/leads/[id] - Update lead, stage transitions, loss records, conversion to customer
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    const existingLead = await prisma.lead.findUnique({
      where: { id },
      include: { seller: true },
    });

    if (!existingLead) {
      return NextResponse.json({ error: 'Lead não encontrado.' }, { status: 404 });
    }

    // RBAC: Vendedor só pode mexer nos seus próprios leads
    if (session.role === Role.SELLER && existingLead.sellerId !== session.sellerId) {
      return NextResponse.json({ error: 'Acesso negado a este lead.' }, { status: 403 });
    }

    const updateData: any = {};
    const allowedFields = [
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
    ];

    for (const key of allowedFields) {
      if (body[key] !== undefined) {
        updateData[key] = body[key];
      }
    }

    if (body.latitude !== undefined) updateData.latitude = parseFloat(body.latitude);
    if (body.longitude !== undefined) updateData.longitude = parseFloat(body.longitude);

    // REGRA DE SEGURANÇA: Apenas admin/gestor pode alterar o vendedor de um lead
    if (body.sellerId !== undefined && body.sellerId !== existingLead.sellerId) {
      if (session.role === Role.SELLER) {
        return NextResponse.json({ error: 'Vendedores não possuem permissão para reatribuir leads.' }, { status: 403 });
      }
      updateData.sellerId = body.sellerId === '' ? null : body.sellerId;
      // Ajustar status do lead
      updateData.status = body.sellerId ? 'ATIVO' : 'SEM_TERRITORIO';
    }

    // Gerenciar alteração de estágio (PipelineStage)
    const newStage = body.pipelineStage as PipelineStage | undefined;
    const isStageChanged = newStage && newStage !== existingLead.pipelineStage;

    if (isStageChanged) {
      updateData.pipelineStage = newStage;

      // Se for o primeiro contato
      if (
        existingLead.pipelineStage === PipelineStage.NOVO &&
        newStage !== PipelineStage.NOVO
      ) {
        updateData.firstContactAt = new Date();
      }
    }

    // Gerenciar perdas (LossReason)
    if (newStage === PipelineStage.PERDIDO || body.status === 'PERDIDO') {
      updateData.status = 'PERDIDO';
      updateData.lossReason = body.lossReason as LossReason;
      updateData.lossNotes = body.lossNotes || null;
    }

    // Executar atualização e regras associadas em transação
    const result = await prisma.$transaction(async (tx) => {
      // 1. Atualizar o lead
      const updatedLead = await tx.lead.update({
        where: { id },
        data: updateData,
        include: { seller: true },
      });

      // 2. Registrar atividades automáticas baseadas em mudanças
      if (body.sellerId !== undefined && body.sellerId !== existingLead.sellerId) {
        const destSellerName = body.sellerId
          ? (await tx.seller.findUnique({ where: { id: body.sellerId } }))?.name || 'Vendedor'
          : 'Fila de Triagem (Sem Vendedor)';

        await tx.activity.create({
          data: {
            leadId: id,
            type: ActivityType.ASSIGNMENT,
            description: `Lead transferido de [${existingLead.seller?.name || 'Sem Vendedor'}] para [${destSellerName}]. Motivo: Reatribuição manual.`,
          },
        });
      }

      if (isStageChanged) {
        await tx.activity.create({
          data: {
            leadId: id,
            type: ActivityType.STATUS_CHANGE,
            description: `Estágio do pipeline alterado de [${existingLead.pipelineStage}] para [${newStage}].`,
          },
        });
      }

      // 3. REGRA DE NEGÓCIO CRÍTICA: Se virou revendedor (NOVO_REVENDEDOR), converter para cliente!
      if (newStage === PipelineStage.NOVO_REVENDEDOR) {
        // Verificar duplicados na tabela de clientes
        let existingCustomer = null;
        if (updatedLead.googlePlaceId) {
          existingCustomer = await tx.customer.findUnique({ where: { googlePlaceId: updatedLead.googlePlaceId } });
        }
        if (!existingCustomer && updatedLead.cnpj) {
          existingCustomer = await tx.customer.findUnique({ where: { cnpj: updatedLead.cnpj } });
        }

        if (!existingCustomer) {
          // Criar novo cliente copiando os dados do Lead
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

          // Vincular no lead a conversão
          await tx.lead.update({
            where: { id },
            data: { convertedCustomerId: customer.id },
          });

          // Associar as atividades, visitas, amostras anteriores ao cliente criado
          await tx.activity.updateMany({
            where: { leadId: id },
            data: { customerId: customer.id },
          });

          // Registrar Log e Atividade de conversão
          await tx.activity.create({
            data: {
              leadId: id,
              customerId: customer.id,
              type: ActivityType.STATUS_CHANGE,
              description: `Parabéns! O lead foi convertido com sucesso em um Novo Revendedor da Doces Prigor!`,
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

    // Auditoria Geral de Alteração
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

    return NextResponse.json({ success: true, lead: result });
  } catch (error: any) {
    console.error('Error updating lead:', error);
    return NextResponse.json({ error: error.message || 'Erro ao atualizar lead.' }, { status: 500 });
  }
}

// DELETE /api/leads/[id] - Delete lead (Admin only)
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session || session.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Apenas administradores podem excluir leads.' }, { status: 403 });
    }

    const { id } = await params;

    const existing = await prisma.lead.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Lead não encontrado.' }, { status: 404 });
    }

    await prisma.lead.delete({
      where: { id },
    });

    // Auditoria
    await prisma.auditLog.create({
      data: {
        userId: session.userId,
        action: 'DELETE_LEAD',
        entity: 'Lead',
        entityId: id,
        oldValue: existing,
      },
    });

    return NextResponse.json({ success: true, message: 'Lead excluído com sucesso.' });
  } catch (error) {
    console.error('Error deleting lead:', error);
    return NextResponse.json({ error: 'Erro ao excluir lead.' }, { status: 500 });
  }
}
