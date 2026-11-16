import fs from 'node:fs/promises';
import path from 'node:path';

import { UPLOAD_DIR } from '@/lib/uploads';

/** Serve as imagens enviadas pelo painel (ficam fora de /public para sobreviver a novos builds). */
export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  if (!/^[a-z0-9-]+\.webp$/.test(file)) return new Response('Não encontrado', { status: 404 });
  try {
    const data = await fs.readFile(path.join(UPLOAD_DIR, file));
    return new Response(new Uint8Array(data), {
      headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'public, max-age=31536000, immutable' },
    });
  } catch {
    return new Response('Não encontrado', { status: 404 });
  }
}
