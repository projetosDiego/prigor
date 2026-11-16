import 'server-only';
import type { Prisma } from '@prisma/client';

import { LEAD_STATUSES } from './schema';

export type LeadFilters = { status?: string; q?: string; tipo?: string; de?: string; ate?: string };

/** Filtros compartilhados pela lista de leads e pela exportação CSV. */
export function leadWhere(f: LeadFilters): Prisma.LeadWhereInput {
  const where: Prisma.LeadWhereInput = {};
  if (f.status && (LEAD_STATUSES as readonly string[]).includes(f.status)) where.status = f.status;
  if (f.tipo) where.businessType = f.tipo;
  const created: Prisma.DateTimeFilter = {};
  if (f.de && !Number.isNaN(Date.parse(f.de))) created.gte = new Date(`${f.de}T00:00:00`);
  if (f.ate && !Number.isNaN(Date.parse(f.ate))) created.lte = new Date(`${f.ate}T23:59:59`);
  if (created.gte || created.lte) where.createdAt = created;
  const q = f.q?.trim();
  if (q) {
    where.OR = [
      { name: { contains: q } },
      { company: { contains: q } },
      { city: { contains: q } },
      { neighborhood: { contains: q } },
      { whatsapp: { contains: q.replace(/\D/g, '') || q } },
      { instagram: { contains: q } },
    ];
  }
  return where;
}
