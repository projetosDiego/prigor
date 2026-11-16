/**
 * Gera /data/backup.db: uma cópia íntegra do banco do site, mesmo com ele em uso.
 * Chamado pelo backup.sh da VPS (docker exec prigor-site node docker/backup.mjs).
 */
import fs from 'node:fs';
import prisma from '@prisma/client';

const { PrismaClient } = prisma;
const destino = '/data/backup.db';
fs.rmSync(destino, { force: true });
const db = new PrismaClient();
try {
  await db.$executeRawUnsafe(`VACUUM INTO '${destino}'`);
  console.log(`[backup] ${destino} (${fs.statSync(destino).size} bytes)`);
} finally {
  await db.$disconnect();
}
