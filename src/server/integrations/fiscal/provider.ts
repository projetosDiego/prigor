/**
 * Contrato do provedor fiscal (NF-e modelo 55).
 *
 * O PRIGOR não fala direto com a SEFAZ: um provedor (Focus NFe, Nuvem Fiscal,
 * PlugNotas…) assina com o certificado A1, transmite, guarda o XML e devolve
 * o DANFE. Todo provedor implementa esta interface; trocar de provedor é
 * trocar o adapter, sem mexer em pedido, tela ou banco.
 *
 * O adapter concreto entra na fase 4, depois da escolha do provedor.
 */

export interface FiscalAddress {
  street: string;
  number: string;
  complement?: string | null;
  neighborhood: string;
  city: string;
  cityIbgeCode?: string | null;
  state: string;
  zipCode: string;
}

export interface FiscalInvoiceItem {
  code: string;
  description: string;
  ncm: string;
  cfop: string;
  unit: string;
  quantity: string; // decimal em string — nunca number
  unitPrice: string;
  total: string;
  discount?: string;
}

export interface FiscalInvoiceRequest {
  /** Referência única (idempotência) — `NF-<pedido>-<seq>`. */
  ref: string;
  environment: 'homologacao' | 'producao';
  series: number;
  issuedAt: string; // ISO
  operationNature: string; // ex.: "Venda de mercadoria"
  issuer: { cnpj: string; ie: string; crt: number; csosn: string };
  recipient: {
    name: string;
    cnpj?: string | null;
    cpf?: string | null;
    ie?: string | null;
    ieIndicator?: string | null;
    email?: string | null;
    address: FiscalAddress;
  };
  items: FiscalInvoiceItem[];
  shipping?: string;
  discount?: string;
  total: string;
  additionalInfo?: string | null;
}

export type FiscalInvoiceStatus = 'processando' | 'autorizada' | 'rejeitada' | 'cancelada' | 'erro';

export interface FiscalInvoiceResult {
  ref: string;
  status: FiscalInvoiceStatus;
  number?: number | null;
  series?: number | null;
  accessKey?: string | null;
  xmlUrl?: string | null;
  danfeUrl?: string | null;
  rejectionReason?: string | null;
  raw: unknown;
}

export interface FiscalProvider {
  readonly name: string;
  issue(request: FiscalInvoiceRequest): Promise<FiscalInvoiceResult>;
  get(ref: string): Promise<FiscalInvoiceResult>;
  cancel(ref: string, reason: string): Promise<FiscalInvoiceResult>;
}

export class FiscalProviderNotConfiguredError extends Error {
  constructor(missing: string[]) {
    super(`Emissão de nota fiscal não configurada: falta ${missing.join(', ')}.`);
    this.name = 'FiscalProviderNotConfiguredError';
  }
}
