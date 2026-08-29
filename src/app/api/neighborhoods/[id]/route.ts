/**
 * Bairro individual.
 *
 * Trocar o vendedor de um bairro reatribui os leads ativos dele. Antes isso
 * era um laço que, para cada lead, ia ao banco buscar o MESMO vendedor e
 * gravava atividade e auditoria uma a uma — N+1 puro e fora de transação. Agora
 * o vendedor é resolvido uma vez e os registros vão em lote, tudo atômico.
 */
import { requireAdmin, requireManager } from '@/server/auth/guard';
import { prisma } from '@/server/db';
import { conflict, notFound } from '@/server/http/errors';
import { ok, readJson, route } from '@/server/http/respond';
import { logger } from '@/server/http/logger';
import { neighborhoodUpdateSchema } from '@/server/validation/crm';
import type { Tx } from '@/server/tx';

type Context = { params: Promise<{ id: string }> };

export const PUT = route<Context>('bairros.atualizar', async (request, { params }) => {
  const session = await requireManager();
  const { id } = await params;
  const input = neighborhoodUpdateSchema.parse(await readJson(request));

  const existing = await prisma.neighborhood.findUnique({ where: { id } });
  if (!existing) throw notFound('Bairro');

  const name = input.name ?? existing.name;
  const city = input.city ?? existing.city;
  const state = input.state ?? existing.state;

  if (name !== existing.name || city !== existing.city || state !== existing.state) {
    const clash = await prisma.neighborhood.findFirst({
      where: { name, city, state, NOT: { id } },
      select: { id: true },
    });
    if (clash) throw conflict('Já existe um bairro cadastrado com estes dados.');
  }

  const newSellerId = input.sellerId !== undefined ? input.sellerId : existing.sellerId;
  const oldSellerId: string | null = existing.sellerId;
  const sellerChanged = newSellerId !== oldSellerId;

  // O nome do vendedor de destino é o mesmo para todos os leads: uma consulta.
  const destSeller = sellerChanged && newSellerId
    ? await prisma.seller.findUnique({ where: { id: newSellerId }, select: { name: true } })
    : null;
  const destSellerName = newSellerId
    ? (destSeller?.name ?? 'Novo Vendedor')
    : 'Fila de Triagem (Sem Vendedor)';

  const { updated, reassignedCount } = await prisma.$transaction(async (tx: Tx) => {
    const row = await tx.neighborhood.update({
      where: { id },
      data: { name, city, state, regionId: input.regionId ?? existing.regionId, sellerId: newSellerId, active: input.active ?? existing.active },
    });

    let count = 0;

    if (sellerChanged) {
      // Leads ainda em jogo: já convertidos ou perdidos não mudam de dono.
      const activeLeads = await tx.lead.findMany({
        where: {
          neighborhoodId: id,
          NOT: { OR: [{ pipelineStage: 'NOVO_REVENDEDOR' }, { status: 'PERDIDO' }] },
        },
        select: { id: true },
      });

      const leadIds = activeLeads.map((lead: { id: string }) => lead.id);
      count = leadIds.length;

      if (leadIds.length > 0) {
        await tx.lead.updateMany({
          where: { id: { in: leadIds } },
          data: { sellerId: newSellerId, status: newSellerId ? 'ATIVO' : 'SEM_TERRITORIO' },
        });

        await tx.activity.createMany({
          data: leadIds.map((leadId: string) => ({
            leadId,
            type: 'ASSIGNMENT',
            description: `Lead reatribuído automaticamente devido à mudança de vendedor responsável pelo bairro ${row.name}. Destino: ${destSellerName}.`,
          })),
        });

        await tx.auditLog.createMany({
          data: leadIds.map((leadId: string) => ({
            userId: session.userId,
            action: 'LEAD_REASSIGN_BY_TERRITORY_CHANGE',
            entity: 'Lead',
            entityId: leadId,
            oldValue: { sellerId: oldSellerId },
            newValue: { sellerId: newSellerId },
          })),
        });
      }
    }

    await tx.auditLog.create({
      data: {
        userId: session.userId,
        action: 'UPDATE_NEIGHBORHOOD',
        entity: 'Neighborhood',
        entityId: id,
        oldValue: existing,
        newValue: row,
      },
    });

    return { updated: row, reassignedCount: count };
  });

  if (sellerChanged) {
    logger.info('território reatribuído', {
      route: 'bairros.atualizar',
      neighborhoodId: id,
      reassignedLeads: reassignedCount,
    });
  }

  return ok({ success: true, neighborhood: updated, reassignedLeads: reassignedCount });
});

export const PATCH = PUT;

export const DELETE = route<Context>('bairros.excluir', async (_request, { params }) => {
  const session = await requireAdmin();
  const { id } = await params;

  const existing = await prisma.neighborhood.findUnique({
    where: { id },
    include: { _count: { select: { leads: true, customers: true } } },
  });
  if (!existing) throw notFound('Bairro');

  if (existing._count.leads > 0 || existing._count.customers > 0) {
    throw conflict('Não é possível excluir um bairro que possui leads ou clientes cadastrados.');
  }

  await prisma.neighborhood.delete({ where: { id } });

  await prisma.auditLog.create({
    data: {
      userId: session.userId,
      action: 'DELETE_NEIGHBORHOOD',
      entity: 'Neighborhood',
      entityId: id,
      oldValue: existing,
    },
  });

  return ok({ success: true, message: 'Bairro excluído com sucesso.' });
});
