/**
 * Usuários administrativos (ADMIN e MANAGER).
 *
 * Usuários de vendedor (role SELLER) são geridos na tela de Vendedores — aqui
 * eles não aparecem e não podem ser criados. Há uma trava para não desativar
 * nem rebaixar o último administrador ativo, o que trancaria o sistema.
 */
import { z } from 'zod';

import { prisma, prismaErrorCode, UNIQUE_VIOLATION } from '../db';
import { badRequest, conflict, notFound } from '../http/errors';
import { hashPassword } from '../auth/password';
import { timestamp } from './serializers';
import type { userInputSchema, userUpdateSchema } from '../validation/access';

export interface UserDTO {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  active: boolean;
  createdAt: string | null;
}

interface Row {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  active: boolean;
  createdAt: Date;
}

function toDTO(r: Row): UserDTO {
  return { id: r.id, name: r.name, email: r.email, phone: r.phone, role: r.role, active: r.active, createdAt: timestamp(r.createdAt) };
}

export async function listManagementUsers(): Promise<UserDTO[]> {
  const rows = await prisma.user.findMany({
    where: { role: { in: ['ADMIN', 'MANAGER'] } },
    orderBy: [{ role: 'asc' }, { name: 'asc' }],
  });
  return rows.map(toDTO);
}

export async function createUser(
  input: z.infer<typeof userInputSchema> & { password: string },
): Promise<UserDTO> {
  if (!input.email) throw badRequest('E-mail é obrigatório para criar um usuário.');
  try {
    const user = await prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        phone: input.phone,
        role: input.role,
        active: input.active,
        passwordHash: await hashPassword(input.password),
      },
    });
    return toDTO(user);
  } catch (error) {
    if (prismaErrorCode(error) === UNIQUE_VIOLATION) throw conflict('Já existe um usuário com esse e-mail.');
    throw error;
  }
}

export async function updateUser(
  id: string,
  currentUserId: string,
  input: z.infer<typeof userUpdateSchema> & { password?: string },
): Promise<UserDTO> {
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) throw notFound('Usuário');
  if (existing.role === 'SELLER') throw badRequest('Este login é de um vendedor; edite pela tela de Vendedores.');

  const demoting = (input.role !== undefined && input.role !== 'ADMIN') || input.active === false;
  if (existing.role === 'ADMIN' && demoting) {
    const admins = await prisma.user.count({ where: { role: 'ADMIN', active: true } });
    if (admins <= 1) throw conflict('Não é possível rebaixar ou desativar o último administrador ativo.');
  }

  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.email !== undefined && input.email !== null) data.email = input.email;
  if (input.phone !== undefined) data.phone = input.phone;
  if (input.role !== undefined) data.role = input.role;
  if (input.active !== undefined) data.active = input.active;
  if (input.password) data.passwordHash = await hashPassword(input.password);

  try {
    return toDTO(await prisma.user.update({ where: { id }, data }));
  } catch (error) {
    if (prismaErrorCode(error) === UNIQUE_VIOLATION) throw conflict('Já existe um usuário com esse e-mail.');
    throw error;
  }
}

export async function deactivateUser(id: string, currentUserId: string): Promise<void> {
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) throw notFound('Usuário');
  if (existing.role === 'SELLER') throw badRequest('Login de vendedor — use a tela de Vendedores.');
  if (id === currentUserId) throw conflict('Você não pode desativar o seu próprio usuário.');
  if (existing.role === 'ADMIN') {
    const admins = await prisma.user.count({ where: { role: 'ADMIN', active: true } });
    if (admins <= 1) throw conflict('Não é possível desativar o último administrador ativo.');
  }
  await prisma.user.update({ where: { id }, data: { active: false } });
}
