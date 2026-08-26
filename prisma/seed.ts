/**
 * Seed de primeira subida.
 *
 * É idempotente e NÃO cria dado fictício: em produção, um banco novo deve
 * nascer com o mínimo para alguém conseguir entrar e configurar o resto.
 * O seed anterior apagava todas as tabelas e populava clientes e leads de
 * mentira — rodar aquilo por engano em produção destruiria a base.
 *
 * Usuário administrador vem das variáveis ADMIN_EMAIL e ADMIN_PASSWORD.
 * Sem elas, nenhum usuário é criado (nada de senha padrão no código).
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const ADMIN_EMAIL = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const ADMIN_NAME = process.env.ADMIN_NAME?.trim() || 'Administrador';
const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS ?? 12);

async function seedAdmin(): Promise<void> {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.log(
      '[seed] ADMIN_EMAIL/ADMIN_PASSWORD não definidos — nenhum usuário criado.\n' +
        '       Defina os dois no .env e rode de novo para criar o administrador.',
    );
    return;
  }

  if (ADMIN_PASSWORD.length < 12) {
    throw new Error('ADMIN_PASSWORD precisa de pelo menos 12 caracteres.');
  }

  const existing = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
  if (existing) {
    console.log(`[seed] administrador já existe: ${ADMIN_EMAIL}`);
    return;
  }

  await prisma.user.create({
    data: {
      name: ADMIN_NAME,
      email: ADMIN_EMAIL,
      passwordHash: await bcrypt.hash(ADMIN_PASSWORD, BCRYPT_ROUNDS),
      role: 'ADMIN',
      active: true,
    },
  });

  // A senha nunca é impressa no log.
  console.log(`[seed] administrador criado: ${ADMIN_EMAIL}`);
}

async function seedSettings(): Promise<void> {
  const score = await prisma.scoreSettings.findFirst();
  if (!score) {
    await prisma.scoreSettings.create({ data: {} });
    console.log('[seed] pesos do Prigor Score criados com os valores padrão');
  }

  const system = await prisma.systemSettings.findFirst();
  if (!system) {
    await prisma.systemSettings.create({
      data: { costWindowMonth: new Date().toISOString().slice(0, 7) },
    });
    console.log('[seed] configuração de sistema criada');
  }
}

async function main(): Promise<void> {
  await seedAdmin();
  await seedSettings();
  console.log('[seed] concluído');
}

main()
  .catch((error) => {
    console.error('[seed] falhou:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
