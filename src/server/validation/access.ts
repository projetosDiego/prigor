/**
 * Schemas de acesso (usuários administrativos).
 */
import { z } from 'zod';

import { email, optionalText, requiredText } from './common';

export const userRoleSchema = z.enum(['ADMIN', 'MANAGER']);

export const userInputSchema = z.object({
  name: requiredText('Nome', 120),
  email: email(),
  phone: optionalText(40),
  role: userRoleSchema.default('MANAGER'),
  active: z.boolean().default(true),
});

export const userUpdateSchema = userInputSchema.partial().refine(
  (v) => Object.keys(v).length > 0,
  'Nada para atualizar.',
);
