import { NextResponse } from 'next/server';

import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** Usado pelo healthcheck do container: só está saudável se o banco responde. */
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
