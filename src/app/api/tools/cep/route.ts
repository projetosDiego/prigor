import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const cep = searchParams.get('cep');
    
    if (!cep) {
      return NextResponse.json({ error: 'CEP é obrigatório.' }, { status: 400 });
    }

    const cleanCep = cep.replace(/\D/g, '');
    console.log(`[Proxy CEP] Buscando CEP no servidor: ${cleanCep}`);

    const response = await fetch(`https://brasilapi.com.br/api/cep/v1/${cleanCep}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
      next: { revalidate: 86400 } // cache de 24 horas
    });

    if (!response.ok) {
      return NextResponse.json({ error: 'CEP não encontrado.' }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (err: any) {
    console.error('[Proxy CEP Error]:', err.message);
    return NextResponse.json({ error: 'Erro ao conectar ao serviço de CEP.' }, { status: 500 });
  }
}
