/**
 * HTTP para integrações externas, com suporte a certificado cliente (mTLS).
 *
 * Usa `node:https` em vez do `fetch` global porque o fetch do Node não aceita
 * certificado `.pfx` sem dependência extra. Toda chamada tem timeout e devolve
 * status + corpo já interpretado; quem decide o que é erro é o adapter.
 */
import https from 'node:https';

export interface HttpRequest {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  headers?: Record<string, string>;
  /** Objeto vira JSON; string vai como está (ex.: form-urlencoded). */
  body?: unknown;
  /** Certificado cliente (mTLS). */
  pfx?: Buffer;
  passphrase?: string;
  timeoutMs?: number;
}

export interface HttpResponse<T = unknown> {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: T;
  rawBody: string;
  /** Corpo cru em bytes — use para PDF e outros binários. */
  buffer: Buffer;
}

export class IntegrationHttpError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly responseBody?: string,
  ) {
    super(message);
    this.name = 'IntegrationHttpError';
  }
}

export function httpRequest<T = unknown>(req: HttpRequest): Promise<HttpResponse<T>> {
  const url = new URL(req.url);
  const isString = typeof req.body === 'string';
  const payload = req.body === undefined ? undefined : isString ? (req.body as string) : JSON.stringify(req.body);

  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(payload !== undefined && !isString ? { 'Content-Type': 'application/json' } : {}),
    ...req.headers,
  };
  if (payload !== undefined) headers['Content-Length'] = String(Buffer.byteLength(payload));

  return new Promise((resolve, reject) => {
    const request = https.request(
      {
        method: req.method,
        hostname: url.hostname,
        port: url.port || 443,
        path: `${url.pathname}${url.search}`,
        headers,
        pfx: req.pfx,
        passphrase: req.passphrase,
        timeout: req.timeoutMs ?? 20_000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          const rawBody = buffer.toString('utf8');
          let body: unknown = rawBody;
          if (rawBody && String(res.headers['content-type'] ?? '').includes('json')) {
            try {
              body = JSON.parse(rawBody);
            } catch {
              body = rawBody;
            }
          }
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body: body as T, rawBody, buffer });
        });
      },
    );
    request.on('timeout', () => request.destroy(new IntegrationHttpError(`Tempo esgotado ao chamar ${url.hostname}.`, null)));
    request.on('error', (err) =>
      reject(err instanceof IntegrationHttpError ? err : new IntegrationHttpError(`Falha de conexão com ${url.hostname}: ${err.message}`, null)),
    );
    if (payload !== undefined) request.write(payload);
    request.end();
  });
}
