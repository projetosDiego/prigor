/**
 * Cliente Prisma.
 *
 * Singleton em desenvolvimento para não estourar o pool a cada hot reload.
 * Em produção, uma instância por processo.
 */
import { PrismaClient } from '@prisma/client';

import { isProd } from './env';

declare global {
  var prismaGlobal: PrismaClient | undefined;
}

function createClient(): PrismaClient {
  return new PrismaClient({
    log: isProd ? ['warn', 'error'] : ['warn', 'error'],
  });
}

export const prisma: PrismaClient = globalThis.prismaGlobal ?? createClient();

if (!isProd) globalThis.prismaGlobal = prisma;

export default prisma;

/** Código de erro do Prisma para violação de restrição única. */
export const UNIQUE_VIOLATION = 'P2002';
export const FOREIGN_KEY_VIOLATION = 'P2003';
export const RECORD_NOT_FOUND = 'P2025';

export function prismaErrorCode(error: unknown): string | null {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' ? code : null;
  }
  return null;
}

/** Campos envolvidos numa violação de unicidade, quando o Prisma informa. */
export function uniqueViolationFields(error: unknown): string[] {
  if (error && typeof error === 'object' && 'meta' in error) {
    const meta = (error as { meta?: { target?: unknown } }).meta;
    if (Array.isArray(meta?.target)) return meta.target.map(String);
  }
  return [];
}
