import { timingSafeEqual } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Refaz todas as páginas guardadas. Chamado pelo próprio container logo depois
 * de subir (docker/entrypoint.sh), porque o build gera as páginas com um banco
 * descartável. Protegido pelo SESSION_SECRET; não é uma rota pública.
 */
export async function POST(req: Request) {
  const secret = process.env.SESSION_SECRET ?? '';
  const given = req.headers.get('x-internal-key') ?? '';
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  if (secret.length < 32 || a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }
  revalidatePath('/', 'layout');
  return NextResponse.json({ ok: true });
}
