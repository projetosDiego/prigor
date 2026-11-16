import { NextResponse, type NextRequest } from 'next/server';

import { SESSION_COOKIE, sessionSecret, verifySession } from './lib/auth/token';

/** Protege o painel. Cada action/rota do admin revalida a sessão por conta própria. */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;
  if (pathname === '/admin/login') return NextResponse.next();

  const secret = sessionSecret();
  const session = secret ? await verifySession(request.cookies.get(SESSION_COOKIE)?.value, secret) : null;
  if (session) return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }
  const url = new URL('/admin/login', request.url);
  url.searchParams.set('next', pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
};
