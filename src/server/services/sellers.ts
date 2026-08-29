/**
 * Vendedores.
 *
 * Um vendedor sempre tem um usuário de acesso vinculado — os dois nascem e
 * são desativados juntos, para não sobrar login ativo de vendedor desligado.
 */
import { z } from 'zod';

import { prisma, prismaErrorCode, UNIQUE_VIOLATION } from '../db';
import { conflict, notFound } from '../http/errors';
import { hashPassword } from '../auth/password';
import { num, timestamp } from './serializers';
import type { sellerInputSchema, sellerUpdateSchema } from '../validation/sales';
import type { Tx } from '../tx';

type SellerInput = z.infer<typeof sellerInputSchema>;
type SellerUpdate = z.infer<typeof sellerUpdateSchema>;

export interface SellerDTO {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  commissionPct: number;
  goal: number;
  active: boolean;
  notes: string | null;
  /** Quando o vendedor entrou (a data de criação do cadastro). */
  startDate: string | null;
  /** Conta de acesso vinculada. Um vendedor sempre tem uma. */
  user: {
    id: string;
    email: string;
    phone: string | null;
    active: boolean;
  };
  neighborhoods: Array<{ id: string; name: string; regionName: string | null }>;
}

const SELLER_INCLUDE = {
  user: { select: { id: true, email: true, phone: true, active: true } },
  neighborhoods: {
    select: { id: true, name: true, region: { select: { name: true } } },
    orderBy: { name: 'asc' as const },
  },
};

interface SellerRow {
  id: string;
  userId: string;
  name: string;
  phone: string | null;
  email: string | null;
  commissionPct: unknown;
  goal: number;
  active: boolean;
  notes: string | null;
  createdAt: Date;
  user?: { id: string; email: string; phone: string | null; active: boolean } | null;
  neighborhoods?: Array<{ id: string; name: string; region?: { name: string } | null }>;
}

function toDTO(row: SellerRow): SellerDTO {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    commissionPct: num(row.commissionPct),
    goal: row.goal,
    active: row.active,
    notes: row.notes,
    startDate: timestamp(row.createdAt),
    user: {
      id: row.user?.id ?? row.userId,
      email: row.user?.email ?? row.email ?? '',
      phone: row.user?.phone ?? row.phone,
      active: row.user?.active ?? row.active,
    },
    neighborhoods: (row.neighborhoods ?? []).map((n) => ({
      id: n.id,
      name: n.name,
      regionName: n.region?.name ?? null,
    })),
  };
}

export async function listSellers(activeOnly: boolean): Promise<SellerDTO[]> {
  const rows = await prisma.seller.findMany({
    where: activeOnly ? { active: true } : {},
    include: SELLER_INCLUDE,
    orderBy: { name: 'asc' },
  });
  return rows.map(toDTO);
}

export async function getSeller(id: string): Promise<SellerDTO> {
  const row = await prisma.seller.findUnique({ where: { id }, include: SELLER_INCLUDE });
  if (!row) throw notFound('Vendedor');
  return toDTO(row);
}

export async function createSeller(
  input: SellerInput & { password: string },
): Promise<SellerDTO> {
  if (!input.email) throw conflict('E-mail é obrigatório para criar o acesso do vendedor.');

  try {
    const created = await prisma.$transaction(async (tx: Tx) => {
      const user = await tx.user.create({
        data: {
          name: input.name,
          email: input.email!,
          phone: input.phone,
          passwordHash: await hashPassword(input.password),
          role: 'SELLER',
          active: input.active,
        },
      });

      return tx.seller.create({
        data: {
          userId: user.id,
          name: input.name,
          phone: input.phone,
          email: input.email,
          commissionPct: input.commissionPct,
          goal: input.goal,
          notes: input.notes,
          active: input.active,
        },
        include: SELLER_INCLUDE,
      });
    });

    return toDTO(created);
  } catch (error) {
    if (prismaErrorCode(error) === UNIQUE_VIOLATION) {
      throw conflict('Já existe um usuário com esse e-mail.');
    }
    throw error;
  }
}

export async function updateSeller(
  id: string,
  input: SellerUpdate & { password?: string },
): Promise<SellerDTO> {
  const existing = await prisma.seller.findUnique({ where: { id }, select: { id: true, userId: true } });
  if (!existing) throw notFound('Vendedor');

  const updated = await prisma.$transaction(async (tx: Tx) => {
    const userData: Record<string, unknown> = {};
    if (input.name !== undefined) userData.name = input.name;
    if (input.email !== undefined && input.email !== null) userData.email = input.email;
    if (input.phone !== undefined) userData.phone = input.phone;
    if (input.active !== undefined) userData.active = input.active;
    if (input.password) userData.passwordHash = await hashPassword(input.password);

    if (Object.keys(userData).length > 0) {
      await tx.user.update({ where: { id: existing.userId }, data: userData });
    }

    const sellerData: Record<string, unknown> = {};
    for (const key of ['name', 'phone', 'email', 'commissionPct', 'goal', 'notes', 'active'] as const) {
      const value = (input as Record<string, unknown>)[key];
      if (value !== undefined) sellerData[key] = value;
    }

    return tx.seller.update({ where: { id }, data: sellerData, include: SELLER_INCLUDE });
  });

  return toDTO(updated);
}

/**
 * Desativa o vendedor e o acesso dele.
 * Bloqueado enquanto houver pedido em aberto na carteira.
 */
export async function deactivateSeller(id: string): Promise<void> {
  const existing = await prisma.seller.findUnique({ where: { id }, select: { id: true, userId: true } });
  if (!existing) throw notFound('Vendedor');

  const openOrders = await prisma.order.count({
    where: { sellerId: id, status: { in: ['novo', 'confirmado', 'em_producao'] } },
  });
  if (openOrders > 0) {
    throw conflict(
      `Este vendedor tem ${openOrders} pedido(s) em aberto. Transfira ou finalize antes de desativar.`,
    );
  }

  await prisma.$transaction(async (tx: Tx) => {
    await tx.seller.update({ where: { id }, data: { active: false } });
    await tx.user.update({ where: { id: existing.userId }, data: { active: false } });
  });
}
