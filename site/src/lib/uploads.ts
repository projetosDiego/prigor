import 'server-only';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

import { slugify } from './text';

export const UPLOAD_DIR = path.resolve(/*turbopackIgnore: true*/ process.cwd(), process.env.UPLOAD_DIR ?? './data/uploads');
const MAX_BYTES = 12 * 1024 * 1024;

/**
 * Recebe uma foto do painel, corrige a orientação, limita a 2000 px e salva
 * em WebP. Retorna o caminho público (/media/…).
 */
export async function saveUpload(file: File, baseName: string): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Envie um arquivo de imagem.');
  if (file.size > MAX_BYTES) throw new Error('Imagem acima de 12 MB.');

  const input = Buffer.from(await file.arrayBuffer());
  const name = `${slugify(baseName) || 'imagem'}-${randomBytes(4).toString('hex')}.webp`;
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  await sharp(input)
    .rotate()
    .resize(2000, 2000, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80 })
    .toFile(path.join(UPLOAD_DIR, name));
  return `/media/${name}`;
}
