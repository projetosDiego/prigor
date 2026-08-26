/**
 * Healthcheck usado pelo Docker e pelo nginx.
 * Verifica o banco de verdade — um app que responde mas não fala com o
 * Postgres não está saudável.
 */
import { NextResponse } from 'next/server';

import { prisma } from '@/server/db';
import { logger } from '@/server/http/logger';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  const startedAt = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      status: 'ok',
      database: 'ok',
      uptimeSeconds: Math.round(process.uptime()),
      latencyMs: Date.now() - startedAt,
    });
  } catch (error) {
    logger.error('healthcheck falhou', { error: error instanceof Error ? error : String(error) });
    return NextResponse.json({ status: 'degraded', database: 'erro' }, { status: 503 });
  }
}
