/**
 * Schemas do módulo Custos & Equipe (funcionários e faltas).
 */
import { z } from 'zod';

import { isoDate, money, optionalText, requiredText } from './common';

export const employeeInputSchema = z.object({
  name: requiredText('Nome', 120),
  role: optionalText(80),
  payType: z.enum(['diarista', 'mensalista']),
  dailyRate: money('Valor da diária').default('0.00'),
  monthlySalary: money('Salário mensal').default('0.00'),
  transportPerDay: money('Passagem por dia').default('0.00'),
  // CSV de dias da semana: 0=domingo ... 6=sábado. Ex.: "1,3,5"
  workDays: z
    .string()
    .regex(/^(?:[0-6](?:,[0-6])*)?$/, 'Dias da semana inválidos')
    .default(''),
  active: z.boolean().default(true),
});

export type EmployeeInput = z.infer<typeof employeeInputSchema>;

export const employeeUpdateSchema = employeeInputSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nada para atualizar.');

export const absenceInputSchema = z.object({
  date: isoDate('Data'),
  note: optionalText(200),
});

export type AbsenceInput = z.infer<typeof absenceInputSchema>;
