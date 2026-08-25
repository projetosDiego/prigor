import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const ERP_BACKEND_URL = process.env.ERP_BACKEND_URL || 'http://localhost:8000';

async function handleProxy(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  try {
    const resolvedParams = await params;
    const pathString = resolvedParams.path.join('/');
    
    // Captura os query parameters
    const { search } = request.nextUrl;
    const targetUrl = `${ERP_BACKEND_URL}/${pathString}${search}`;

    console.log(`[Proxy ERP] Redirecionando requisição para: ${targetUrl}`);

    // Captura os headers da requisição original
    const headers = new Headers();
    request.headers.forEach((value, key) => {
      // Ignora host e content-length que serão recriados pelo fetch
      if (key.toLowerCase() !== 'host' && key.toLowerCase() !== 'content-length') {
        headers.set(key, value);
      }
    });

    // Injeta o token JWT da sessão usando a API cookies() oficial do Next.js
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('session')?.value;
    
    console.log('[Proxy ERP] Cookie de sessão encontrado:', !!sessionCookie);

    if (sessionCookie && !headers.has('authorization')) {
      headers.set('authorization', `Bearer ${sessionCookie}`);
      console.log('[Proxy ERP] Injetado cabeçalho Authorization: Bearer JWT');
    } else if (headers.has('authorization')) {
      console.log('[Proxy ERP] Requisição já possuía cabeçalho Authorization original');
    } else {
      console.log('[Proxy ERP] Alerta: Nenhum token JWT encontrado para injetar!');
    }

    // Lê o body se houver
    let body: any = undefined;
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      const contentType = request.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        body = JSON.stringify(await request.json());
      } else if (contentType.includes('multipart/form-data')) {
        body = await request.formData();
      } else {
        body = await request.blob();
      }
    }

    // Faz a chamada para o backend do ERP (FastAPI)
    const response = await fetch(targetUrl, {
      method: request.method,
      headers,
      body,
      cache: 'no-store',
    });

    console.log(`[Proxy ERP] Resposta do FastAPI para /${pathString}:`, response.status);

    // Lê os headers de retorno
    const responseHeaders = new Headers();
    response.headers.forEach((value, key) => {
      // Evita retornar encoding compactado pelo fetch interno
      if (key.toLowerCase() !== 'content-encoding' && key.toLowerCase() !== 'transfer-encoding') {
        responseHeaders.set(key, value);
      }
    });

    // Retorna a resposta exata obtida do FastAPI
    const responseBody = await response.arrayBuffer();
    return new NextResponse(responseBody, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (error: any) {
    console.error('[Proxy ERP] Erro crítico no proxy:', error);
    return NextResponse.json(
      { error: 'Erro ao se comunicar com o servidor do ERP.', details: error.message },
      { status: 502 }
    );
  }
}

export const GET = handleProxy;
export const POST = handleProxy;
export const PUT = handleProxy;
export const DELETE = handleProxy;
export const PATCH = handleProxy;
