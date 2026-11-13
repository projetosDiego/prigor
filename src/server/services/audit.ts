/**
 * Registro de ações sensíveis (quem fez o quê). Best-effort: falha ao gravar o
 * histórico nunca derruba a operação principal.
 */
import { prisma } from '../db';
import type { SessionPayload } from '../auth/guard';

export async function audit(
  session: SessionPayload,
  action: string,
  entity: string,
  entityId: string | null,
  data?: Record<string, unknown>,
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: session.userId,
        action,
        entity,
        entityId,
        newValue: data ? (data as object) : undefined,
      },
    });
  } catch {
    /* histórico é complementar */
  }
}
