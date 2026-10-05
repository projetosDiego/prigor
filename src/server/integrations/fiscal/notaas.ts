/**
 * Adapter Notaas — NF-e modelo 55.
 * Docs: https://docs.notaas.com.br/docs/nfe/endpoints
 *
 * O emitente (CNPJ, IE, regime, certificado) fica cadastrado no painel da
 * Notaas; o corpo da emissão leva só destinatário, itens e pagamentos.
 * A emissão é assíncrona: POST devolve 202 + invoiceId e o status é consultado
 * depois (ou chega por webhook, fase 3).
 */
import { integrationEnv } from '../config';
import { httpRequest, IntegrationHttpError } from '../http';
import {
  FiscalProviderError,
  type FiscalInvoiceRequest,
  type FiscalInvoiceResult,
  type FiscalInvoiceStatus,
  type FiscalProvider,
} from './provider';

const BASE = 'https://platform.notaas.com.br/api/v1';
const onlyDigits = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '');
const money = (v: string) => Math.round(Number(v) * 100) / 100;

// ─── Puras (testadas) ──────────────────────────────────────────────────────

export function buildNotaasPayload(req: FiscalInvoiceRequest): Record<string, unknown> {
  const cnpj = onlyDigits(req.recipient.cnpj);
  const cpf = onlyDigits(req.recipient.cpf);
  const ie = onlyDigits(req.recipient.ie);
  const a = req.recipient.address;

  return {
    modelo: 55,
    tpAmb: req.environment === 'producao' ? 1 : 2,
    referencia: req.ref,
    naturezaOperacao: req.operationNature,
    dest: {
      ...(cnpj.length === 14 ? { cnpj } : { cpf }),
      nome: req.recipient.name.trim().slice(0, 60),
      indicadorIE: req.recipient.ieIndicator,
      // IE só vai para contribuinte (1); isento/não contribuinte omitem.
      ...(req.recipient.ieIndicator === 1 && ie ? { ie } : {}),
      ...(req.recipient.email ? { email: req.recipient.email.trim() } : {}),
      endereco: {
        logradouro: a.street.trim().slice(0, 60),
        numero: (a.number || 'S/N').trim().slice(0, 60),
        ...(a.complement ? { complemento: a.complement.trim().slice(0, 60) } : {}),
        bairro: a.neighborhood.trim().slice(0, 60),
        codigoMunicipio: Number(onlyDigits(a.cityIbgeCode)),
        cidade: a.city.trim(),
        uf: a.state.trim().toUpperCase(),
        cep: onlyDigits(a.zipCode),
      },
    },
    items: req.items.map((i) => ({
      codigo: i.code,
      descricao: i.description.trim().slice(0, 120),
      ncm: onlyDigits(i.ncm),
      cfop: onlyDigits(i.cfop),
      csosn: onlyDigits(i.csosn),
      unidade: i.unit.toUpperCase().slice(0, 6),
      quantidade: Number(i.quantity),
      valorUnitario: money(i.unitPrice),
      valorTotal: money(i.total),
      ...(i.discount && money(i.discount) > 0 ? { desconto: money(i.discount) } : {}),
    })),
    pagamentos: req.payments.map((p) => ({ tipoPagamento: p.code, valor: money(p.value) })),
    ...(req.shipping && money(req.shipping) > 0
      ? { valorFrete: money(req.shipping), transporte: { modalidadeFrete: 0 } }
      : { transporte: { modalidadeFrete: 9 } }),
    ...(req.billing
      ? {
          cobranca: {
            fatura: {
              numero: req.billing.invoiceNumber,
              valorOriginal: money(req.billing.original),
              desconto: money(req.billing.discount),
              valorLiquido: money(req.billing.net),
            },
            parcelas: req.billing.installments.map((p) => ({ numero: p.number, vencimento: p.dueDate, valor: money(p.value) })),
          },
        }
      : {}),
    ...(req.additionalInfo ? { infCpl: req.additionalInfo.slice(0, 2000) } : {}),
  };
}

