/**
 * Sessão do usuário.
 *
 * O token é assinado e verificado com Web Crypto (HMAC-SHA256), a mesma
 * implementação usada no proxy edge — antes havia duas: `jsonwebtoken` nas
 * rotas e uma verificação manual no proxy, com risco de divergirem.
 *
 * O cookie é httpOnly, sameSite=lax e, em produção, secure.
 */
import { cookies } from 'next/headers';

import { env, isProd } from '../env';
import { unauthorized } from '../http/errors';

export type Role = 'ADMIN' | 'MANAGER' | 'SELLER';

export interface SessionPayload {
  userId: string;
  name: string;
  email: string;
  role: Role;
  sellerId: string | null;
}

interface TokenClaims extends SessionPayload {
  iat: number;
  exp: number;
}

export const SESSION_COOKIE = 'session';

const encoder = new TextEncoder();

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlEncodeString(value: string): string {
  return base64UrlEncode(encoder.encode(value));
}

function base64UrlDecodeToString(value: string): string {
  let base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) base64 += '=';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function base64UrlDecodeToBytes(value: string): Uint8Array {
  let base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) base64 += '=';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function hmacKey(secret: string, usage: KeyUsage): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    [usage],
  );
}

export async function signToken(payload: SessionPayload, secret: string, ttlHours: number): Promise<string> {
  const issuedAt = Math.floor(Date.now() / 1000);
  const claims: TokenClaims = {
    ...payload,
    iat: issuedAt,
    exp: issuedAt + ttlHours * 3600,
  };

  const header = base64UrlEncodeString(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64UrlEncodeString(JSON.stringify(claims));
  const data = `${header}.${body}`;

  const key = await hmacKey(secret, 'sign');
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(data)));

  return `${data}.${base64UrlEncode(signature)}`;
}

/**
 * Verifica assinatura e expiração. Devolve `null` para qualquer token
 * inválido — nunca lança, para que o proxy possa simplesmente redirecionar.
 */
export async function verifyToken(token: string, secret: string): Promise<SessionPayload | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [header, body, signature] = parts;
    const key = await hmacKey(secret, 'verify');

    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      base64UrlDecodeToBytes(signature) as unknown as BufferSource,
      encoder.encode(`${header}.${body}`),
    );
    if (!valid) return null;

    const claims = JSON.parse(base64UrlDecodeToString(body)) as TokenClaims;
    if (typeof claims.exp !== 'number' || claims.exp * 1000 <= Date.now()) return null;
    if (!claims.userId || !claims.role) return null;

    return {
      userId: claims.userId,
      name: claims.name,
      email: claims.email,
      role: claims.role,
      sellerId: claims.sellerId ?? null,
    };
  } catch {
    return null;
  }
}

export async function setSession(payload: SessionPayload): Promise<void> {
  const config = env();
  const token = await signToken(payload, config.JWT_SECRET, config.SESSION_TTL_HOURS);
  const store = await cookies();

  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: config.SESSION_TTL_HOURS * 3600,
  });
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, '', {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

/** Sessão atual, ou `null` se não houver. */
export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifyToken(token, env().JWT_SECRET);
}

/** Sessão atual, ou 401. */
export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) throw unauthorized();
  return session;
}
