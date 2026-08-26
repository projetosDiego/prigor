/**
 * Autorização.
 *
 * Antes cada rota repetia `if (session.role !== 'ADMIN' ...)` à mão — e três
 * rotas simplesmente esqueciam. Pior: as telas do vendedor liam a base inteira
 * de clientes e pedidos, porque nenhuma consulta filtrava por vendedor.
 *
 * Aqui a permissão é declarada uma vez, e `sellerScope()` devolve o filtro que
 * o service aplica na consulta, tornando o isolamento por vendedor difícil de
 * esquecer.
 */
import { forbidden } from '../http/errors';
import { requireSession, type Role, type SessionPayload } from './session';

export type { SessionPayload, Role };

const MANAGEMENT: readonly Role[] = ['ADMIN', 'MANAGER'];

export async function requireUser(): Promise<SessionPayload> {
  return requireSession();
}

/** Exige ADMIN ou MANAGER. */
export async function requireManager(): Promise<SessionPayload> {
  const session = await requireSession();
  if (!MANAGEMENT.includes(session.role)) {
    throw forbidden('Esta área é restrita a administradores e gestores.');
  }
  return session;
}

/** Exige ADMIN. */
export async function requireAdmin(): Promise<SessionPayload> {
  const session = await requireSession();
  if (session.role !== 'ADMIN') {
    throw forbidden('Esta ação é restrita a administradores.');
  }
  return session;
}

/**
 * Exige um vendedor com cadastro vinculado.
 * Um usuário SELLER sem `sellerId` não consegue operar carteira nenhuma.
 */
export async function requireSeller(): Promise<SessionPayload & { sellerId: string }> {
  const session = await requireSession();
  if (!session.sellerId) {
    throw forbidden('Seu usuário não está vinculado a um cadastro de vendedor.');
  }
  return session as SessionPayload & { sellerId: string };
}

export function isManagement(session: SessionPayload): boolean {
  return MANAGEMENT.includes(session.role);
}

/**
 * Filtro de escopo por vendedor.
 *
 * Gestão enxerga tudo (`{}`); vendedor enxerga só o que é dele. Use sempre
 * espalhando no `where` da consulta:
 *
 *   where: { active: true, ...sellerScope(session) }
 */
export function sellerScope(session: SessionPayload): { sellerId?: string } {
  if (isManagement(session)) return {};
  return { sellerId: session.sellerId ?? '__sem_vendedor__' };
}

/**
 * Garante que um registro pertence ao vendedor da sessão.
 * Gestão passa sempre.
 */
export function assertOwnedBySeller(
  session: SessionPayload,
  record: { sellerId: string | null } | null,
  resource = 'registro',
): void {
  if (isManagement(session)) return;
  if (!record || record.sellerId !== session.sellerId) {
    throw forbidden(`Este ${resource} não pertence à sua carteira.`);
  }
}
