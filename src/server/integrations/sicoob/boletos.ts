/**
 * API de Cobrança Bancária v3 do Sicoob — boletos.
 *
 * Duas partes:
 *  - funções PURAS que montam o corpo das chamadas e interpretam as respostas
 *    (testadas em tests/integrations/sicoob-boletos.test.ts);
 *  - funções que chamam a API (via `sicoobCobranca`).
 *
 * Campos e caminhos seguem a documentação do portal developers.sicoob.com.br
 * e integrações públicas (ACBr, SDKs). Itens marcados com CONFERIR devem ser
 * validados no primeiro boleto real (fase 2 → teste de ponta a ponta).
 */
import { sicoobAccount, sicoobCobranca } from './client';

// ─── Tipos de entrada (dados simples, sem Prisma) ───────────────────────────

export interface BoletoPayer {
  document: string; // CPF ou CNPJ, só dígitos
  name: string;
  address: string; // rua + número + complemento
  neighborhood: string;
  city: string;
  zipCode: string; // 8 dígitos
  state: string; // UF
  email?: string | null;
}

export interface BoletoIssueInput {
  seuNumero: string;
  orderNumber: number;
  value: string; // decimal em string, 2 casas
  issueDate: string; // YYYY-MM-DD
  dueDate: string; // YYYY-MM-DD
  payer: BoletoPayer;
  finePct?: string | null; // multa % (após o vencimento)
  interestMonthPct?: string | null; // juros % ao mês
  instructions?: string[];
}

export interface BoletoAccount {
  numeroCliente: number;
  codigoModalidade: number;
  numeroContaCorrente: number;
}

const onlyDigits = (v: string) => v.replace(/\D/g, '');
const cut = (v: string, max: number) => v.trim().slice(0, max);

function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/** Corpo do POST /boletos. Pura. */
export function buildBoletoPayload(input: BoletoIssueInput, account: BoletoAccount): Record<string, unknown> {
  const fine = Number(input.finePct ?? 0);
  const interest = Number(input.interestMonthPct ?? 0);
  const dayAfterDue = addDays(input.dueDate, 1);
  const instructions = (input.instructions ?? []).map((m) => cut(m, 40)).filter(Boolean).slice(0, 5);

  return {
    numeroCliente: account.numeroCliente,
    codigoModalidade: account.codigoModalidade,
    numeroContaCorrente: account.numeroContaCorrente,
    codigoEspecieDocumento: 'DM', // duplicata mercantil (venda de mercadoria)
    dataEmissao: input.issueDate,
    seuNumero: input.seuNumero,
    identificacaoBoletoEmpresa: `PEDIDO-${input.orderNumber}`,
    identificacaoEmissaoBoleto: 2, // 2 = cliente emite ("Cedente" no Sicoobnet, confirmado)
    identificacaoDistribuicaoBoleto: 2, // 2 = cliente distribui ("Cedente" no Sicoobnet, confirmado)
    valor: Number(input.value),
    dataVencimento: input.dueDate,
    numeroParcela: 1,
    aceite: true,
    tipoDesconto: 0,
    ...(fine > 0
      ? { tipoMulta: 2, dataMulta: dayAfterDue, valorMulta: fine } // 2 = percentual
      : { tipoMulta: 0 }),
    ...(interest > 0
      ? { tipoJurosMora: 2, dataJurosMora: dayAfterDue, valorJurosMora: interest } // 2 = taxa mensal
      : { tipoJurosMora: 3 }), // 3 = isento
    pagador: {
      numeroCpfCnpj: onlyDigits(input.payer.document),
      nome: cut(input.payer.name, 50),
      endereco: cut(input.payer.address, 40),
      bairro: cut(input.payer.neighborhood, 30),
      cidade: cut(input.payer.city, 40),
      cep: onlyDigits(input.payer.zipCode),
      uf: input.payer.state.trim().toUpperCase().slice(0, 2),
      ...(input.payer.email ? { email: input.payer.email.trim() } : {}),
    },
    ...(instructions.length ? { mensagensInstrucao: instructions } : {}),
    gerarPdf: false, // PDF é buscado sob demanda (segunda via)
    codigoCadastrarPIX: 1, // boleto híbrido (QR Code Pix) — CONFERIR se o convênio permite
  };
}

// ─── Interpretação das respostas ────────────────────────────────────────────

export interface IssuedBoleto {
  nossoNumero: string;
  linhaDigitavel: string | null;
  codigoBarras: string | null;
  pixCopiaECola: string | null;
}

type Json = Record<string, unknown>;
const pick = (o: unknown, key: string): unknown => (o && typeof o === 'object' ? (o as Json)[key] : undefined);
const str = (v: unknown): string | null => (v === undefined || v === null || v === '' ? null : String(v));

