/**
 * Hash de senha.
 *
 * O custo do bcrypt vem da configuração (padrão 12, contra os 10 anteriores)
 * e pode ser ajustado sem tocar no código.
 */
import bcrypt from 'bcryptjs';

import { env } from '../env';

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, env().BCRYPT_ROUNDS);
}

export async function comparePassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
