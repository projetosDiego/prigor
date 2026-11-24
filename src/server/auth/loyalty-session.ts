/**
 * Sessão do cliente do Clube Prigor (consumidor final, sem senha).
 *
 * O aparelho guarda um token aleatório num cookie httpOnly; no banco fica só o
 * hash SHA-256. Vazou o banco, não vaza sessão. Não tem relação com a sessão
 * dos usuários do sistema (cookie `session`).
 */
import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';

import { isProd } from '../env';

export const LOYALTY_COOKIE = 'prigor_clube';
const TWO_YEARS = 2 * 365 * 24 * 3600;

export function newLoyaltyToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashLoyaltyToken(token) };
}

export function hashLoyaltyToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function setLoyaltyCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(LOYALTY_COOKIE, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: TWO_YEARS,
  });
}

/** Hash do token do cookie atual, ou null se o aparelho não tem cadastro. */
export async function currentLoyaltyHash(): Promise<string | null> {
  const store = await cookies();
  const token = store.get(LOYALTY_COOKIE)?.value;
  if (!token || token.length < 20 || token.length > 100) return null;
  return hashLoyaltyToken(token);
}

export async function clearLoyaltyCookie(): Promise<void> {
  const store = await cookies();
  store.set(LOYALTY_COOKIE, '', { httpOnly: true, secure: isProd, sameSite: 'lax', path: '/', maxAge: 0 });
}
