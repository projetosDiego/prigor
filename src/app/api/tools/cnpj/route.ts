/**
 * Consulta de CNPJ com três bases públicas em cascata.
 *
 * Cada tentativa tem prazo próprio; o CNPJ consultado nunca vai para o log
 * (o `logger` o redige de qualquer forma) e nenhuma mensagem das bases
 * externas é repassada ao cliente — só a nossa.
 */
import { requireUser } from '@/server/auth/guard';
import { notFound } from '@/server/http/errors';
import { logger } from '@/server/http/logger';
import { ok, route } from '@/server/http/respond';
import { parseQuery } from '@/server/validation/common';
import { cnpjQuerySchema } from '@/server/validation/crm';

const TIMEOUT_MS = 5000;

interface NormalizedCnpj {
  cnpj: string;
  razao_social: string;
  nome_fantasia: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  municipio: string;
  uf: string;
  cep: string;
  ddd_telefone_1: string;
}

type RawCnpj = Record<string, unknown>;

function text(value: unknown): string {
  return typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '';
}

async function fetchJson(url: string, revalidate?: number): Promise<RawCnpj | null> {
  const response = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    ...(revalidate ? { next: { revalidate } } : {}),
  });
  if (!response.ok) return null;
  return (await response.json()) as RawCnpj;
}

interface Source {
  name: string;
  url: (cnpj: string) => string;
  revalidate?: number;
  normalize: (json: RawCnpj, cnpj: string) => NormalizedCnpj | null;
}

const SOURCES: Source[] = [
  {
    // Estável e boa com endereços; é a primeira a ser tentada.
    name: 'ReceitaWS',
    url: (cnpj) => `https://receitaws.com.br/v1/cnpj/${cnpj}`,
    revalidate: 3600,
    normalize: (json, cnpj) => {
      if (json.status === 'ERROR' || !text(json.nome)) return null;
      return {
        cnpj,
        razao_social: text(json.nome),
        nome_fantasia: text(json.fantasia) || text(json.nome),
        logradouro: text(json.logradouro),
        numero: text(json.numero),
        complemento: text(json.complemento),
        bairro: text(json.bairro),
        municipio: text(json.municipio),
        uf: text(json.uf),
        cep: text(json.cep).replace(/\D/g, ''),
        ddd_telefone_1: text(json.telefone),
      };
    },
  },
  {
    name: 'BrasilAPI',
    url: (cnpj) => `https://brasilapi.com.br/api/cnpj/v1/${cnpj}`,
    revalidate: 3600,
    normalize: (json, cnpj) => {
      if (!text(json.razao_social)) return null;
      return {
        cnpj,
        razao_social: text(json.razao_social),
        nome_fantasia: text(json.nome_fantasia) || text(json.razao_social),
        logradouro: text(json.logradouro),
        numero: text(json.numero),
        complemento: text(json.complemento),
        bairro: text(json.bairro),
        municipio: text(json.municipio),
        uf: text(json.uf),
        cep: text(json.cep).replace(/\D/g, ''),
        ddd_telefone_1: text(json.ddd_telefone_1),
      };
    },
  },
  {
    name: 'Minha Receita',
    url: (cnpj) => `https://minhareceita.org/${cnpj}`,
    normalize: (json, cnpj) => {
      if (!text(json.razao_social)) return null;
      return {
        cnpj,
        razao_social: text(json.razao_social),
        nome_fantasia: text(json.nome_fantasia) || text(json.razao_social),
        logradouro: text(json.logradouro),
        numero: text(json.numero),
        complemento: text(json.complemento),
        bairro: text(json.bairro),
        municipio: text(json.municipio),
        uf: text(json.uf),
        cep: text(json.cep).replace(/\D/g, ''),
        ddd_telefone_1: text(json.ddd_telefone_1),
      };
    },
  },
];

export const GET = route('ferramentas.cnpj', async (request) => {
  await requireUser();
  const { cnpj } = parseQuery(request, cnpjQuerySchema);

  for (const source of SOURCES) {
    try {
      const json = await fetchJson(source.url(cnpj), source.revalidate);
      if (!json) {
        logger.debug('base de CNPJ respondeu com erro', {
          route: 'ferramentas.cnpj',
          source: source.name,
        });
        continue;
      }

      const normalized = source.normalize(json, cnpj);
      if (normalized) {
        return ok({ success: true, source: source.name, ...normalized });
      }
    } catch (error) {
      logger.debug('base de CNPJ indisponível', {
        route: 'ferramentas.cnpj',
        source: source.name,
        error,
      });
    }
  }

  throw notFound('CNPJ');
});
