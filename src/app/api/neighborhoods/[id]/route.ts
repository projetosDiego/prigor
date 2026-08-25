import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSession } from '@/lib/auth';
import { PipelineStage, ActivityType } from '@prisma/client';

// PUT /api/neighborhoods/[id] - Update neighborhood
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session || (session.role !== 'ADMIN' && session.role !== 'MANAGER')) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 });
    }

    const { id } = await params;
    const { name, city, state, regionId, sellerId, active } = await request.json();

    const existing = await prisma.neighborhood.findUnique({
      where: { id },
      include: { seller: true },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Bairro não encontrado.' }, { status: 404 });
    }

    // Se mudou o nome/cidade/estado, verificar duplicidade
    if (
      (name && name !== existing.name) ||
      (city && city !== existing.city) ||
      (state && state !== existing.state)
    ) {
      const nameCheck = await prisma.neighborhood.findFirst({
        where: {
          name: name !== undefined ? name : existing.name,
          city: city !== undefined ? city : existing.city,
          state: state !== undefined ? state : existing.state,
          NOT: { id },
        },
      });
      if (nameCheck) {
        return NextResponse.json({ error: 'Já existe um bairro cadastrado com estes dados.' }, { status: 400 });
      }
    }

    const updated = await prisma.neighborhood.update({
      where: { id },
      data: {
        name: name !== undefined ? name : existing.name,
        city: city !== undefined ? city : existing.city,
        state: state !== undefined ? state : existing.state,
        regionId: regionId !== undefined ? regionId : existing.regionId,
        sellerId: sellerId !== undefined ? (sellerId === '' ? null : sellerId) : existing.sellerId,
        active: active !== undefined ? active : existing.active,
      },
    });

    // REGRA DE NEGÓCIO: Se o vendedor do território mudou, reatribuir leads ativos desse bairro!
    const oldSellerId = existing.sellerId;
    const newSellerId = sellerId !== undefined ? (sellerId === '' ? null : sellerId) : existing.sellerId;

    if (oldSellerId !== newSellerId) {
      // Buscar leads ativos no bairro (estágio não seja NOVO_REVENDEDOR e status não seja PERDIDO)
      const activeLeads = await prisma.lead.findMany({
        where: {
          neighborhoodId: id,
          NOT: {
            OR: [
              { pipelineStage: PipelineStage.NOVO_REVENDEDOR },
              { status: 'PERDIDO' }
            ]
          }
        }
      });

      if (activeLeads.length > 0) {
        // Atualizar leads
        await prisma.lead.updateMany({
          where: {
            id: { in: activeLeads.map(l => l.id) }
          },
          data: {
            sellerId: newSellerId,
            status: newSellerId ? 'ATIVO' : 'SEM_TERRITORIO'
          }
        });

        // Registrar atividades de transferência e logs para cada lead
        for (const lead of activeLeads) {
          const sellerName = newSellerId 
            ? (await prisma.seller.findUnique({ where: { id: newSellerId } }))?.name || 'Novo Vendedor'
            : 'Fila de Triagem (Sem Vendedor)';

          await prisma.activity.create({
            data: {
              leadId: lead.id,
              type: ActivityType.ASSIGNMENT,
              description: `Lead reatribuído automaticamente devido à mudança de vendedor responsável pelo bairro ${updated.name}. Destino: ${sellerName}.`,
            }
          });

          await prisma.auditLog.create({
            data: {
              userId: session.userId,
              action: 'LEAD_REASSIGN_BY_TERRITORY_CHANGE',
              entity: 'Lead',
              entityId: lead.id,
              oldValue: { sellerId: oldSellerId },
              newValue: { sellerId: newSellerId }
            }
          });
        }
      }
    }

    // Auditoria do Bairro
    await prisma.auditLog.create({
      data: {
        userId: session.userId,
        action: 'UPDATE_NEIGHBORHOOD',
        entity: 'Neighborhood',
        entityId: id,
        oldValue: existing,
        newValue: updated,
      },
    });

    return NextResponse.json({ success: true, neighborhood: updated });
  } catch (error) {
    console.error('Error updating neighborhood:', error);
    return NextResponse.json({ error: 'Erro ao atualizar bairro.' }, { status: 500 });
  }
}

// DELETE /api/neighborhoods/[id] - Delete neighborhood
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session || session.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Apenas administradores podem excluir bairros.' }, { status: 403 });
    }

    const { id } = await params;

    const existing = await prisma.neighborhood.findUnique({
      where: { id },
      include: {
        _count: {
          select: { leads: true, customers: true },
        },
      },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Bairro não encontrado.' }, { status: 404 });
    }

    if (existing._count.leads > 0 || existing._count.customers > 0) {
      return NextResponse.json(
        { error: 'Não é possível excluir um bairro que possui leads ou clientes cadastrados.' },
        { status: 400 }
      );
    }

    await prisma.neighborhood.delete({
      where: { id },
    });

    // Auditoria
    await prisma.auditLog.create({
      data: {
        userId: session.userId,
        action: 'DELETE_NEIGHBORHOOD',
        entity: 'Neighborhood',
        entityId: id,
        oldValue: existing,
      },
    });

    return NextResponse.json({ success: true, message: 'Bairro excluído com sucesso.' });
  } catch (error) {
    console.error('Error deleting neighborhood:', error);
    return NextResponse.json({ error: 'Erro ao excluir bairro.' }, { status: 500 });
  }
}
