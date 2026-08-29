/**
 * Proxy do Next 16 (o que antes se chamava middleware).
 *
 * Faz o controle de acesso por rota antes de a página renderizar. Usa a MESMA
 * verificação de token das rotas de API — antes havia duas implementações
 * independentes, com risco de divergirem (e divergiram: os segredos eram
 * diferentes).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { SESSION_COOKIE, verifyToken } from './server/auth/session';

const PUBLIC_PATHS = ['/login', '/api/auth/login', '/api/health'];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

function homeFor(role: string): string {
  return role === 'ADMIN' || role === 'MANAGER' ? '/admin/dashboard' : '/seller/dashboard';
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // O segredo é lido direto do ambiente: este código roda no runtime edge,
  // onde não há acesso ao módulo de configuração completo.
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    // Sem segredo não há sessão possível. Falhar fechado é a única opção
    // segura — o comportamento anterior era cair num segredo de exemplo.
    //
    // Fora de produção a resposta diz exatamente o que fazer: esta é a
    // primeira parede em que se esbarra ao subir o projeto pela primeira vez,
    // e "Servidor mal configurado" não ajudava ninguém.
    const emProducao = process.env.NODE_ENV === 'production';
    const message = emProducao
      ? 'Servidor mal configurado.'
      : !secret
        ? 'JWT_SECRET não está definido no .env. Gere um com `openssl rand -hex 32` ' +
          'e cole no arquivo .env (não no .env.example). Depois reinicie o `npm run dev`.'
        : `JWT_SECRET tem apenas ${secret.length} caracteres; o mínimo é 32. ` +
          'Gere um novo com `openssl rand -hex 32`.';

    console.error(`[proxy] ${message}`);

    return new NextResponse(
      JSON.stringify({ error: { code: 'MISCONFIGURED', message }, detail: message }),
      { status: 500, headers: { 'content-type': 'application/json' } },
    );
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifyToken(token, secret) : null;

  if (pathname === '/login') {
    return session
      ? NextResponse.redirect(new URL(homeFor(session.role), request.url))
      : NextResponse.next();
  }

  if (pathname === '/') {
    return NextResponse.redirect(
      new URL(session ? homeFor(session.role) : '/login', request.url),
    );
  }

  if (isPublic(pathname)) return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    if (!session) {
      return new NextResponse(
        JSON.stringify({
          error: { code: 'UNAUTHORIZED', message: 'Sessão expirada ou inválida.' },
          detail: 'Sessão expirada ou inválida.',
        }),
        { status: 401, headers: { 'content-type': 'application/json' } },
      );
    }
    return NextResponse.next();
  }

  if (pathname.startsWith('/admin')) {
    if (!session) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }
    if (session.role !== 'ADMIN' && session.role !== 'MANAGER') {
      return NextResponse.redirect(new URL('/seller/dashboard', request.url));
    }
    return NextResponse.next();
  }

  if (pathname.startsWith('/seller')) {
    if (!session) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.png|.*\\.jpg|.*\\.svg).*)'],
};