/** A API devolve `{ resultado: {...} }` (às vezes lista). Normaliza para o objeto. */
function resultado(body: unknown): Json {
  const r = pick(body, 'resultado') ?? body;
  const obj = Array.isArray(r) ? r[0] : r;
  return (obj && typeof obj === 'object' ? obj : {}) as Json;
}

export function parseIssueResponse(body: unknown): IssuedBoleto {
  const r = resultado(body);
  const nossoNumero = str(r.nossoNumero);
  if (!nossoNumero) throw new Error('Resposta do Sicoob sem nossoNumero.');
  return {
    nossoNumero,
    linhaDigitavel: str(r.linhaDigitavel),
    codigoBarras: str(r.codigoBarras),
    pixCopiaECola: str(r.qrCode),
  };
}

export type SicoobBoletoState = 'aberto' | 'pago' | 'baixado' | 'desconhecido';

export interface BoletoSituation {
  state: SicoobBoletoState;
  rawSituation: string | null;
  paidAt: string | null; // YYYY-MM-DD
  paidValue: string | null;
}

/** Interpreta a consulta. Texto da situação varia ("Em Aberto", "Liquidado", "Baixado"...). */
export function parseSituation(body: unknown): BoletoSituation {
  const r = resultado(body);
  const raw = str(r.situacaoBoleto) ?? str(r.situacao);
  const s = (raw ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  let state: SicoobBoletoState = 'desconhecido';
  if (/liquidad|pago|quitad/.test(s)) state = 'pago';
  else if (/baixad|cancelad|protest/.test(s)) state = 'baixado';
  else if (/aberto|registrad|vencid|a vencer/.test(s)) state = 'aberto';

  // Data/valor do pagamento: procura no histórico a última liquidação. CONFERIR nomes no 1º pagamento real.
  let paidAt: string | null = null;
  let paidValue: string | null = null;
  const historico = (r.listaHistorico ?? r.historico) as unknown;
  if (Array.isArray(historico)) {
    for (const h of historico) {
      const desc = String(pick(h, 'descricaoHistorico') ?? pick(h, 'tipoHistorico') ?? '').toLowerCase();
      if (/liquida|pagamento/.test(desc)) {
        paidAt = str(pick(h, 'dataHistorico'))?.slice(0, 10) ?? paidAt;
        paidValue = str(pick(h, 'valorHistorico')) ?? paidValue;
      }
    }
  }
  if (state === 'pago') {
    paidAt ??= str(r.dataLiquidacao)?.slice(0, 10) ?? null;
    paidValue ??= str(r.valorPago) ?? str(r.valorLiquidado) ?? null;
  }
  return { state, rawSituation: raw, paidAt, paidValue };
}

// ─── Chamadas à API ─────────────────────────────────────────────────────────

export async function sicoobIssueBoleto(input: BoletoIssueInput): Promise<{ boleto: IssuedBoleto; raw: unknown }> {
  const res = await sicoobCobranca('POST', '/boletos', buildBoletoPayload(input, sicoobAccount()));
  return { boleto: parseIssueResponse(res.body), raw: res.body };
}

function accountQuery(nossoNumero: string): string {
  const a = sicoobAccount();
  return new URLSearchParams({
    numeroCliente: String(a.numeroCliente),
    codigoModalidade: String(a.codigoModalidade),
    nossoNumero,
  }).toString();
}

export async function sicoobGetBoleto(nossoNumero: string): Promise<{ situation: BoletoSituation; raw: unknown }> {
  const res = await sicoobCobranca('GET', `/boletos?${accountQuery(nossoNumero)}`);
  return { situation: parseSituation(res.body), raw: res.body };
}

/** Baixa (cancela a cobrança no banco). CONFERIR caminho no primeiro uso real. */
export async function sicoobWriteOffBoleto(nossoNumero: string): Promise<unknown> {
  const a = sicoobAccount();
  const res = await sicoobCobranca('POST', `/boletos/${encodeURIComponent(nossoNumero)}/baixar`, {
    numeroCliente: a.numeroCliente,
    codigoModalidade: a.codigoModalidade,
  });
  return res.body;
}

/** PDF (segunda via) em base64 → Buffer. */
export async function sicoobBoletoPdf(nossoNumero: string): Promise<Buffer> {
  const res = await sicoobCobranca('GET', `/boletos/segunda-via?${accountQuery(nossoNumero)}&gerarPdf=true`);
  const pdf = str(resultado(res.body).pdfBoleto);
  if (!pdf) throw new Error('O Sicoob não devolveu o PDF do boleto.');
  return Buffer.from(pdf, 'base64');
}
