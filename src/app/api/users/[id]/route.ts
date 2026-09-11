import { z } from 'zod';

import { requireAdmin } from '@/server/auth/guard';
import { ok, readJson, route } from '@/server/http/respond';
import { userUpdateSchema } from '@/server/validation/access';
import { deactivateUser, updateUser } from '@/server/services/users';

type Context = { params: Promise<{ id: string }> };

const updateSchema = userUpdateSchema.and(
  z.object({
    password: z
      .union([z.string(), z.null()])
      .optional()
      .transform((v) => (!v || !v.trim() ? undefined : v.trim()))
      .refine((v) => !v || v.length >= 8, 'A senha precisa ter pelo menos 8 caracteres.'),
  }),
);

export const PATCH = route<Context>('usuarios.atualizar', async (request, { params }) => {
  const session = await requireAdmin();
  const { id } = await params;
  const input = updateSchema.parse(await readJson(request));
  return ok(await updateUser(id, session.userId, input));
});

export const PUT = PATCH;

export const DELETE = route<Context>('usuarios.desativar', async (_request, { params }) => {
  const session = await requireAdmin();
  const { id } = await params;
  await deactivateUser(id, session.userId);
  return ok({ ok: true });
});
