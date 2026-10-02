import { prisma } from '../db';
import { notFound } from '../http/errors';
import { dateOnly, num, timestamp } from './serializers';
import type { AdvanceInput } from '../validation/advances';

export interface AdvanceDTO {
  id: string;
  employeeId: string | null;
  employeeName: string | null;
  sellerId: string | null;
  sellerName: string | null;
  date: string;
  amount: number;
  reason: string | null;
  createdAt: string | null;
}

export async function listAdvances(year?: number, month?: number): Promise<AdvanceDTO[]> {
  const where: Record<string, unknown> = {};
  if (year && month) {
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 1));
    where.date = { gte: start, lt: end };
  }

  const rows = await prisma.advance.findMany({
    where,
    include: {
      employee: { select: { id: true, name: true } },
      seller: { select: { id: true, name: true } },
    },
    orderBy: { date: 'desc' },
  });

  return rows.map((r) => ({
    id: r.id,
    employeeId: r.employeeId,
    employeeName: r.employee?.name ?? null,
    sellerId: r.sellerId,
    sellerName: r.seller?.name ?? null,
    date: dateOnly(r.date) ?? '',
    amount: num(r.amount),
    reason: r.reason,
    createdAt: timestamp(r.createdAt),
  }));
}

export async function createAdvance(input: AdvanceInput): Promise<AdvanceDTO> {
  const created = await prisma.advance.create({
    data: {
      employeeId: input.employeeId ?? null,
      sellerId: input.sellerId ?? null,
      date: input.date,
      amount: input.amount,
      reason: input.reason ?? null,
    },
    include: {
      employee: { select: { id: true, name: true } },
      seller: { select: { id: true, name: true } },
    },
  });

  return {
    id: created.id,
    employeeId: created.employeeId,
    employeeName: created.employee?.name ?? null,
    sellerId: created.sellerId,
    sellerName: created.seller?.name ?? null,
    date: dateOnly(created.date) ?? '',
    amount: num(created.amount),
    reason: created.reason,
    createdAt: timestamp(created.createdAt),
  };
}

export async function deleteAdvance(id: string): Promise<void> {
  const existing = await prisma.advance.findUnique({ where: { id } });
  if (!existing) throw notFound('Adiantamento');
  await prisma.advance.delete({ where: { id } });
}
