import { z } from 'zod';

import { requireAdmin } from '@/server/auth/guard';
import { created, ok, readJson, route } from '@/server/http/respond';
import { userInputSchema } from '@/server/validation/access';
import { createUser, listManagementUsers } from '@/server/services/users';

const createSchema = userInputSchema.extend({
  password: z.string().min(8, 'A senha precisa de pelo menos 8 caracteres.').max(200),
});

export const GET = route('usuarios.listar', async () => {
  await requireAdmin();
  return ok({ data: await listManagementUsers() });
});

export const POST = route('usuarios.criar', async (request) => {
  await requireAdmin();
  const input = createSchema.parse(await readJson(request));
  return created(await createUser(input));
});
