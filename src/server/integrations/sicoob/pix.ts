/**
 * Pix recebidos na conta, pela API Pix do Sicoob.
 *
 * ATENÇÃO: a forma exata da resposta (principalmente os dados de quem pagou) varia por
 * conta e deve ser CONFERIDA no portal developers.sicoob.com.br. Este adaptador lê o que
 * vier de forma defensiva; quando o banco não informa o nome, o sistema sugere só pelo valor.
 */
import { SicoobApiError, sicoobPix } from './client';

export interface BankPix {
  endToEndId: string;
  value: number;
  /** ISO 8601 */
  receivedAt: string;
  payerName: string | null;
  payerDocument: string | null;
  info: string | null;
}

interface RawPix {
  endToEndId?: string;
  txid?: string;
  valor?: string | number;
  horario?: string;
  infoPagador?: string;
  pagador?: { nome?: string; cpf?: string; cnpj?: string };
  nomePagador?: string;
  devolucoes?: Array<{ status?: string }>;
}

interface RawPage {
  parametros?: { paginacao?: { paginaAtual?: number; quantidadeDePaginas?: number } };
  pix?: RawPix[];
}

const digits = (v: string | undefined) => (v ? v.replace(/\D/g, '') : '');

export function parseBankPix(raw: RawPix): BankPix | null {
  const value = Number(String(raw.valor ?? '').replace(',', '.'));
  if (!raw.endToEndId || !(value > 0) || !raw.horario) return null;
  // Pix totalmente devolvido não é dinheiro na conta.
  if ((raw.devolucoes ?? []).some((d) => (d.status ?? '').toUpperCase() === 'DEVOLVIDO')) return null;
  const doc = digits(raw.pagador?.cpf) || digits(raw.pagador?.cnpj);
  return {
    endToEndId: raw.endToEndId,
    value,
    receivedAt: raw.horario,
    payerName: (raw.pagador?.nome ?? raw.nomePagador ?? '').trim() || null,
    payerDocument: doc.length === 11 || doc.length === 14 ? doc : null,
    info: raw.infoPagador?.trim() || null,
  };
}

/** RFC 3339 sem milissegundos (o formato que as APIs Pix do BACEN aceitam sem reclamar). */
const rfc3339 = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');

/** Resumo legível do corpo de erro do Sicoob (violações, detalhe ou título). */
export function sicoobErrorDetail(body: unknown): string | null {
  if (!body) return null;
  if (typeof body === 'string') return body.slice(0, 200) || null;
  if (typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  const viol = Array.isArray(b.violacoes) ? (b.violacoes[0] as Record<string, unknown> | undefined) : undefined;
  const pick = [viol?.razao, viol?.propriedade, b.detail, b.detalhe, b.title, b.mensagem, b.message, b.error_description]
    .find((v) => typeof v === 'string' && v.trim());
  return typeof pick === 'string' ? pick.slice(0, 200) : null;
}

export async function sicoobListPixReceived(from: Date, to: Date, scope?: string | null): Promise<BankPix[]> {
  // "fim" não pode estar no futuro para o banco (relógios diferentes): recua 1 minuto.
  const end = new Date(Math.min(to.getTime(), Date.now() - 60_000));
  try {
    return await listRange(from, end, scope);
  } catch (err) {
    // Se o banco recusar a janela inteira (400), tenta dia a dia.
    if (!(err instanceof SicoobApiError) || err.status !== 400) throw err;
    const out: BankPix[] = [];
    for (let t = from.getTime(); t < end.getTime(); t += 86_400_000) {
      out.push(...(await listRange(new Date(t), new Date(Math.min(t + 86_400_000 - 1000, end.getTime())), scope)));
    }
    return out;
  }
}

async function listRange(from: Date, to: Date, scope?: string | null): Promise<BankPix[]> {
  const out: BankPix[] = [];
  for (let page = 0; page < 20; page++) {
    const qs = new URLSearchParams({
      inicio: rfc3339(from),
      fim: rfc3339(to),
      'paginacao.paginaAtual': String(page),
    }).toString();
    const res = await sicoobPix<RawPage>(`/pix?${qs}`, scope);
    for (const raw of res.body?.pix ?? []) {
      const p = parseBankPix(raw);
      if (p) out.push(p);
    }
    const pag = res.body?.parametros?.paginacao;
    if (!pag || (pag.paginaAtual ?? page) + 1 >= (pag.quantidadeDePaginas ?? 1)) break;
  }
  return out;
}
