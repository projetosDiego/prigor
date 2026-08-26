/**
 * Blocos de validação reutilizáveis.
 *
 * Nenhuma rota lê `request.json()` direto: tudo passa por um schema. Antes,
 * 17 rotas confiavam no corpo cru, o que permitia gravar valor negativo,
 * string onde se esperava número e campos inexistentes.
 */
import { z } from 'zod';

/** Texto obrigatório, sem espaço sobrando. */
export const requiredText = (label: string, max = 255) =>
  z
    .string({ message: `${label} é obrigatório.` })
    .trim()
    .min(1, `${label} é obrigatório.`)
    .max(max, `${label} deve ter no máximo ${max} caracteres.`);

/** Texto opcional: string vazia vira `null`. */
export const optionalText = (max = 255) =>
  z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => {
      if (v === null || v === undefined) return null;
      const trimmed = v.trim();
      return trimmed === '' ? null : trimmed;
    })
    .refine((v) => v === null || v.length <= max, `Deve ter no máximo ${max} caracteres.`);

/**
 * Valor monetário. Aceita number ou string e devolve string, que é o formato
 * que o Prisma grava em coluna Decimal sem perder precisão.
 */
export const money = (label: string, opts: { min?: number; allowNegative?: boolean } = {}) =>
  z
    .union([z.number(), z.string()])
    .transform((v, ctx) => {
      const parsed = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
      if (!Number.isFinite(parsed)) {
        ctx.addIssue({ code: 'custom', message: `${label} deve ser um número.` });
        return z.NEVER;
      }
      if (!opts.allowNegative && parsed < 0) {
        ctx.addIssue({ code: 'custom', message: `${label} não pode ser negativo.` });
        return z.NEVER;
      }
      if (opts.min !== undefined && parsed < opts.min) {
        ctx.addIssue({ code: 'custom', message: `${label} deve ser no mínimo ${opts.min}.` });
        return z.NEVER;
      }
      if (Math.abs(parsed) > 9_999_999_999) {
        ctx.addIssue({ code: 'custom', message: `${label} excede o limite permitido.` });
        return z.NEVER;
      }
      return parsed.toFixed(2);
    });

/** Quantidade: até 3 casas decimais. */
export const quantity = (label: string, opts: { min?: number } = {}) =>
  z
    .union([z.number(), z.string()])
    .transform((v, ctx) => {
      const parsed = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
      if (!Number.isFinite(parsed)) {
        ctx.addIssue({ code: 'custom', message: `${label} deve ser um número.` });
        return z.NEVER;
      }
      const min = opts.min ?? 0;
      if (parsed < min) {
        ctx.addIssue({ code: 'custom', message: `${label} deve ser no mínimo ${min}.` });
        return z.NEVER;
      }
      if (parsed > 9_999_999) {
        ctx.addIssue({ code: 'custom', message: `${label} excede o limite permitido.` });
        return z.NEVER;
      }
      return parsed.toFixed(3);
    });

/** Percentual de 0 a 100. */
export const percent = (label: string) =>
  z
    .union([z.number(), z.string()])
    .transform((v, ctx) => {
      const parsed = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
        ctx.addIssue({ code: 'custom', message: `${label} deve estar entre 0 e 100.` });
        return z.NEVER;
      }
      return parsed.toFixed(2);
    });

/** Data no formato YYYY-MM-DD, tratada como data civil (sem fuso). */
export const isoDate = (label: string) =>
  z
    .string({ message: `${label} é obrigatória.` })
    .regex(/^\d{4}-\d{2}-\d{2}$/, `${label} deve estar no formato AAAA-MM-DD.`)
    .transform((v, ctx) => {
      const date = new Date(`${v}T00:00:00.000Z`);
      if (Number.isNaN(date.getTime())) {
        ctx.addIssue({ code: 'custom', message: `${label} não é uma data válida.` });
        return z.NEVER;
      }
      return date;
    });

export const optionalIsoDate = (label: string) =>
  z
    .union([z.string(), z.null()])
    .optional()
    .transform((v, ctx) => {
      if (v === null || v === undefined || v === '') return null;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) {
        ctx.addIssue({ code: 'custom', message: `${label} deve estar no formato AAAA-MM-DD.` });
        return z.NEVER;
      }
      const date = new Date(`${v}T00:00:00.000Z`);
      if (Number.isNaN(date.getTime())) {
        ctx.addIssue({ code: 'custom', message: `${label} não é uma data válida.` });
        return z.NEVER;
      }
      return date;
    });

export const uuid = (label: string) =>
  z.string({ message: `${label} é obrigatório.` }).uuid(`${label} inválido.`);

/** Aceita ausência, `null` e string vazia — a UI manda `''` para desatribuir. */
export const optionalUuid = (label: string) =>
  z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => (v === undefined || v === null || v.trim() === '' ? null : v.trim()))
    .refine(
      (v) => v === null || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v),
      `${label} inválido.`,
    );

export const email = () =>
  z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => (v === null || v === undefined || v.trim() === '' ? null : v.trim().toLowerCase()))
    .refine(
      (v) => v === null || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v),
      'E-mail inválido.',
    );

/** Só dígitos; devolve `null` quando vazio. */
export const digits = (label: string, { length }: { length?: number[] } = {}) =>
  z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => {
      if (v === null || v === undefined) return null;
      const only = v.replace(/\D/g, '');
      return only === '' ? null : only;
    })
    .refine(
      (v) => v === null || !length || length.includes(v.length),
      `${label} inválido.`,
    );

/** Paginação padronizada em toda a API. */
export const pagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export type Pagination = z.infer<typeof pagination>;

export function paginationToPrisma(input: Pagination): { skip: number; take: number } {
  return { skip: (input.page - 1) * input.pageSize, take: input.pageSize };
}

/** Lê e valida a query string de uma requisição. */
export function parseQuery<T extends z.ZodType>(request: Request, schema: T): z.infer<T> {
  const params = Object.fromEntries(new URL(request.url).searchParams.entries());
  return schema.parse(params);
}

/** Trata `"true"`/`"false"` vindos de query string. */
export const booleanFlag = (defaultValue: boolean) =>
  z
    .union([z.string(), z.boolean()])
    .optional()
    .transform((v) => {
      if (v === undefined) return defaultValue;
      if (typeof v === 'boolean') return v;
      return v.toLowerCase() === 'true';
    });
