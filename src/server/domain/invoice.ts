/**
 * Nota fiscal — conferência pura dos dados antes de emitir.
 *
 * A NF-e só é enviada ao provedor fiscal se esta função não apontar nenhum
 * problema. Dado faltando vira mensagem clara na tela, não rejeição da SEFAZ.
 * Os valores fiscais (NCM, CFOP, CSOSN, CRT) vêm do contador — aqui só se
 * confere presença e formato.
 */

export interface InvoiceIssuer {
  cnpj: string | null;
  ie: string | null;
  legalName: string | null;
  address: string | null;
  number: string | null;
  neighborhood: string | null;
  city: string | null;
  cityIbgeCode: string | null;
  state: string | null;
  zipCode: string | null;
  defaultCfopInState: string | null;
  defaultCfopOutState: string | null;
  defaultCsosn: string | null;
}

export interface InvoiceCustomer {
  legalName: string | null;
  tradeName: string;
  cnpj: string | null;
  cpf: string | null;
  address: string | null;
  number: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
}

export interface InvoiceItem {
  name: string;
  ncm: string | null;
  cfop: string | null;
}

const onlyDigits = (v: string | null | undefined): string => (v ?? '').replace(/\D/g, '');
const blank = (v: string | null | undefined): boolean => !v || !v.trim();

/** NCM tem 8 dígitos. */
export function isValidNcm(ncm: string | null | undefined): boolean {
  return /^\d{8}$/.test((ncm ?? '').replace(/[.\s]/g, ''));
}

/** CFOP tem 4 dígitos e começa com 5 (dentro do estado), 6 (fora) ou 7 (exterior). */
export function isValidCfop(cfop: string | null | undefined): boolean {
  return /^[567]\d{3}$/.test(onlyDigits(cfop));
}

/** CFOP a usar no item: o do produto, senão o padrão conforme a UF do cliente. */
export function resolveCfop(
  itemCfop: string | null,
  issuerState: string | null,
  customerState: string | null,
  defaults: { inState: string | null; outState: string | null },
): string | null {
  if (!blank(itemCfop)) return onlyDigits(itemCfop);
  const sameState =
    !!issuerState && !!customerState && issuerState.trim().toUpperCase() === customerState.trim().toUpperCase();
  const fallback = sameState ? defaults.inState : defaults.outState;
  return blank(fallback) ? null : onlyDigits(fallback);
}

/**
 * Lista tudo o que impede emitir a NF. Vazia = pode emitir.
 * Mensagens em português, prontas para a tela.
 */
export function invoiceReadinessProblems(input: {
  issuer: InvoiceIssuer | null;
  customer: InvoiceCustomer;
  items: InvoiceItem[];
}): string[] {
  const problems: string[] = [];
  const { issuer, customer, items } = input;

  // Emitente
  if (!issuer) {
    problems.push('Configuração fiscal da empresa não preenchida (Admin › Configuração fiscal).');
  } else {
    if (onlyDigits(issuer.cnpj).length !== 14) problems.push('Empresa: CNPJ do emitente inválido ou vazio.');
    if (blank(issuer.ie)) problems.push('Empresa: Inscrição Estadual não informada.');
    if (blank(issuer.legalName)) problems.push('Empresa: razão social não informada.');
    if (blank(issuer.address) || blank(issuer.number) || blank(issuer.neighborhood))
      problems.push('Empresa: endereço incompleto.');
    if (blank(issuer.city) || blank(issuer.state)) problems.push('Empresa: cidade/UF não informadas.');
    if (onlyDigits(issuer.cityIbgeCode).length !== 7) problems.push('Empresa: código IBGE da cidade inválido.');
    if (onlyDigits(issuer.zipCode).length !== 8) problems.push('Empresa: CEP inválido.');
    if (blank(issuer.defaultCsosn)) problems.push('Empresa: CSOSN padrão não informado (confirmar com o contador).');
  }

  // Destinatário
  const who = customer.legalName || customer.tradeName;
  const cnpj = onlyDigits(customer.cnpj);
  const cpf = onlyDigits(customer.cpf);
  if (cnpj.length !== 14 && cpf.length !== 11) problems.push(`Cliente "${who}": sem CNPJ ou CPF válido.`);
  if (blank(customer.address) || blank(customer.number) || blank(customer.neighborhood))
    problems.push(`Cliente "${who}": endereço incompleto (rua, número e bairro).`);
  if (blank(customer.city) || blank(customer.state)) problems.push(`Cliente "${who}": cidade/UF não informadas.`);
  if (onlyDigits(customer.zipCode).length !== 8) problems.push(`Cliente "${who}": CEP inválido.`);

  // Itens
  if (items.length === 0) problems.push('Pedido sem itens.');
  for (const item of items) {
    if (!isValidNcm(item.ncm)) problems.push(`Produto "${item.name}": NCM ausente ou inválido (8 dígitos).`);
    const cfop = resolveCfop(item.cfop, issuer?.state ?? null, customer.state, {
      inState: issuer?.defaultCfopInState ?? null,
      outState: issuer?.defaultCfopOutState ?? null,
    });
    if (!isValidCfop(cfop)) problems.push(`Produto "${item.name}": CFOP ausente ou inválido.`);
  }

  return problems;
}
