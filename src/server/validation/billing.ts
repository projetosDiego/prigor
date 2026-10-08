/**
 * Validação da configuração fiscal (emitente) e dos padrões de faturamento.
 * Todos os campos são opcionais: a tela salva parcial e a conferência de
 * "pronto para emitir" é feita no domínio (`invoiceReadinessProblems`).
 */
import { z } from 'zod';

import { digits, email, money, optionalText, partialWithoutDefaults, percent } from './common';

const cfop = (label: string) =>
  digits(label, { length: [4] }).refine((v) => v === null || /^[567]/.test(v), `${label} deve começar com 5, 6 ou 7.`);

export const fiscalSettingsSchema = z.object({
  cnpj: digits('CNPJ', { length: [14] }),
  ie: optionalText(20),
  legalName: optionalText(200),
  tradeName: optionalText(200),
  crt: z.coerce.number().int().min(1).max(4).default(4),
  address: optionalText(255),
  number: optionalText(20),
  complement: optionalText(120),
  neighborhood: optionalText(120),
  city: optionalText(120),
  cityIbgeCode: digits('Código IBGE da cidade', { length: [7] }),
  state: optionalText(2).transform((v) => (v ? v.toUpperCase() : v)),
  zipCode: digits('CEP', { length: [8] }),
  phone: optionalText(40),
  email: email(),
  nfeSeries: z.coerce.number().int().min(0).max(999).default(1),
  nfeEnvironment: z.enum(['homologacao', 'producao']).default('homologacao'),
  defaultCfopInState: cfop('CFOP estadual'),
  defaultCfopOutState: cfop('CFOP interestadual'),
  defaultCsosn: digits('CSOSN', { length: [3] }),
  invoiceForConsumers: z.boolean().default(false),
  invoiceMessage: optionalText(500),
  boletoInstructions: optionalText(400),
  boletoFinePct: z.union([percent('Multa'), z.null()]).optional(),
  boletoInterestPct: z.union([percent('Juros ao mês'), z.null()]).optional(),
});

/** PUT parcial: campo ausente não é tocado (sem defaults). */
export const fiscalSettingsUpdateSchema = partialWithoutDefaults(fiscalSettingsSchema);

export type FiscalSettingsUpdate = z.infer<typeof fiscalSettingsUpdateSchema>;

// ─── Empresas emissoras (vários CNPJs) ──────────────────────────────────────

export const issuerSchema = z.object({
  name: z.string().trim().min(1, 'Informe um apelido para a empresa.').max(40),
  legalName: z.string().trim().min(2, 'Informe a razão social.').max(200),
  tradeName: optionalText(200),
  cnpj: digits('CNPJ', { length: [14] }).refine((v) => v !== null, 'Informe o CNPJ.'),
  ie: optionalText(20),
  address: optionalText(255),
  number: optionalText(20),
  complement: optionalText(120),
  neighborhood: optionalText(120),
  city: optionalText(120),
  cityIbgeCode: digits('Código IBGE da cidade', { length: [7] }),
  state: optionalText(2).transform((v) => (v ? v.toUpperCase() : v)),
  zipCode: digits('CEP', { length: [8] }),
  phone: optionalText(40),
  email: email(),
  /** '' = empresa principal (variáveis sem prefixo). Demais: EMPRESA_<PREFIXO>_... */
  configPrefix: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{0,20}$/, 'Prefixo: só letras e números, sem espaço (ex.: PRISCILLA).')
    .default(''),
  isDefault: z.boolean().default(false),
  active: z.boolean().default(true),
  annualLimit: money('Limite anual', { min: 0 }).default('81000.00'),
});

export const issuerUpdateSchema = partialWithoutDefaults(issuerSchema);

export type IssuerInput = z.infer<typeof issuerSchema>;
export type IssuerUpdate = z.infer<typeof issuerUpdateSchema>;
