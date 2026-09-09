/**
 * Formas de pagamento configuráveis pelo administrador.
 * O pedido guarda o NOME da forma (texto); esta tabela é a lista de opções.
 */
import { z } from 'zod';

import { prisma, prismaErrorCode, UNIQUE_VIOLATION } from '../db';
import { conflict, notFound } from '../http/errors';
import { timestamp } from './serializers';
import type { paymentOptionSchema, paymentOptionUpdateSchema } from '../validation/sales';

export interface PaymentOptionDTO {
  id: string;
  name: string;
  active: boolean;
  sortOrder: number;
  netDays: number | null;
  createdAt: string | null;
}

interface Row {
  id: string;
  name: string;
  active: boolean;
  sortOrder: number;
  netDays: number | null;
  createdAt: Date;
}

function toDTO(r: Row): PaymentOptionDTO {
  return { id: r.id, name: r.name, active: r.active, sortOrder: r.sortOrder, netDays: r.netDays ?? null, createdAt: timestamp(r.createdAt) };
}

export async function listPaymentOptions(activeOnly: boolean): Promise<PaymentOptionDTO[]> {
  const rows = await prisma.paymentOption.findMany({
    where: activeOnly ? { active: true } : {},
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
  return rows.map(toDTO);
}

export async function createPaymentOption(
  input: z.infer<typeof paymentOptionSchema>,
): Promise<PaymentOptionDTO> {
  try {
    return toDTO(await prisma.paymentOption.create({ data: input }));
  } catch (error) {
    if (prismaErrorCode(error) === UNIQUE_VIOLATION) {
      throw conflict('Já existe uma forma de pagamento com esse nome.');
    }
    throw error;
  }
}

export async function updatePaymentOption(
  id: string,
  input: z.infer<typeof paymentOptionUpdateSchema>,
): Promise<PaymentOptionDTO> {
  const existing = await prisma.paymentOption.findUnique({ where: { id } });
  if (!existing) throw notFound('Forma de pagamento');
  try {
    return toDTO(await prisma.paymentOption.update({ where: { id }, data: input }));
  } catch (error) {
    if (prismaErrorCode(error) === UNIQUE_VIOLATION) {
      throw conflict('Já existe uma forma de pagamento com esse nome.');
    }
    throw error;
  }
}

/** Desativa (soft delete) — não apaga, para não afetar pedidos antigos. */
export async function deletePaymentOption(id: string): Promise<void> {
  const existing = await prisma.paymentOption.findUnique({ where: { id } });
  if (!existing) throw notFound('Forma de pagamento');
  await prisma.paymentOption.update({ where: { id }, data: { active: false } });
}
