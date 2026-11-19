/**
 * Redefine (ou cria) o login de administrador local.
 * Uso: npm run admin:resetar            (gera uma senha aleatória)
 *      npm run admin:resetar -- <senha>  (usa a senha informada, mín. 12)
 * Precisa do banco no ar (local: npm run db:up).
 *
 * A senha nunca fica no código: é gerada ou informada a cada uso e mostrada
 * uma única vez no terminal.
 */
import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const EMAIL = (process.env.ADMIN_EMAIL || 'admin@prigor.local').trim().toLowerCase();
const informada = process.argv[2];
if (informada !== undefined && informada.length < 12) {
  console.error('A senha precisa ter pelo menos 12 caracteres.');
  process.exit(1);
}
const SENHA = informada ?? `Prigor-${randomBytes(6).toString('base64url')}`;

const prisma = new PrismaClient();

try {
  const hash = await bcrypt.hash(SENHA, 12);
  await prisma.user.upsert({
    where: { email: EMAIL },
    update: { passwordHash: hash, role: 'ADMIN', active: true },
    create: { name: 'Administrador', email: EMAIL, passwordHash: hash, role: 'ADMIN', active: true },
  });
  const admins = await prisma.user.findMany({
    where: { role: 'ADMIN' },
    select: { email: true, active: true },
  });
  console.log('\n✅ Login de administrador pronto:');
  console.log(`   E-mail: ${EMAIL}`);
  console.log(`   Senha:  ${SENHA}`);
  console.log('   (anote agora: ela não fica salva em lugar nenhum)\n');
  console.log('Administradores cadastrados no banco:');
  for (const a of admins) console.log(`   - ${a.email}${a.active ? '' : ' (inativo)'}`);
} catch (e) {
  console.error('\n❌ Não consegui acessar o banco. O Docker Desktop está aberto e você rodou "npm run db:up"?');
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
