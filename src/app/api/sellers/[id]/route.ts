import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSession, hashPassword } from '@/lib/auth';
import { PipelineStage, ActivityType } from '@prisma/client';

// PUT /api/sellers/[id] - Update seller
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session || (session.role !== 'ADMIN' && session.role !== 'MANAGER')) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { name, email, password, phone, goal, active, startDate } = body;

    const existing = await prisma.seller.findUnique({
      where: { id },
      include: { user: true },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Vendedor não encontrado.' }, { status: 404 });
    }

    // Preparar dados de atualização
    const updatedData: any = {};
    const updatedUserData: any = {};

    if (name !== undefined) {
      updatedData.name = name;
      updatedUserData.name = name;
    }
    if (phone !== undefined) {
      updatedData.phone = phone;
      updatedUserData.phone = phone;
    }
    if (goal !== undefined) {
      updatedData.goal = parseInt(goal);
    }
    if (startDate !== undefined) {
      updatedData.startDate = new Date(startDate);
    }
    if (active !== undefined) {
      updatedData.active = active;
      updatedUserData.active = active;
    }

    if (email !== undefined && email.toLowerCase() !== existing.user.email) {
      const emailCheck = await prisma.user.findUnique({
        where: { email: email.toLowerCase() },
      });
      if (emailCheck) {
        return NextResponse.json({ error: 'Este e-mail já está sendo utilizado por outro usuário.' }, { status: 400 });
      }
      updatedUserData.email = email.toLowerCase();
    }

    if (password) {
      updatedUserData.passwordHash = await hashPassword(password);
    }

    // Transação para atualizar User e Seller
    const result = await prisma.$transaction(async (tx) => {
      const uUser = await tx.user.update({
        where: { id: existing.userId },
        data: updatedUserData,
      });

      const uSeller = await tx.seller.update({
        where: { id },
        data: updatedData,
      });

      return { uUser, uSeller };
    });

    // REGRA DE NEGÓCIO: Se o vendedor foi desativado, liberar seus territórios e leads
    if (active === false && existing.active === true) {
      // 1. Desassociar de todos os bairros
      await prisma.neighborhood.updateMany({
        where: { sellerId: id },
        data: { sellerId: null },
      });

      // 2. Liberar leads ativos (não convertidos e não perdidos)
      const activeLeads = await prisma.lead.findMany({
        where: {
          sellerId: id,
          NOT: {
            OR: [
              { pipelineStage: PipelineStage.NOVO_REVENDEDOR },
              { status: 'PERDIDO' }
            ]
          }
        }
      });

      if (activeLeads.length > 0) {
        await prisma.lead.updateMany({
          where: {
            id: { in: activeLeads.map(l => l.id) }
          },
          data: {
            sellerId: null,
            status: 'SEM_TERRITORIO'
          }
        });

        // Registrar atividade de desatribuição em lote
        for (const lead of activeLeads) {
          await prisma.activity.create({
            data: {
              leadId: lead.id,
              type: ActivityType.ASSIGNMENT,
              description: `Lead alterado para SEM_TERRITORIO porque o vendedor responsável (${existing.name}) foi desativado no sistema.`,
            }
          });
        }
      }
    }

    // Auditoria
    await prisma.auditLog.create({
      data: {
        userId: session.userId,
        action: 'UPDATE_SELLER',
        entity: 'Seller',
        entityId: id,
        oldValue: { seller: existing, user: existing.user },
        newValue: { seller: result.uSeller, user: result.uUser },
      },
    });

    return NextResponse.json({ success: true, seller: result.uSeller });
  } catch (error) {
    console.error('Error updating seller:', error);
    return NextResponse.json({ error: 'Erro ao atualizar vendedor.' }, { status: 500 });
  }
}

// DELETE /api/sellers/[id] - Delete seller
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session || session.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Apenas administradores podem excluir vendedores.' }, { status: 403 });
    }

    const { id } = await params;

    const existing = await prisma.seller.findUnique({
      where: { id },
      include: {
        user: true,
        _count: {
          select: { leads: true, customers: true },
        },
      },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Vendedor não encontrado.' }, { status: 404 });
    }

    // REGRA DE NEGÓCIO: Se possui leads ou clientes, não pode excluir, deve-se de preferência desativar
    if (existing._count.leads > 0 || existing._count.customers > 0) {
      return NextResponse.json(
        { error: 'Não é possível excluir um vendedor que já possui leads ou clientes históricos. Considere desativar a conta.' },
        { status: 400 }
      );
    }

    // Desassociar bairros
    await prisma.neighborhood.updateMany({
      where: { sellerId: id },
      data: { sellerId: null },
    });

    // Excluir Seller e User
    await prisma.$transaction(async (tx) => {
      await tx.seller.delete({ where: { id } });
      await tx.user.delete({ where: { id: existing.userId } });
    });

    // Auditoria
    await prisma.auditLog.create({
      data: {
        userId: session.userId,
        action: 'DELETE_SELLER',
        entity: 'Seller',
        entityId: id,
        oldValue: { seller: existing, user: existing.user },
      },
    });

    return NextResponse.json({ success: true, message: 'Vendedor excluído com sucesso.' });
  } catch (error) {
    console.error('Error deleting seller:', error);
    return NextResponse.json({ error: 'Erro ao excluir vendedor.' }, { status: 500 });
  }
}
