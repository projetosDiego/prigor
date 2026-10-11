import { z } from 'zod';

import { requireManager } from '@/server/auth/guard';
import { ok, readJson, route } from '@/server/http/respond';
import { FAVORITE_KINDS, listFavorites, setFavorite } from '@/server/services/favorites';

const bodySchema = z.object({
  kind: z.enum(FAVORITE_KINDS),
  refId: z.string().min(1).max(64),
  favorite: z.boolean(),
});

export const GET = route('favoritos.listar', async () => {
  await requireManager();
  return ok(await listFavorites());
});

export const POST = route('favoritos.marcar', async (request) => {
  await requireManager();
  const body = bodySchema.parse(await readJson(request));
  await setFavorite(body.kind, body.refId, body.favorite);
  return ok(await listFavorites());
});
