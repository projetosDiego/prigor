/**
 * Fronteira HTTP das rotas.
 *
 * Cada handler vira `route(async (req) => ...)`. O wrapper cuida de:
 *  - traduzir AppError e ZodError para resposta padronizada;
 *  - transformar qualquer exceção inesperada em 500 sem vazar detalhe interno;
 *  - registrar o erro com um traceId que também vai na resposta.
 *
 * Formato de erro (único em toda a API):
 *   { "error": { "code": "NOT_FOUND", "message": "...", "details"?: ..., "traceId"?: "..." } }
 *
 * O front antigo lia `detail` (herança do FastAPI); `message` é o campo novo e
 * `detail` é mantido como alias para não quebrar telas durante a transição.
 */
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

import { AppError, isAppError } from './errors';
import { logger, newTraceId } from './logger';

export interface ErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
    traceId?: string;
  };
  /** Alias de compatibilidade. */
  detail: string;
}

export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, { status: 200, ...init });
}

export function created<T>(data: T): NextResponse {
  return NextResponse.json(data, { status: 201 });
}

export function noContent(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

export function errorResponse(
  status: number,
  code: string,
  message: string,
  details?: unknown,
  traceId?: string,
): NextResponse {
  const body: ErrorBody = {
    error: { code, message, ...(details !== undefined ? { details } : {}), ...(traceId ? { traceId } : {}) },
    detail: message,
  };
  return NextResponse.json(body, { status });
}

function zodDetails(error: ZodError): Array<{ field: string; message: string }> {
  return error.issues.map((issue) => ({
    field: issue.path.join('.') || '(raiz)',
    message: issue.message,
  }));
}

export function toErrorResponse(error: unknown, route: string): NextResponse {
  if (error instanceof ZodError) {
    return errorResponse(422, 'VALIDATION_ERROR', 'Dados inválidos.', zodDetails(error));
  }

  if (isAppError(error)) {
    // 5xx de aplicação ainda merece log; 4xx é comportamento esperado.
    if (error.status >= 500) {
      logger.error('erro de aplicação', { route, code: error.code, message: error.message });
    }
    return errorResponse(error.status, error.code, error.message, error.details);
  }

  const traceId = newTraceId();
  logger.error('erro não tratado', {
    route,
    traceId,
    error: error instanceof Error ? error : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });

  return errorResponse(
    500,
    'INTERNAL',
    `Erro interno no servidor. Se o problema persistir, informe o código ${traceId}.`,
    undefined,
    traceId,
  );
}

type Handler<Ctx> = (request: Request, context: Ctx) => Promise<NextResponse> | NextResponse;

/**
 * Envolve um handler de rota com tratamento de erro uniforme.
 * `name` aparece no log para localizar a origem.
 */
export function route<Ctx = unknown>(name: string, handler: Handler<Ctx>): Handler<Ctx> {
  return async (request: Request, context: Ctx) => {
    const startedAt = Date.now();
    try {
      const response = await handler(request, context);
      logger.debug('requisição concluída', {
        route: name,
        method: request.method,
        status: response.status,
        ms: Date.now() - startedAt,
      });
      return response;
    } catch (error) {
      return toErrorResponse(error, name);
    }
  };
}

/** Lê o corpo JSON com erro amigável quando o payload não é JSON válido. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new AppError(400, 'BAD_REQUEST', 'Corpo da requisição não é um JSON válido.');
  }
}
