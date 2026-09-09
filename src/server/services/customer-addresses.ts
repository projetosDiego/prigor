/**
 * Endereços de entrega do cliente.
 * Um cliente pode ter vários; um pode ser marcado como padrão.
 */
import { prisma } from '../db';
import { notFound } from '../http/errors';
import { timestamp } from './serializers';
import type { z } from 'zod';
import type { addressInputSchema, addressUpdateSchema } from '../validation/sales';
import type { Tx } from '../tx';

export interface CustomerAddressDTO {
  id: string;
  customerId: string;
  label: string | null;
  address: string | null;
  number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  isDefault: boolean;
  createdAt: string | null;
}

interface Row {
  id: string;
  customerId: string;
  label: string | null;
  address: string | null;
  number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  isDefault: boolean;
  createdAt: Date;
}

function toDTO(r: Row): CustomerAddressDTO {
  return {
    id: r.id, customerId: r.customerId, label: r.label, address: r.address, number: r.number,
    complement: r.complement, neighborhood: r.neighborhood, city: r.city, state: r.state,
    zipCode: r.zipCode, isDefault: r.isDefault, createdAt: timestamp(r.createdAt),
  };
}

export async function listCustomerAddresses(customerId: string): Promise<CustomerAddressDTO[]> {
  const rows = await prisma.customerAddress.findMany({
    where: { customerId },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
  });
  return rows.map(toDTO);
}

export async function createCustomerAddress(
  customerId: string,
  input: z.infer<typeof addressInputSchema>,
): Promise<CustomerAddressDTO> {
  const cust = await prisma.customer.findUnique({ where: { id: customerId }, select: { id: true } });
  if (!cust) throw notFound('Cliente');
  return prisma.$transaction(async (tx: Tx) => {
    if (input.isDefault) await tx.customerAddress.updateMany({ where: { customerId }, data: { isDefault: false } });
    const created = await tx.customerAddress.create({ data: { ...input, customerId } });
    return toDTO(created);
  });
}

export async function updateCustomerAddress(
  id: string,
  input: z.infer<typeof addressUpdateSchema>,
): Promise<CustomerAddressDTO> {
  const existing = await prisma.customerAddress.findUnique({ where: { id } });
  if (!existing) throw notFound('Endereço');
  return prisma.$transaction(async (tx: Tx) => {
    if (input.isDefault) {
      await tx.customerAddress.updateMany({ where: { customerId: existing.customerId, NOT: { id } }, data: { isDefault: false } });
    }
    const updated = await tx.customerAddress.update({ where: { id }, data: input });
    return toDTO(updated);
  });
}

export async function deleteCustomerAddress(id: string): Promise<void> {
  const existing = await prisma.customerAddress.findUnique({ where: { id } });
  if (!existing) throw notFound('Endereço');
  await prisma.customerAddress.delete({ where: { id } });
}
