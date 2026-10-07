import { requireManager } from '@/server/auth/guard';
import { created, route } from '@/server/http/respond';
import { duplicateSheet } from '@/server/services/precificacao';

type Context = { params: Promise<{ id: string }> };

export const POST = route<Context>('precificacao.ficha.duplicar', async (_request, { params }) => {
  await requireManager();
  const { id } = await params;
  return created(await duplicateSheet(id));
});
