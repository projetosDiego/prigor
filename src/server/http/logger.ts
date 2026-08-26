/**
 * Log estruturado.
 *
 * Uma linha JSON por evento, para que a saída do container seja consultável
 * (`docker logs | jq`). Substitui os `console.log` soltos do código anterior,
 * que despejavam token e payload de cliente no stdout.
 *
 * Nenhum campo sensível é logado: há uma lista de chaves que sempre saem
 * redigidas, aplicada recursivamente.
 */

type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const MIN_LEVEL: Level =
  (process.env.LOG_LEVEL as Level | undefined) ??
  (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

const REDACTED = '[redigido]';

const SENSITIVE_KEYS = new Set([
  'password',
  'senha',
  'passwordhash',
  'senha_hash',
  'token',
  'accesstoken',
  'access_token',
  'authorization',
  'cookie',
  'session',
  'jwt',
  'jwt_secret',
  'secret',
  'apikey',
  'api_key',
  'google_maps_api_key',
  'cpf',
  'cnpj',
]);

function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[profundo demais]';
  if (value === null || value === undefined) return value;
  if (value instanceof Error) return { name: value.name, message: value.message };
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));

  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE_KEYS.has(key.toLowerCase()) ? REDACTED : redact(val, depth + 1);
    }
    return out;
  }

  return value;
}

function emit(level: Level, message: string, context?: Record<string, unknown>): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[MIN_LEVEL]) return;

  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...(context ? (redact(context) as Record<string, unknown>) : {}),
  });

  if (level === 'error') process.stderr.write(`${line}\n`);
  else process.stdout.write(`${line}\n`);
}

export const logger = {
  debug: (message: string, context?: Record<string, unknown>) => emit('debug', message, context),
  info: (message: string, context?: Record<string, unknown>) => emit('info', message, context),
  warn: (message: string, context?: Record<string, unknown>) => emit('warn', message, context),
  error: (message: string, context?: Record<string, unknown>) => emit('error', message, context),
};

/** Identificador curto para correlacionar log e resposta de erro. */
export function newTraceId(): string {
  return globalThis.crypto?.randomUUID?.().slice(0, 8) ?? Math.random().toString(36).slice(2, 10);
}
