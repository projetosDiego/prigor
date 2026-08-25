import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';

interface NormalizedCNPJ {
  cnpj: string;
  razao_social: string;
  nome_fantasia: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  municipio: string;
  uf: string;
  cep: string;
  ddd_telefone_1: string;
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const cnpj = searchParams.get('cnpj');
    
    if (!cnpj) {
      return NextResponse.json({ error: 'CNPJ é obrigatório.' }, { status: 400 });
    }

    const cleanCnpj = cnpj.replace(/\D/g, '');
    console.log(`[Proxy CNPJ] Iniciando busca unificada para CNPJ: ${cleanCnpj}`);

    let data: any = null;
    let source = '';

    // 1. TENTATIVA 1: ReceitaWS (Muito estável e excelente com endereços)
    try {
      console.log('[Proxy CNPJ] Tentando ReceitaWS...');
      const response = await fetch(`https://receitaws.com.br/v1/cnpj/${cleanCnpj}`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        next: { revalidate: 3600 }
      });
      if (response.ok) {
        const json = await response.json();
        if (json.status !== 'ERROR' && json.nome) {
          data = {
            cnpj: cleanCnpj,
            razao_social: json.nome || '',
            nome_fantasia: json.fantasia || json.nome || '',
            logradouro: json.logradouro || '',
            numero: json.numero || '',
            complemento: json.complemento || '',
            bairro: json.bairro || '',
            municipio: json.municipio || '',
            uf: json.uf || '',
            cep: (json.cep || '').replace(/\D/g, ''),
            ddd_telefone_1: json.telefone || ''
          };
          source = 'ReceitaWS';
          console.log('[Proxy CNPJ] Sucesso via ReceitaWS!');
        }
      }
    } catch (e: any) {
      console.warn('[Proxy CNPJ] ReceitaWS falhou:', e.message);
    }

    // 2. TENTATIVA 2: BrasilAPI (Fallback se a ReceitaWS falhar ou retornar dados incompletos)
    if (!data) {
      try {
        console.log('[Proxy CNPJ] Tentando BrasilAPI...');
        const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cleanCnpj}`, {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
          next: { revalidate: 3600 }
        });
        if (response.ok) {
          const json = await response.json();
          if (json.razao_social) {
            data = {
              cnpj: cleanCnpj,
              razao_social: json.razao_social || '',
              nome_fantasia: json.nome_fantasia || json.razao_social || '',
              logradouro: json.logradouro || '',
              numero: json.numero || '',
              complemento: json.complemento || '',
              bairro: json.bairro || '',
              municipio: json.municipio || '',
              uf: json.uf || '',
              cep: (json.cep || '').replace(/\D/g, ''),
              ddd_telefone_1: json.ddd_telefone_1 || ''
            };
            source = 'BrasilAPI';
            console.log('[Proxy CNPJ] Sucesso via BrasilAPI!');
          }
        }
      } catch (e: any) {
        console.warn('[Proxy CNPJ] BrasilAPI falhou:', e.message);
      }
    }

    // 3. TENTATIVA 3: Minha Receita (Última tentativa gratuita)
    if (!data) {
      try {
        console.log('[Proxy CNPJ] Tentando Minha Receita...');
        const response = await fetch(`https://minhareceita.org/${cleanCnpj}`, {
          method: 'GET',
          headers: { 'Accept': 'application/json' }
        });
        if (response.ok) {
          const json = await response.json();
          if (json.razao_social) {
            data = {
              cnpj: cleanCnpj,
              razao_social: json.razao_social || '',
              nome_fantasia: json.nome_fantasia || json.razao_social || '',
              logradouro: json.logradouro || '',
              numero: json.numero || '',
              complemento: json.complemento || '',
              bairro: json.bairro || '',
              municipio: json.municipio || '',
              uf: json.uf || '',
              cep: (json.cep || '').replace(/\D/g, ''),
              ddd_telefone_1: json.ddd_telefone_1 || ''
            };
            source = 'Minha Receita';
            console.log('[Proxy CNPJ] Sucesso via Minha Receita!');
          }
        }
      } catch (e: any) {
        console.warn('[Proxy CNPJ] Minha Receita falhou:', e.message);
      }
    }

    if (!data) {
      return NextResponse.json({ error: 'CNPJ não encontrado ou indisponível em nenhuma base de dados.' }, { status: 404 });
    }

    // Retorna os dados normalizados com metadados da fonte
    return NextResponse.json({
      success: true,
      source,
      ...data
    });
  } catch (err: any) {
    console.error('[Proxy CNPJ Error]:', err.message);
    return NextResponse.json({ error: 'Erro de conexão interna ao buscar CNPJ.' }, { status: 500 });
  }
}
