import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSession } from '@/lib/auth';

// PUT /api/customers/[id] - Update customer
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session || (session.role !== 'ADMIN' && session.role !== 'MANAGER')) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();

    const existing = await prisma.customer.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Cliente não encontrado.' }, { status: 404 });
    }

    // Filtrar e preparar dados atualizados
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
      'sellerId',
      'regionId',
      'neighborhoodId',
      'status',
      'notes',
      'googlePlaceId',
    ];

    for (const key of allowedFields) {
      if (body[key] !== undefined) {
        if (key === 'latitude' || key === 'longitude') {
          updateData[key] = parseFloat(body[key]);
        } else if (key === 'sellerId' || key === 'regionId' || key === 'neighborhoodId') {
          updateData[key] = body[key] === '' ? null : body[key];
        } else {
          updateData[key] = body[key];
        }
      }
    }

    if (body.latitude !== undefined) updateData.latitude = parseFloat(body.latitude);
    if (body.longitude !== undefined) updateData.longitude = parseFloat(body.longitude);

    // Validar CNPJ único se alterado
    if (updateData.cnpj && updateData.cnpj !== existing.cnpj) {
      const cnpjCheck = await prisma.customer.findUnique({
        where: { cnpj: updateData.cnpj },
      });
      if (cnpjCheck) {
        return NextResponse.json({ error: 'Este CNPJ já está sendo utilizado por outro cliente.' }, { status: 400 });
      }
    }

    const updated = await prisma.customer.update({
      where: { id },
      data: updateData,
    });

    // Auditoria
    await prisma.auditLog.create({
      data: {
        userId: session.userId,
        action: 'UPDATE_CUSTOMER',
        entity: 'Customer',
        entityId: id,
        oldValue: existing,
        newValue: updated,
      },
    });

    return NextResponse.json({ success: true, customer: updated });
  } catch (error) {
    console.error('Error updating customer:', error);
    return NextResponse.json({ error: 'Erro ao atualizar cliente.' }, { status: 500 });
  }
}

// DELETE /api/customers/[id] - Delete customer
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session || session.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Apenas administradores podem excluir clientes.' }, { status: 403 });
    }

    const { id } = await params;

    const existing = await prisma.customer.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Cliente não encontrado.' }, { status: 404 });
    }

    await prisma.customer.delete({
      where: { id },
    });

    // Auditoria
    await prisma.auditLog.create({
      data: {
        userId: session.userId,
        action: 'DELETE_CUSTOMER',
        entity: 'Customer',
        entityId: id,
        oldValue: existing,
      },
    });

    return NextResponse.json({ success: true, message: 'Cliente excluído com sucesso.' });
  } catch (error) {
    console.error('Error deleting customer:', error);
    return NextResponse.json({ error: 'Erro ao excluir cliente.' }, { status: 500 });
  }
}
