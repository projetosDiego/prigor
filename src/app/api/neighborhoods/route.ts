import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSession } from '@/lib/auth';

// GET /api/neighborhoods - List all neighborhoods
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const regionId = searchParams.get('regionId');
    const sellerId = searchParams.get('sellerId');

    const filter: any = {};
    if (regionId) filter.regionId = regionId;
    if (sellerId) filter.sellerId = sellerId;

    const neighborhoods = await prisma.neighborhood.findMany({
      where: filter,
      orderBy: { name: 'asc' },
      include: {
        region: { select: { id: true, name: true } },
        seller: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ neighborhoods });
  } catch (error) {
    console.error('Error fetching neighborhoods:', error);
    return NextResponse.json({ error: 'Erro ao buscar bairros.' }, { status: 500 });
  }
}

// POST /api/neighborhoods - Create neighborhood
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || (session.role !== 'ADMIN' && session.role !== 'MANAGER')) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 });
    }

    const { name, city, state, regionId, sellerId, active } = await request.json();
    if (!name || !regionId) {
      return NextResponse.json({ error: 'Nome e Região são campos obrigatórios.' }, { status: 400 });
    }

    const cityName = city || 'Rio de Janeiro';
    const stateName = state || 'RJ';

    // Verificar se já existe combinação
    const existing = await prisma.neighborhood.findUnique({
      where: {
        name_city_state: {
          name,
          city: cityName,
          state: stateName,
        },
      },
    });

    if (existing) {
      return NextResponse.json({ error: 'Este bairro já está cadastrado nesta cidade e estado.' }, { status: 400 });
    }

    const neighborhood = await prisma.neighborhood.create({
      data: {
        name,
        city: cityName,
        state: stateName,
        regionId,
        sellerId: sellerId || null,
        active: active !== undefined ? active : true,
      },
    });

    // Se um vendedor foi associado, registrar auditoria de atribuição de território
    if (sellerId) {
      await prisma.auditLog.create({
        data: {
          userId: session.userId,
          action: 'ASSIGN_NEIGHBORHOOD',
          entity: 'Neighborhood',
          entityId: neighborhood.id,
          newValue: { sellerId, neighborhoodName: name },
        },
      });
    } else {
      await prisma.auditLog.create({
        data: {
          userId: session.userId,
          action: 'CREATE_NEIGHBORHOOD',
          entity: 'Neighborhood',
          entityId: neighborhood.id,
          newValue: neighborhood,
        },
      });
    }

    return NextResponse.json({ success: true, neighborhood });
  } catch (error) {
    console.error('Error creating neighborhood:', error);
    return NextResponse.json({ error: 'Erro ao cadastrar bairro.' }, { status: 500 });
  }
}
