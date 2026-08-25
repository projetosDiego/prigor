import { NextResponse } from 'next/server';
import { clearSession } from '@/lib/auth';

export async function POST() {
  try {
    await clearSession();
    return NextResponse.json({ success: true, message: 'Desconectado com sucesso.' });
  } catch (error) {
    console.error('Erro na API de Logout:', error);
    return NextResponse.json(
      { error: 'Erro interno ao realizar logout.' },
      { status: 500 }
    );
  }
}
