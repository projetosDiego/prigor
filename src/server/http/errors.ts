/**
 * Erros de aplicação.
 *
 * Toda falha esperada vira um `AppError` com status e código. O handler HTTP
 * traduz para resposta; nada além disso chega ao cliente. Erro inesperado vira
 * 500 genérico com um `traceId` — a mensagem original fica só no log do
 * servidor, nunca na resposta.
 */

export type ErrorCode =
  | 'BAD_REQUEST'
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'UNPROCESSABLE'
  | 'RATE_LIMITED'
  | 'INTERNAL';

export class AppError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details?: unknown;

  constructor(status: number, code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message: string, details?: unknown): AppError =>
  new AppError(400, 'BAD_REQUEST', message, details);

export const validationError = (message: string, details?: unknown): AppError =>
  new AppError(422, 'VALIDATION_ERROR', message, details);

export const unauthorized = (message = 'Sessão expirada ou inválida.'): AppError =>
  new AppError(401, 'UNAUTHORIZED', message);

export const forbidden = (message = 'Você não tem permissão para esta ação.'): AppError =>
  new AppError(403, 'FORBIDDEN', message);

export const notFound = (resource: string): AppError =>
  new AppError(404, 'NOT_FOUND', `${resource} não encontrado.`);

export const conflict = (message: string, details?: unknown): AppError =>
  new AppError(409, 'CONFLICT', message, details);

export const rateLimited = (message = 'Muitas tentativas. Tente novamente em instantes.'): AppError =>
  new AppError(429, 'RATE_LIMITED', message);

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
