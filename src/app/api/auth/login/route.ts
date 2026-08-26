import bcrypt from 'bcryptjs';
import { z } from 'zod';

import { prisma } from '@/server/db';
import { env } from '@/server/env';
import { setSession, type Role } from '@/server/auth/session';
import { unauthorized, rateLimited, forbidden } from '@/server/http/errors';
import { ok, readJson, route } from '@/server/http/respond';
import { logger } from '@/server/http/logger';
import { clientIp, hit, reset } from '@/server/http/rate-limit';

const loginSchema = z.object({
  email: z.string().trim().min(1, 'Informe o e-mail.').max(160),
  password: z.string().min(1, 'Informe a senha.').max(200),
});

export const POST = route('auth.login', async (request) => {
  const config = env();
  const ip = clientIp(request);
  const limit = hit(`login:${ip}`, config.LOGIN_RATE_LIMIT, config.LOGIN_RATE_WINDOW_SECONDS);

  if (!limit.allowed) {
    logger.warn('login bloqueado por limite de tentativas', { ip });
    throw rateLimited(
      `Muitas tentativas de login. Tente novamente em ${limit.retryAfterSeconds} segundos.`,
    );
  }

  const { email, password } = loginSchema.parse(await readJson(request));

  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    include: { seller: { select: { id: true, active: true } } },
  });

  // Mesma mensagem para usuário inexistente e senha errada: não entrega quais
  // e-mails existem no sistema.
  const genericFailure = unauthorized('E-mail ou senha inválidos.');

  if (!user) {
    // Gasta o mesmo tempo de um bcrypt real para não vazar a existência da
    // conta pelo tempo de resposta.
    await bcrypt.compare(password, '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin');
    throw genericFailure;
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatches) {
    logger.warn('senha incorreta', { ip, userId: user.id });
    throw genericFailure;
  }

  if (!user.active) {
    throw forbidden('Sua conta está desativada. Fale com o administrador.');
  }

  reset(`login:${ip}`);

  const sellerId = user.seller?.active ? user.seller.id : null;

  await setSession({
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role as Role,
    sellerId,
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: 'LOGIN',
      entity: 'User',
      entityId: user.id,
      newValue: { role: user.role, ip },
    },
  });

  logger.info('login realizado', { userId: user.id, role: user.role });

  const redirectUrl =
    user.role === 'ADMIN' || user.role === 'MANAGER' ? '/admin/dashboard' : '/seller/dashboard';

  return ok({
    success: true,
    user: { id: user.id, name: user.name, email: user.email, role: user.role, sellerId },
    redirectUrl,
  });
});
