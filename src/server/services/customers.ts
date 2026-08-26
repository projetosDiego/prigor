/**
 * Clientes.
 *
 * O cadastro passou a aceitar telefone, UF e coordenadas — no sistema
 * anterior a tela do vendedor enviava esses campos com outro nome e o backend
 * os descartava em silêncio, então o telefone digitado simplesmente sumia.
 */
import { z } from 'zod';

import { prisma, prismaErrorCode, UNIQUE_VIOLATION } from '../db';
import { conflict, notFound } from '../http/errors';
import { isManagement, sellerScope, type SessionPayload } from '../auth/guard';
import { paginated, toCustomerDTO, type CustomerDTO, type Paginated } from './serializers';
import type {
  customerInputSchema,
  customerListQuerySchema,
  customerUpdateSchema,
} from '../validation/sales';

type CustomerInput = z.infer<typeof customerInputSchema>;
type CustomerUpdate = z.infer<typeof customerUpdateSchema>;
type CustomerQuery = z.infer<typeof customerListQuerySchema>;

const CUSTOMER_INCLUDE = { seller: { select: { name: true } } };

export async function listCustomers(
  session: SessionPayload,
  params: CustomerQuery,
): Promise<Paginated<CustomerDTO>> {
  const where: Record<string, unknown> = {};

  // Vendedor vê apenas a própria carteira.
  const scope = sellerScope(session);
  if (scope.sellerId) where.sellerId = scope.sellerId;
  else if (params.sellerId) where.sellerId = params.sellerId;

  if (params.activeOnly) where.active = true;

  if (params.search) {
    const search = params.search;
    where.OR = [
      { tradeName: { contains: search, mode: 'insensitive' } },
      { legalName: { contains: search, mode: 'insensitive' } },
      { cnpj: { contains: search.replace(/\D/g, '') } },
      { cpf: { contains: search.replace(/\D/g, '') } },
      { neighborhood: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search } },
      { mobile: { contains: search } },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      include: CUSTOMER_INCLUDE,
      orderBy: { tradeName: 'asc' },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
    prisma.customer.count({ where }),
  ]);

  return paginated(rows.map(toCustomerDTO), total, params.page, params.pageSize);
}

export async function getCustomer(session: SessionPayload, id: string): Promise<CustomerDTO> {
  const row = await prisma.customer.findUnique({ where: { id }, include: CUSTOMER_INCLUDE });
  if (!row) throw notFound('Cliente');

  if (!isManagement(session) && row.sellerId !== session.sellerId) {
    throw notFound('Cliente');
  }

  return toCustomerDTO(row);
}

function handleUnique(error: unknown): never {
  if (prismaErrorCode(error) === UNIQUE_VIOLATION) {
    throw conflict('Já existe um cliente com esse CNPJ.');
  }
  throw error;
}

function toPersistable(input: CustomerInput | CustomerUpdate): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  const keys: Array<keyof CustomerInput> = [
    'tradeName',
    'legalName',
    'cnpj',
    'cpf',
    'phone',
    'mobile',
    'email',
    'address',
    'number',
    'complement',
    'neighborhood',
    'city',
    'state',
    'zipCode',
    'latitude',
    'longitude',
    'category',
    'regionId',
    'neighborhoodId',
    'notes',
    'isReseller',
    'active',
  ];

  for (const key of keys) {
    const value = (input as Record<string, unknown>)[key];
    if (value !== undefined) data[key] = value;
  }

  if (typeof data.state === 'string') data.state = (data.state as string).toUpperCase();
  return data;
}

export async function createCustomer(
  session: SessionPayload,
  input: CustomerInput,
): Promise<CustomerDTO> {
  try {
    const created = await prisma.customer.create({
      data: {
        ...toPersistable(input),
        // Vendedor sempre cadastra na própria carteira.
        sellerId: isManagement(session) ? null : session.sellerId,
      },
      include: CUSTOMER_INCLUDE,
    });
    return toCustomerDTO(created);
  } catch (error) {
    handleUnique(error);
  }
}

export async function updateCustomer(
  session: SessionPayload,
  id: string,
  input: CustomerUpdate,
): Promise<CustomerDTO> {
  const existing = await prisma.customer.findUnique({
    where: { id },
    select: { id: true, sellerId: true },
  });
  if (!existing) throw notFound('Cliente');

  if (!isManagement(session) && existing.sellerId !== session.sellerId) {
    throw notFound('Cliente');
  }

  try {
    const updated = await prisma.customer.update({
      where: { id },
      data: toPersistable(input),
      include: CUSTOMER_INCLUDE,
    });
    return toCustomerDTO(updated);
  } catch (error) {
    handleUnique(error);
  }
}

/** Arquiva o cliente. Bloqueado se houver pedido em aberto. */
export async function archiveCustomer(session: SessionPayload, id: string): Promise<void> {
  const existing = await prisma.customer.findUnique({
    where: { id },
    select: { id: true, sellerId: true },
  });
  if (!existing) throw notFound('Cliente');

  if (!isManagement(session) && existing.sellerId !== session.sellerId) {
    throw notFound('Cliente');
  }

  const openOrders = await prisma.order.count({
    where: { customerId: id, status: { in: ['novo', 'confirmado', 'em_producao'] } },
  });
  if (openOrders > 0) {
    throw conflict(`Este cliente tem ${openOrders} pedido(s) em aberto.`);
  }

  await prisma.customer.update({ where: { id }, data: { active: false } });
}

/** Clientes com coordenada, para o mapa. */
export async function customersWithLocation(
  session: SessionPayload,
): Promise<Array<{ id: string; tradeName: string; latitude: number; longitude: number; category: string | null }>> {
  const rows = await prisma.customer.findMany({
    where: {
      active: true,
      latitude: { not: null },
      longitude: { not: null },
      ...sellerScope(session),
    },
    select: { id: true, tradeName: true, latitude: true, longitude: true, category: true },
  });

  return rows as Array<{
    id: string;
    tradeName: string;
    latitude: number;
    longitude: number;
    category: string | null;
  }>;
}
