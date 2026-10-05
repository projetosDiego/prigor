/**
 * Leitura do XML autorizado da NF-e (nfeProc) para montar o DANFE.
 *
 * O XML da NF-e tem estrutura fixa (leiaute 4.00), então um leitor enxuto por
 * tag resolve sem dependência externa. Pura: entra string, sai objeto.
 */

const ENTITIES: Record<string, string> = { '&lt;': '<', '&gt;': '>', '&amp;': '&', '&quot;': '"', '&apos;': "'" };

function decode(s: string): string {
  return s
    .replace(/&(lt|gt|amp|quot|apos);/g, (m) => ENTITIES[m])
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

/** Conteúdo interno da primeira ocorrência de <tag ...>…</tag> (ignora prefixo de namespace). */
export function section(xml: string | null | undefined, tag: string): string | null {
  if (!xml) return null;
  const re = new RegExp(`<(?:\\w+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${tag}>`);
  const m = re.exec(xml);
  return m ? m[1] : null;
}

/** Todas as ocorrências (conteúdo interno + atributos). */
export function sections(xml: string | null | undefined, tag: string): Array<{ inner: string; attrs: string }> {
  if (!xml) return [];
  const re = new RegExp(`<(?:\\w+:)?${tag}(\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${tag}>`, 'g');
  const out: Array<{ inner: string; attrs: string }> = [];
  for (let m = re.exec(xml); m; m = re.exec(xml)) out.push({ inner: m[2], attrs: m[1] ?? '' });
  return out;
}

/** Texto de uma tag simples (folha). */
export function val(xml: string | null | undefined, tag: string): string {
  const s = section(xml, tag);
  return s == null ? '' : decode(s.trim());
}

/** Primeira folha encontrada entre várias tags (ex.: CNPJ ou CPF). */
const first = (xml: string | null, ...tags: string[]) => tags.map((t) => val(xml, t)).find((v) => v) ?? '';

export interface DanfeParty {
  name: string;
  tradeName: string;
  doc: string; // CNPJ ou CPF só dígitos
  ie: string;
  street: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  email: string;
}

export interface DanfeItem {
  code: string;
  description: string;
  ncm: string;
  cst: string;
  cfop: string;
  unit: string;
  quantity: string;
  unitValue: string;
  total: string;
  discount: string;
  bcIcms: string;
  vIcms: string;
  vIpi: string;
  pIcms: string;
  pIpi: string;
}

export interface DanfeData {
  accessKey: string;
  protocol: string;
  authorizedAt: string;
  environment: 1 | 2;
  type: '0' | '1';
  number: string;
  series: string;
  issuedAt: string;
  operationNature: string;
  emit: DanfeParty & { crt: string };
  dest: DanfeParty;
  totals: Record<'vBC' | 'vICMS' | 'vBCST' | 'vST' | 'vProd' | 'vFrete' | 'vSeg' | 'vDesc' | 'vOutro' | 'vIPI' | 'vNF' | 'vTotTrib', string>;
  transport: { mode: string; carrierName: string; carrierDoc: string; carrierIe: string; carrierAddress: string; carrierCity: string; carrierState: string; volumes: string; species: string; brand: string; numbering: string; grossWeight: string; netWeight: string };
  items: DanfeItem[];
  billing: { invoice: { number: string; original: string; discount: string; net: string } | null; installments: Array<{ number: string; dueDate: string; value: string }> };
  payments: Array<{ code: string; value: string }>;
  infCpl: string;
  infAdFisco: string;
}

function party(xml: string | null, addrTag: string): DanfeParty {
  const a = section(xml, addrTag);
  return {
    name: val(xml, 'xNome'),
    tradeName: val(xml, 'xFant'),
    doc: first(xml, 'CNPJ', 'CPF', 'idEstrangeiro'),
    ie: val(xml, 'IE'),
    street: val(a, 'xLgr'),
    number: val(a, 'nro'),
    complement: val(a, 'xCpl'),
    district: val(a, 'xBairro'),
    city: val(a, 'xMun'),
    state: val(a, 'UF'),
    zip: val(a, 'CEP'),
    phone: val(a, 'fone'),
    email: val(xml, 'email'),
  };
}

/** Lê ICMS do item seja qual for o grupo (ICMS00, ICMSSN102, ...). */
function icms(imposto: string | null) {
  const group = section(imposto, 'ICMS');
  const inner = group?.match(/<(?:\w+:)?(ICMS\w+)>([\s\S]*?)<\/(?:\w+:)?\1>/)?.[2] ?? null;
  const cst = val(inner, 'CSOSN') || val(inner, 'CST');
  const orig = val(inner, 'orig');
  return { cst: cst ? `${orig}${cst}` : '', vBC: val(inner, 'vBC'), vICMS: val(inner, 'vICMS'), pICMS: val(inner, 'pICMS') };
}

export function parseNfeXml(xml: string): DanfeData {
  const infNFe = section(xml, 'infNFe');
  if (!infNFe) throw new Error('XML sem infNFe — não parece uma NF-e.');
  const idAttr = /<(?:\w+:)?infNFe[^>]*\bId="NFe(\d{44})"/.exec(xml)?.[1] ?? '';
  const ide = section(infNFe, 'ide');
  const emit = section(infNFe, 'emit');
  const dest = section(infNFe, 'dest');
  const tot = section(infNFe, 'ICMSTot');
  const transp = section(infNFe, 'transp');
  const transporta = section(transp, 'transporta');
  const vol = section(transp, 'vol');
  const cobr = section(infNFe, 'cobr');
  const fat = section(cobr, 'fat');
  const prot = section(xml, 'infProt');

  const totals = Object.fromEntries(
    (['vBC', 'vICMS', 'vBCST', 'vST', 'vProd', 'vFrete', 'vSeg', 'vDesc', 'vOutro', 'vIPI', 'vNF', 'vTotTrib'] as const).map((k) => [
      k,
      val(tot, k) || '0.00',
    ]),
  ) as DanfeData['totals'];

  const items: DanfeItem[] = sections(infNFe, 'det').map(({ inner }) => {
    const prod = section(inner, 'prod');
    const imposto = section(inner, 'imposto');
    const i = icms(imposto);
    const ipiTrib = section(section(imposto, 'IPI'), 'IPITrib');
    return {
      code: val(prod, 'cProd'),
      description: val(prod, 'xProd'),
      ncm: val(prod, 'NCM'),
      cst: i.cst,
      cfop: val(prod, 'CFOP'),
      unit: val(prod, 'uCom'),
      quantity: val(prod, 'qCom'),
      unitValue: val(prod, 'vUnCom'),
      total: val(prod, 'vProd'),
      discount: val(prod, 'vDesc') || '0.00',
      bcIcms: i.vBC || '0.00',
      vIcms: i.vICMS || '0.00',
      vIpi: val(ipiTrib, 'vIPI') || '0.00',
      pIcms: i.pICMS || '0.00',
      pIpi: val(ipiTrib, 'pIPI') || '0.00',
    };
  });

  return {
    accessKey: val(prot, 'chNFe') || idAttr,
    protocol: val(prot, 'nProt'),
    authorizedAt: val(prot, 'dhRecbto'),
    environment: val(ide, 'tpAmb') === '1' ? 1 : 2,
    type: val(ide, 'tpNF') === '0' ? '0' : '1',
    number: val(ide, 'nNF'),
    series: val(ide, 'serie'),
    issuedAt: val(ide, 'dhEmi'),
    operationNature: val(ide, 'natOp'),
    emit: { ...party(emit, 'enderEmit'), crt: val(emit, 'CRT') },
    dest: party(dest, 'enderDest'),
    totals,
    transport: {
      mode: val(transp, 'modFrete'),
      carrierName: val(transporta, 'xNome'),
      carrierDoc: first(transporta, 'CNPJ', 'CPF'),
      carrierIe: val(transporta, 'IE'),
      carrierAddress: val(transporta, 'xEnder'),
      carrierCity: val(transporta, 'xMun'),
      carrierState: val(transporta, 'UF'),
      volumes: val(vol, 'qVol'),
      species: val(vol, 'esp'),
      brand: val(vol, 'marca'),
      numbering: val(vol, 'nVol'),
      grossWeight: val(vol, 'pesoB'),
      netWeight: val(vol, 'pesoL'),
    },
    items,
    billing: {
      invoice: fat ? { number: val(fat, 'nFat'), original: val(fat, 'vOrig'), discount: val(fat, 'vDesc'), net: val(fat, 'vLiq') } : null,
      installments: sections(cobr, 'dup').map(({ inner }) => ({
        number: val(inner, 'nDup'),
        dueDate: val(inner, 'dVenc'),
        value: val(inner, 'vDup'),
      })),
    },
    payments: sections(section(infNFe, 'pag'), 'detPag').map(({ inner }) => ({ code: val(inner, 'tPag'), value: val(inner, 'vPag') })),
    infCpl: val(section(infNFe, 'infAdic'), 'infCpl'),
    infAdFisco: val(section(infNFe, 'infAdic'), 'infAdFisco'),
  };
}
