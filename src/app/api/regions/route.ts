import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSession } from '@/lib/auth';

// GET /api/regions - List all regions
export async function GET() {
  try {
    const regions = await prisma.region.findMany({
      orderBy: { name: 'asc' },
      include: {
        neighborhoods: {
          select: { id: true, name: true, active: true },
        },
      },
    });
    return NextResponse.json({ regions });
  } catch (error) {
    console.error('Error fetching regions:', error);
    return NextResponse.json({ error: 'Erro ao buscar regiões.' }, { status: 500 });
  }
}

// POST /api/regions - Create a new region (Admin/Manager only)
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || (session.role !== 'ADMIN' && session.role !== 'MANAGER')) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 });
    }

    const { name, description, active } = await request.json();
    if (!name) {
      return NextResponse.json({ error: 'O nome da região é obrigatório.' }, { status: 400 });
    }

    const existing = await prisma.region.findUnique({
      where: { name },
    });

    if (existing) {
      return NextResponse.json({ error: 'Uma região com este nome já existe.' }, { status: 400 });
    }

    const region = await prisma.region.create({
      data: {
        name,
        description,
        active: active !== undefined ? active : true,
      },
    });

    // Auditoria
    await prisma.auditLog.create({
      data: {
        userId: session.userId,
        action: 'CREATE_REGION',
        entity: 'Region',
        entityId: region.id,
        newValue: region,
      },
    });

    return NextResponse.json({ success: true, region });
  } catch (error) {
    console.error('Error creating region:', error);
    return NextResponse.json({ error: 'Erro ao criar região.' }, { status: 500 });
  }
}
