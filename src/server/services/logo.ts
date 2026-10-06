/**
 * Logo da Doces Prigor para PDFs (pedido, DANFE).
 * Em desenvolvimento está na raiz do projeto; no container de produção
 * (Next standalone) só a pasta public/ é copiada — por isso as duas tentativas.
 */
import fs from 'node:fs';
import path from 'node:path';

let cached: Buffer | null | undefined;

export function logoBytes(): Buffer | null {
  if (cached !== undefined) return cached;
  for (const p of [path.join(process.cwd(), 'logo.png'), path.join(process.cwd(), 'public', 'logo.png')]) {
    try {
      cached = fs.readFileSync(p);
      return cached;
    } catch {
      // tenta o próximo
    }
  }
  cached = null;
  return null;
}
