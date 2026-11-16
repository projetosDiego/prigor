import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createHash, timingSafeEqual } from 'node:crypto';

import { SESSION_COOKIE, sessionSecret, verifySession, type Session } from './token';

export async function getSession(): Promise<Session | null> {
  const secret = sessionSecret();
  if (!secret) return null;
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value, secret);
}

/** Toda server action e rota do painel passa por aqui — o proxy não basta. */
export async function requireAdmin(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect('/admin/login');
  return session;
}

function sha(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

export function credentialsMatch(email: string, password: string): boolean {
  const expectedEmail = (process.env.ADMIN_EMAIL ?? '').trim().toLowerCase();
  const expectedPassword = process.env.ADMIN_PASSWORD ?? '';
  if (!expectedEmail || expectedPassword.length < 12) return false;
  const emailOk = timingSafeEqual(sha(email.trim().toLowerCase()), sha(expectedEmail));
  const passOk = timingSafeEqual(sha(password), sha(expectedPassword));
  return emailOk && passOk;
}

export function adminConfigured(): boolean {
  return Boolean(process.env.ADMIN_EMAIL && (process.env.ADMIN_PASSWORD ?? '').length >= 12 && sessionSecret());
}
