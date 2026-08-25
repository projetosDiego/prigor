import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSession } from '@/lib/auth';

// PUT /api/regions/[id] - Update region
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session || (session.role !== 'ADMIN' && session.role !== 'MANAGER')) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 });
    }

    const { id } = await params;
    const { name, description, active } = await request.json();

    const existingRegion = await prisma.region.findUnique({
      where: { id },
    });

    if (!existingRegion) {
      return NextResponse.json({ error: 'Região não encontrada.' }, { status: 404 });
    }

    if (name && name !== existingRegion.name) {
      const nameCheck = await prisma.region.findUnique({ where: { name } });
      if (nameCheck) {
        return NextResponse.json({ error: 'Uma região com este nome já existe.' }, { status: 400 });
      }
    }

    const updated = await prisma.region.update({
      where: { id },
      data: {
        name: name !== undefined ? name : existingRegion.name,
        description: description !== undefined ? description : existingRegion.description,
        active: active !== undefined ? active : existingRegion.active,
      },
    });

    // Auditoria
    await prisma.auditLog.create({
      data: {
        userId: session.userId,
        action: 'UPDATE_REGION',
        entity: 'Region',
        entityId: id,
        oldValue: existingRegion,
        newValue: updated,
      },
    });

    return NextResponse.json({ success: true, region: updated });
  } catch (error) {
    console.error('Error updating region:', error);
    return NextResponse.json({ error: 'Erro ao atualizar região.' }, { status: 500 });
  }
}

// DELETE /api/regions/[id] - Delete region
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session || session.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Apenas administradores podem excluir regiões.' }, { status: 403 });
    }

    const { id } = await params;

    const existingRegion = await prisma.region.findUnique({
      where: { id },
      include: { _count: { select: { neighborhoods: true } } },
    });

    if (!existingRegion) {
      return NextResponse.json({ error: 'Região não encontrada.' }, { status: 404 });
    }

    if (existingRegion._count.neighborhoods > 0) {
      return NextResponse.json(
        { error: 'Não é possível excluir uma região que possui bairros associados. Desassocie os bairros primeiro.' },
        { status: 400 }
      );
    }

    await prisma.region.delete({
      where: { id },
    });

    // Auditoria
    await prisma.auditLog.create({
      data: {
        userId: session.userId,
        action: 'DELETE_REGION',
        entity: 'Region',
        entityId: id,
        oldValue: existingRegion,
      },
    });

    return NextResponse.json({ success: true, message: 'Região excluída com sucesso.' });
  } catch (error) {
    console.error('Error deleting region:', error);
    return NextResponse.json({ error: 'Erro ao excluir região.' }, { status: 500 });
  }
}
