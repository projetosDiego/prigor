import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

function base64urlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return atob(base64);
}

function base64urlToBuf(str: string): Uint8Array {
  const decoded = base64urlDecode(str);
  const buf = new Uint8Array(decoded.length);
  for (let i = 0; i < decoded.length; i++) {
    buf[i] = decoded.charCodeAt(i);
  }
  return buf;
}

// Edge-safe JWT verify function using Web Crypto API
async function verifyJWT(token: string, secret: string): Promise<any | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, payload, signature] = parts;

    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const data = encoder.encode(`${header}.${payload}`);

    const key = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const sigBuf = base64urlToBuf(signature);
    const isValid = await crypto.subtle.verify('HMAC', key, sigBuf as any, data as any);
    if (!isValid) return null;

    const decodedPayload = JSON.parse(base64urlDecode(payload));
    return decodedPayload;
  } catch (err) {
    return null;
  }
}

// In Next.js 16, Middleware is replaced by Proxy. The function must be named 'proxy'.
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionCookie = request.cookies.get('session')?.value;
  const secret = process.env.JWT_SECRET || 'fallback-secret-for-development-only';

  let session: any = null;
  if (sessionCookie) {
    session = await verifyJWT(sessionCookie, secret);
  }

  // 1. If accessing login page
  if (pathname === '/login') {
    if (session) {
      if (session.role === 'ADMIN' || session.role === 'MANAGER') {
        return NextResponse.redirect(new URL('/admin/dashboard', request.url));
      }
      return NextResponse.redirect(new URL('/seller/dashboard', request.url));
    }
    return NextResponse.next();
  }

  // 2. Redirect root path / based on role or to login
  if (pathname === '/') {
    if (!session) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    if (session.role === 'ADMIN' || session.role === 'MANAGER') {
      return NextResponse.redirect(new URL('/admin/dashboard', request.url));
    }
    return NextResponse.redirect(new URL('/seller/dashboard', request.url));
  }

  // 3. Protect Admin paths
  if (pathname.startsWith('/admin')) {
    if (!session) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }
    if (session.role !== 'ADMIN' && session.role !== 'MANAGER') {
      return NextResponse.redirect(new URL('/seller/dashboard', request.url));
    }
  }

  // 4. Protect Seller paths
  if (pathname.startsWith('/seller')) {
    if (!session) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // 5. Protect API paths except auth login
  if (pathname.startsWith('/api/') && !pathname.startsWith('/api/auth/login')) {
    if (!session) {
      return new NextResponse(
        JSON.stringify({ error: 'Unauthorized - Session expired or invalid' }),
        { status: 401, headers: { 'content-type': 'application/json' } }
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.png|.*\\.jpg|.*\\.svg).*)',
  ],
};
