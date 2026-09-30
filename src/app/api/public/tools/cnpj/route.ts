import { badRequest, notFound } from '@/server/http/errors';
import { ok, route } from '@/server/http/respond';

const TIMEOUT_MS = 6000;

function text(value: unknown): string {
  return typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '';
}

async function fetchJson(url: string): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export const GET = route('public.tools.cnpj', async (request) => {
  const { searchParams } = new URL(request.url);
  const rawCnpj = searchParams.get('cnpj') || '';
  const cnpj = rawCnpj.replace(/\D/g, '');

  if (cnpj.length !== 14) {
    throw badRequest('CNPJ deve conter exatamente 14 dígitos.');
  }

  // 1. ReceitaWS
  const rws = await fetchJson(`https://receitaws.com.br/v1/cnpj/${cnpj}`);
  if (rws && rws.status !== 'ERROR' && text(rws.nome)) {
    return ok({
      cnpj,
      razao_social: text(rws.nome),
      nome_fantasia: text(rws.fantasia) || text(rws.nome),
      logradouro: text(rws.logradouro),
      numero: text(rws.numero),
      complemento: text(rws.complemento),
      bairro: text(rws.bairro),
      municipio: text(rws.municipio),
      uf: text(rws.uf),
      cep: text(rws.cep).replace(/\D/g, ''),
      // Regra de ouro do usuário: NUNCA preencher telefone automaticamente
    });
  }

  // 2. BrasilAPI
  const bapi = await fetchJson(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
  if (bapi && text(bapi.razao_social)) {
    return ok({
      cnpj,
      razao_social: text(bapi.razao_social),
      nome_fantasia: text(bapi.nome_fantasia) || text(bapi.razao_social),
      logradouro: text(bapi.logradouro),
      numero: text(bapi.numero),
      complemento: text(bapi.complemento),
      bairro: text(bapi.bairro),
      municipio: text(bapi.municipio),
      uf: text(bapi.uf),
      cep: text(bapi.cep).replace(/\D/g, ''),
    });
  }

  // 3. Minha Receita
  const mr = await fetchJson(`https://minhareceita.org/${cnpj}`);
  if (mr && text(mr.razao_social)) {
    return ok({
      cnpj,
      razao_social: text(mr.razao_social),
      nome_fantasia: text(mr.nome_fantasia) || text(mr.razao_social),
      logradouro: [text(mr.descricao_tipo_de_logradouro), text(mr.logradouro)].filter(Boolean).join(' '),
      numero: text(mr.numero),
      complemento: text(mr.complemento),
      bairro: text(mr.bairro),
      municipio: text(mr.municipio),
      uf: text(mr.uf),
      cep: text(mr.cep).replace(/\D/g, ''),
    });
  }

  throw notFound('CNPJ não localizado nas bases públicas. Preencha os dados manualmente.');
});
