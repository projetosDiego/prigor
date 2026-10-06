/**
 * Quem está pedindo um documento (PDF do boleto, DANFE, XML):
 *  - um usuário logado (gestão vê tudo; vendedor, só a própria carteira); ou
 *  - o cliente, pelo link secreto do pedido (só documentos DAQUELE pedido).
 */
import { isManagement, type SessionPayload } from '../auth/guard';

export interface PublicOrderAccess {
  publicOrderId: string;
}

export type DocAccess = SessionPayload | PublicOrderAccess;

export function isPublicAccess(access: DocAccess): access is PublicOrderAccess {
  return typeof (access as PublicOrderAccess).publicOrderId === 'string';
}

/** O documento (de um pedido) pode ser entregue a quem pediu? */
export function canAccessOrderDoc(access: DocAccess, order: { id: string; sellerId: string | null }): boolean {
  if (isPublicAccess(access)) return access.publicOrderId === order.id;
  return isManagement(access) || order.sellerId === access.sellerId;
}
