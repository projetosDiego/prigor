import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSession } from '@/lib/auth';
import { PipelineStage, Role } from '@prisma/client';

// GET /api/leads - List all leads with filters and RBAC enforcement
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const regionId = searchParams.get('regionId');
    const neighborhoodId = searchParams.get('neighborhoodId');
    const category = searchParams.get('category');
    const pipelineStage = searchParams.get('pipelineStage') as PipelineStage | null;
    const priority = searchParams.get('priority');
    const status = searchParams.get('status');
    const searchQuery = searchParams.get('q');

    const filter: any = {};

    // Segurança baseada em Perfil (RBAC):
    // Se for Vendedor, forçar visualização apenas de seus próprios leads
    if (session.role === Role.SELLER) {
      if (!session.sellerId) {
        return NextResponse.json({ leads: [] }); // vendedor sem perfil cadastrado vê lista vazia
      }
      filter.sellerId = session.sellerId;
    } else {
      // Admin/Gestor pode filtrar por vendedor
      const sellerId = searchParams.get('sellerId');
      if (sellerId) {
        filter.sellerId = sellerId === 'null' ? null : sellerId;
      }
    }

    if (regionId) filter.regionId = regionId;
    if (neighborhoodId) filter.neighborhoodId = neighborhoodId;
    if (category) filter.category = category;
    if (pipelineStage) filter.pipelineStage = pipelineStage;
    if (priority) filter.priority = priority;
    if (status) filter.status = status;

    if (searchQuery) {
      filter.OR = [
        { tradeName: { contains: searchQuery, mode: 'insensitive' } },
        { address: { contains: searchQuery, mode: 'insensitive' } },
        { phone: { contains: searchQuery, mode: 'insensitive' } },
      ];
    }

    const leads = await prisma.lead.findMany({
      where: filter,
      orderBy: [{ score: 'desc' }, { createdAt: 'desc' }],
      include: {
        seller: { select: { id: true, name: true } },
        region: { select: { id: true, name: true } },
        neighborhoodRel: { select: { id: true, name: true } },
        convertedCustomer: { select: { id: true, tradeName: true } },
      },
    });

    return NextResponse.json({ leads });
  } catch (error) {
    console.error('Error fetching leads:', error);
    return NextResponse.json({ error: 'Erro ao buscar leads.' }, { status: 500 });
  }
}

// POST /api/leads - Create a lead manually
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
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
      priority,
    } = body;

    if (!tradeName || !address || !neighborhood || !category) {
      return NextResponse.json(
        { error: 'Nome Fantasia, Endereço, Bairro e Categoria são obrigatórios.' },
        { status: 400 }
      );
    }

    // Verificar se já existe lead ou cliente com este Place ID ou CNPJ
    if (cnpj) {
      const existingLeadCnpj = await prisma.lead.findUnique({ where: { cnpj } });
      const existingCustomerCnpj = await prisma.customer.findUnique({ where: { cnpj } });
      if (existingLeadCnpj || existingCustomerCnpj) {
        return NextResponse.json({ error: 'CNPJ já cadastrado no sistema.' }, { status: 400 });
      }
    }

    // Coordenadas padrão caso não enviadas
    const lat = latitude ? parseFloat(latitude) : -22.9068;
    const lng = longitude ? parseFloat(longitude) : -43.1729;

    // Buscar território correspondente no BD para atribuição automática do vendedor
    const matchedNeighborhood = await prisma.neighborhood.findFirst({
      where: {
        name: { equals: neighborhood.trim(), mode: 'insensitive' },
        city: { equals: city?.trim() || 'Rio de Janeiro', mode: 'insensitive' },
      },
      include: { region: true },
    });

    const finalSellerId = matchedNeighborhood?.sellerId || null;
    const finalRegionId = matchedNeighborhood?.regionId || null;
    const finalNeighborhoodId = matchedNeighborhood?.id || null;
    const finalStatus = finalSellerId ? 'ATIVO' : 'SEM_TERRITORIO';

    // Se o vendedor logado for SELLER, e ele estiver criando o lead manualmente,
    // ele vira o dono do lead por padrão (a menos que já pertença a outro território ativo)
    const ownerSellerId = session.role === Role.SELLER ? session.sellerId : finalSellerId;

    const lead = await prisma.lead.create({
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
        city: city || 'Rio de Janeiro',
        state: state || 'RJ',
        zipCode,
        latitude: lat,
        longitude: lng,
        category: category.toLowerCase(),
        sellerId: ownerSellerId,
        regionId: finalRegionId,
        neighborhoodId: finalNeighborhoodId,
        pipelineStage: PipelineStage.NOVO,
        source: 'MANUAL',
        priority: priority || 'MEDIA',
        status: ownerSellerId ? 'ATIVO' : finalStatus,
        score: 50, // Score manual padrão inicial
      },
    });

    // Auditoria de Criação
    await prisma.auditLog.create({
      data: {
        userId: session.userId,
        action: 'CREATE_LEAD_MANUAL',
        entity: 'Lead',
        entityId: lead.id,
        newValue: lead,
      },
    });

    return NextResponse.json({ success: true, lead });
  } catch (error) {
    console.error('Error creating lead:', error);
    return NextResponse.json({ error: 'Erro ao cadastrar lead manualmente.' }, { status: 500 });
  }
}