const STATUS: Record<string, FiscalInvoiceStatus> = {
  queued: 'processando',
  processing: 'processando',
  issued: 'autorizada',
  error: 'rejeitada',
  cancelled: 'cancelada',
  inutilized: 'cancelada',
};

type Json = Record<string, unknown>;
const str = (v: unknown) => (v === undefined || v === null || v === '' ? null : String(v));

export function parseNotaasInvoice(body: unknown, fallbackId?: string): FiscalInvoiceResult {
  const root = (body && typeof body === 'object' ? body : {}) as Json;
  const b = ((root.data && typeof root.data === 'object' ? root.data : root) as Json);
  const providerId = str(b.invoiceId) ?? str(b.id) ?? fallbackId;
  if (!providerId) throw new Error('Resposta da Notaas sem invoiceId.');
  const rawStatus = String(b.status ?? 'queued').toLowerCase();
  const status = STATUS[rawStatus] ?? 'processando';
  const reason =
    str(b.motivo) ?? str(b.xMotivo) ?? str(b.mensagem) ?? str(b.message) ?? str((b.erro as Json | undefined)?.mensagem);
  const code = str(b.codigoStatus) ?? str(b.cStat);
  return {
    providerId,
    status,
    number: b.numero == null ? null : Number(b.numero),
    series: b.serie == null ? null : Number(b.serie),
    accessKey: str(b.chaveAcesso),
    rejectionReason: status === 'rejeitada' ? [code, reason].filter(Boolean).join(' — ') || 'Rejeitada pela SEFAZ.' : null,
    authorizedAt: status === 'autorizada' ? str(b.dataRecebimento) : null,
    raw: body,
  };
}

// ─── HTTP ───────────────────────────────────────────────────────────────────

async function call(method: 'GET' | 'POST', path: string, body?: unknown, binary = false) {
  const token = integrationEnv().FISCAL_API_TOKEN;
  let res;
  try {
    res = await httpRequest<unknown>({
      method,
      url: `${BASE}${path}`,
      headers: { 'x-api-key': token, ...(binary ? { Accept: '*/*' } : {}) },
      body,
      timeoutMs: 30_000,
    });
  } catch (err) {
    if (err instanceof IntegrationHttpError) throw new FiscalProviderError(err.message, 0, null);
    throw err;
  }
  if (res.status < 200 || res.status >= 300) {
    const b = res.body as Json | string;
    const msg =
      typeof b === 'object' && b
        ? str(b.message) ?? str(b.mensagem) ?? str(b.error) ?? JSON.stringify(b).slice(0, 300)
        : String(b).slice(0, 300);
    throw new FiscalProviderError(`Notaas respondeu ${res.status}: ${msg}`, res.status, res.body);
  }
  return res;
}

export const notaasProvider: FiscalProvider = {
  name: 'notaas',
  async issue(request) {
    const res = await call('POST', '/nfe/emitir', buildNotaasPayload(request));
    return parseNotaasInvoice(res.body);
  },
  async get(providerId) {
    const res = await call('GET', `/nfe/invoices/${encodeURIComponent(providerId)}/status`);
    return parseNotaasInvoice(res.body, providerId);
  },
  async cancel(providerId, reason) {
    const res = await call('POST', '/nfe/cancelar', { invoiceId: providerId, motivo: reason });
    const parsed = parseNotaasInvoice(res.body, providerId);
    // 202 = cancelamento aceito na fila; o status final vem na consulta.
    return parsed;
  },
  async danfe(providerId) {
    const res = await call('GET', `/nfe/invoices/${encodeURIComponent(providerId)}/danfe`, undefined, true);
    return res.buffer;
  },
  async xml(providerId) {
    const res = await call('GET', `/nfe/invoices/${encodeURIComponent(providerId)}/xml`, undefined, true);
    return res.buffer;
  },
};
