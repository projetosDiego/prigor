import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSession } from '@/lib/auth';

// GET /api/customers - List all customers with filters
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sellerId = searchParams.get('sellerId');
    const regionId = searchParams.get('regionId');
    const neighborhoodId = searchParams.get('neighborhoodId');
    const category = searchParams.get('category');
    const status = searchParams.get('status');

    const filter: any = {};
    if (sellerId) filter.sellerId = sellerId;
    if (regionId) filter.regionId = regionId;
    if (neighborhoodId) filter.neighborhoodId = neighborhoodId;
    if (category) filter.category = category;
    if (status) filter.status = status;

    const customers = await prisma.customer.findMany({
      where: filter,
      orderBy: { tradeName: 'asc' },
      include: {
        seller: { select: { id: true, name: true } },
        region: { select: { id: true, name: true } },
        neighborhoodRel: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ customers });
  } catch (error) {
    console.error('Error fetching customers:', error);
    return NextResponse.json({ error: 'Erro ao buscar clientes.' }, { status: 500 });
  }
}

// POST /api/customers - Create a customer manually
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || (session.role !== 'ADMIN' && session.role !== 'MANAGER')) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 });
    }

    const body = await request.json();
    const {
      tradeName,
      legalName,
      cnpj,
      phone,
      mobile,
      email,
      address,
      number,
      complement,
      neighborhood,
      city,
      state,
      zipCode,
      latitude,
      longitude,
      category,
      sellerId,
      regionId,
      neighborhoodId,
      status,
      notes,
      googlePlaceId,
    } = body;

    if (!tradeName || !address || !neighborhood || !city || !state || !latitude || !longitude || !category) {
      return NextResponse.json(
        { error: 'Campos obrigatórios: Nome Fantasia, Endereço, Bairro, Cidade, Estado, Coordenadas e Categoria.' },
        { status: 400 }
      );
    }

    // Verificar se CNPJ é duplicado
    if (cnpj) {
      const existingCnpj = await prisma.customer.findUnique({
        where: { cnpj },
      });
      if (existingCnpj) {
        return NextResponse.json({ error: 'Este CNPJ já está cadastrado para outro cliente.' }, { status: 400 });
      }
    }

    // Verificar se Google Place ID é duplicado
    if (googlePlaceId) {
      const existingPlace = await prisma.customer.findUnique({
        where: { googlePlaceId },
      });
      if (existingPlace) {
        return NextResponse.json({ error: 'Este estabelecimento já está cadastrado como cliente.' }, { status: 400 });
      }
    }

    const customer = await prisma.customer.create({
      data: {
        tradeName,
        legalName,
        cnpj,
        phone,
        mobile,
        email,
        address,
        number,
        complement,
        neighborhood,
        city,
        state,
        zipCode,
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        category,
        sellerId: sellerId || null,
        regionId: regionId || null,
        neighborhoodId: neighborhoodId || null,
        status: status || 'ATIVO',
        notes,
        googlePlaceId,
      },
    });

    // Auditoria
    await prisma.auditLog.create({
      data: {
        userId: session.userId,
        action: 'CREATE_CUSTOMER',
        entity: 'Customer',
        entityId: customer.id,
        newValue: customer,
      },
    });

    return NextResponse.json({ success: true, customer });
  } catch (error) {
    console.error('Error creating customer:', error);
    return NextResponse.json({ error: 'Erro ao cadastrar cliente.' }, { status: 500 });
  }
}
