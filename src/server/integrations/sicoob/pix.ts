/**
 * Pix recebidos na conta, pela API Pix do Sicoob.
 *
 * ATENÇÃO: a forma exata da resposta (principalmente os dados de quem pagou) varia por
 * conta e deve ser CONFERIDA no portal developers.sicoob.com.br. Este adaptador lê o que
 * vier de forma defensiva; quando o banco não informa o nome, o sistema sugere só pelo valor.
 */
import { sicoobPix } from './client';

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

export async function sicoobListPixReceived(from: Date, to: Date, scope?: string | null): Promise<BankPix[]> {
  const out: BankPix[] = [];
  for (let page = 0; page < 20; page++) {
    const qs = new URLSearchParams({
      inicio: from.toISOString(),
      fim: to.toISOString(),
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
