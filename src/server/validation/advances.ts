import { z } from 'zod';
import { isoDate, money, optionalText, optionalUuid } from './common';

export const advanceInputSchema = z.object({
  employeeId: optionalUuid('Funcionário'),
  sellerId: optionalUuid('Vendedor'),
  date: isoDate('Data do adiantamento'),
  amount: money('Valor do adiantamento'),
  reason: optionalText(500),
}).refine(
  (data) => Boolean(data.employeeId || data.sellerId),
  'Selecione um funcionário ou vendedor para o adiantamento.',
);

export type AdvanceInput = z.infer<typeof advanceInputSchema>;
