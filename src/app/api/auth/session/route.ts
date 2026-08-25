import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';

export async function GET() {
  try {
    const session = await getSession();
    return NextResponse.json({ session });
  } catch (error) {
    console.error('Erro na API de Sessão:', error);
    return NextResponse.json(
      { error: 'Erro interno ao recuperar sessão.' },
      { status: 500 }
    );
  }
}
