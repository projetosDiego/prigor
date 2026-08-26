/**
 * Região individual: atualização e exclusão.
 *
 * Excluir uma região com bairros pendurados é um erro de operação, não de
 * servidor: vira 409, não 400 genérico.
 */
import { requireAdmin, requireManager } from '@/server/auth/guard';
import { prisma } from '@/server/db';
import { conflict, notFound } from '@/server/http/errors';
import { ok, readJson, route } from '@/server/http/respond';
import { regionUpdateSchema } from '@/server/validation/crm';

type Context = { params: Promise<{ id: string }> };

export const PUT = route<Context>('regioes.atualizar', async (request, { params }) => {
  const session = await requireManager();
  const { id } = await params;
  const input = regionUpdateSchema.parse(await readJson(request));

  const existing = await prisma.region.findUnique({ where: { id } });
  if (!existing) throw notFound('Região');

  if (input.name !== undefined && input.name !== existing.name) {
    const clash = await prisma.region.findUnique({
      where: { name: input.name },
      select: { id: true },
    });
    if (clash) throw conflict('Uma região com este nome já existe.');
  }

  const updated = await prisma.region.update({
    where: { id },
    data: {
      name: input.name ?? existing.name,
      description: input.description !== undefined ? input.description : existing.description,
      active: input.active ?? existing.active,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: session.userId,
      action: 'UPDATE_REGION',
      entity: 'Region',
      entityId: id,
      oldValue: existing,
      newValue: updated,
    },
  });

  return ok({ success: true, region: updated });
});

export const PATCH = PUT;

export const DELETE = route<Context>('regioes.excluir', async (_request, { params }) => {
  const session = await requireAdmin();
  const { id } = await params;

  const existing = await prisma.region.findUnique({
    where: { id },
    include: { _count: { select: { neighborhoods: true } } },
  });
  if (!existing) throw notFound('Região');

  if (existing._count.neighborhoods > 0) {
    throw conflict(
      'Não é possível excluir uma região que possui bairros associados. Desassocie os bairros primeiro.',
    );
  }

  await prisma.region.delete({ where: { id } });

  await prisma.auditLog.create({
    data: {
      userId: session.userId,
      action: 'DELETE_REGION',
      entity: 'Region',
      entityId: id,
      oldValue: existing,
    },
  });

  return ok({ success: true, message: 'Região excluída com sucesso.' });
});
