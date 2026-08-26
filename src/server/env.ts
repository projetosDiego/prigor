/**
 * Configuração validada.
 *
 * O sistema falha no boot se estiver mal configurado, em vez de descobrir em
 * produção que o `JWT_SECRET` estava vazio e todo mundo estava usando o
 * fallback de desenvolvimento — que era exatamente o comportamento anterior.
 *
 * Este módulo é seguro para o runtime edge (usado pelo proxy): só lê
 * `process.env` e valida strings, sem importar nada de Node.
 */
import { z } from 'zod';

const isProduction = process.env.NODE_ENV === 'production';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatória.'),
  DIRECT_URL: z.string().optional(),

  // 32 caracteres é o mínimo defensável para HS256. Em produção não há default.
  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET precisa de pelo menos 32 caracteres.'),

  SESSION_TTL_HOURS: z.coerce.number().int().positive().max(24 * 30).default(12),

  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),

  GOOGLE_MAPS_API_KEY: z.string().default(''),
  ALLOW_MOCK_PLACES: z
    .string()
    .default('false')
    .transform((v) => v.toLowerCase() === 'true'),

  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).optional(),

  /** Tentativas de login por janela, por IP. */
  LOGIN_RATE_LIMIT: z.coerce.number().int().positive().default(10),
  LOGIN_RATE_WINDOW_SECONDS: z.coerce.number().int().positive().default(300),

  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),
});

export type Env = z.infer<typeof schema>;

function load(): Env {
  const parsed = schema.safeParse(process.env);

  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');

    // Em produção isso derruba o processo de propósito: subir mal configurado
    // é pior do que não subir.
    throw new Error(`Configuração inválida:\n${problems}`);
  }

  const env = parsed.data;

  if (isProduction) {
    if (env.ALLOW_MOCK_PLACES) {
      throw new Error(
        'ALLOW_MOCK_PLACES não pode ficar ligado em produção: geraria leads fictícios no banco real.',
      );
    }
    if (!env.GOOGLE_MAPS_API_KEY || env.GOOGLE_MAPS_API_KEY.includes('Mock')) {
      throw new Error('GOOGLE_MAPS_API_KEY ausente ou de desenvolvimento em produção.');
    }
  }

  return env;
}

let cached: Env | null = null;

export function env(): Env {
  if (!cached) cached = load();
  return cached;
}

export const isProd = isProduction;
