/**
 * Tratamento de erro no lado do cliente.
 *
 * A API devolve sempre o mesmo formato:
 *   { error: { code, message, details? }, detail }
 *
 * Ler `payload.error` direto colocava "[object Object]" na tela, porque
 * `error` é um objeto, não uma string. Estas funções são o único caminho
 * autorizado para transformar uma resposta de erro em texto para o usuário.
 */

interface ApiErrorPayload {
  error?: { code?: string; message?: string; details?: unknown } | string | null;
  detail?: string | null;
}

/** Mensagem de uma resposta de erro da API. */
export function apiErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') return fallback;

  const body = payload as ApiErrorPayload;

  if (typeof body.error === 'string' && body.error.trim()) return body.error;
  if (body.error && typeof body.error === 'object' && typeof body.error.message === 'string') {
    return body.error.message;
  }
  if (typeof body.detail === 'string' && body.detail.trim()) return body.detail;

  return fallback;
}

/**
 * Mensagem do valor capturado em `catch`.
 * O `catch` entrega `unknown`: nem tudo que é lançado é um `Error`.
 */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Ocorreu um erro inesperado.';
}

/**
 * Lê a mensagem de erro de uma `Response` que falhou.
 * Substitui as oito cópias locais que existiam nas telas do ERP.
 */
export async function responseErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    return apiErrorMessage(await res.json(), fallback);
  } catch {
    return fallback;
  }
}
