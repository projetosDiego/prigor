import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSession, hashPassword } from '@/lib/auth';
import { Role } from '@prisma/client';

// GET /api/sellers - List all sellers
export async function GET() {
  try {
    const sellers = await prisma.seller.findMany({
      orderBy: { name: 'asc' },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            phone: true,
            active: true,
          },
        },
        neighborhoods: {
          select: {
            id: true,
            name: true,
            region: { select: { name: true } },
          },
        },
      },
    });

    return NextResponse.json({ sellers });
  } catch (error) {
    console.error('Error fetching sellers:', error);
    return NextResponse.json({ error: 'Erro ao buscar vendedores.' }, { status: 500 });
  }
}

// POST /api/sellers - Create user and seller
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || (session.role !== 'ADMIN' && session.role !== 'MANAGER')) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 });
    }

    const body = await request.json();
    const { name, email, password, phone, goal, active, startDate } = body;

    if (!name || !email || !password) {
      return NextResponse.json({ error: 'Nome, E-mail e Senha são campos obrigatórios.' }, { status: 400 });
    }

    // Verificar se e-mail já existe
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existingUser) {
      return NextResponse.json({ error: 'Já existe um usuário cadastrado com este e-mail.' }, { status: 400 });
    }

    const passwordHash = await hashPassword(password);
    const isActive = active !== undefined ? active : true;

    // Transação para criar User e Seller juntos
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name,
          email: email.toLowerCase(),
          phone,
          passwordHash,
          role: Role.SELLER,
          active: isActive,
        },
      });

      const seller = await tx.seller.create({
        data: {
          userId: user.id,
          name,
          phone,
          active: isActive,
          goal: goal ? parseInt(goal) : 0,
          startDate: startDate ? new Date(startDate) : new Date(),
        },
      });

      return { user, seller };
    });

    // Auditoria
    await prisma.auditLog.create({
      data: {
        userId: session.userId,
        action: 'CREATE_SELLER',
        entity: 'Seller',
        entityId: result.seller.id,
        newValue: { sellerId: result.seller.id, email: result.user.email, name: result.seller.name },
      },
    });

    return NextResponse.json({ success: true, seller: result.seller });
  } catch (error) {
    console.error('Error creating seller:', error);
    return NextResponse.json({ error: 'Erro ao cadastrar vendedor.' }, { status: 500 });
  }
}
