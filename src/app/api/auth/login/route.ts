import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { comparePassword, setSession, SessionPayload } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: 'E-mail e senha são obrigatórios.' },
        { status: 400 }
      );
    }

    // Buscar usuário e seu vendedor associado (se houver)
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: { seller: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'Credenciais inválidas.' },
        { status: 401 }
      );
    }

    if (!user.active) {
      return NextResponse.json(
        { error: 'Sua conta está desativada. Entre em contato com o administrador.' },
        { status: 403 }
      );
    }

    const isPasswordCorrect = await comparePassword(password, user.passwordHash);
    if (!isPasswordCorrect) {
      return NextResponse.json(
        { error: 'Credenciais inválidas.' },
        { status: 401 }
      );
    }

    const payload: SessionPayload = {
      userId: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      sellerId: user.seller?.id || null,
    };

    // Salvar sessão no cookie
    await setSession(payload);

    // Gravar log de auditoria
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'LOGIN',
        entity: 'User',
        entityId: user.id,
        newValue: { email: user.email, role: user.role },
      },
    });

    // Definir rota de redirecionamento baseada no cargo
    const redirectUrl =
      user.role === 'ADMIN' || user.role === 'MANAGER'
        ? '/admin/dashboard'
        : '/seller/dashboard';

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        sellerId: user.seller?.id || null,
      },
      redirectUrl,
    });
  } catch (error: any) {
    console.error('Erro na API de Login:', error);
    return NextResponse.json(
      { error: 'Erro interno no servidor ao tentar realizar login.' },
      { status: 500 }
    );
  }
}
