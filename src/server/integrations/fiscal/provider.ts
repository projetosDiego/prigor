/**
 * Contrato do provedor fiscal (NF-e modelo 55).
 *
 * O PRIGOR não fala direto com a SEFAZ: o provedor assina com o certificado A1
 * (enviado no painel dele), transmite, guarda o XML e gera o DANFE. Todo
 * provedor implementa esta interface; trocar de provedor é trocar o adapter.
 *
 * Dinheiro e quantidade chegam como string decimal (nunca number) e só viram
 * número na borda, dentro do adapter.
 */

export interface FiscalAddress {
  street: string;
  number: string;
  complement?: string | null;
  neighborhood: string;
  city: string;
  cityIbgeCode: string;
  state: string;
  zipCode: string;
}

export interface FiscalInvoiceItem {
  code: string;
  description: string;
  ncm: string;
  cfop: string;
  csosn: string;
  unit: string;
  quantity: string;
  unitPrice: string;
  total: string;
}

/** Códigos de forma de pagamento da NF-e (tPag). */
export type FiscalPaymentCode = '01' | '03' | '04' | '15' | '17' | '99';

export interface FiscalInvoiceRequest {
  /** Nossa referência (idempotência) — `NF-<pedido>-<seq>`. */
  ref: string;
  environment: 'homologacao' | 'producao';
  operationNature: string;
  recipient: {
    name: string;
    cnpj?: string | null;
    cpf?: string | null;
    ie?: string | null;
    /** indIEDest: 1 contribuinte · 2 isento · 9 não contribuinte. */
    ieIndicator: 1 | 2 | 9;
    email?: string | null;
    address: FiscalAddress;
  };
  items: FiscalInvoiceItem[];
  payments: Array<{ code: FiscalPaymentCode; value: string }>;
  additionalInfo?: string | null;
}

export type FiscalInvoiceStatus = 'processando' | 'autorizada' | 'rejeitada' | 'cancelada' | 'erro';

export interface FiscalInvoiceResult {
  /** Id da nota no provedor. */
  providerId: string;
  status: FiscalInvoiceStatus;
  number?: number | null;
  series?: number | null;
  accessKey?: string | null;
  rejectionReason?: string | null;
  authorizedAt?: string | null;
  raw: unknown;
}

export interface FiscalProvider {
  readonly name: string;
  issue(request: FiscalInvoiceRequest): Promise<FiscalInvoiceResult>;
  get(providerId: string): Promise<FiscalInvoiceResult>;
  cancel(providerId: string, reason: string): Promise<FiscalInvoiceResult>;
  danfe(providerId: string): Promise<Buffer>;
  xml(providerId: string): Promise<Buffer>;
}

export class FiscalProviderNotConfiguredError extends Error {
  constructor(missing: string[]) {
    super(`Emissão de nota fiscal não configurada: falta ${missing.join(', ')}.`);
    this.name = 'FiscalProviderNotConfiguredError';
  }
}

export class FiscalProviderError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message);
    this.name = 'FiscalProviderError';
  }
}
