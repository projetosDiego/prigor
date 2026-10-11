/**
 * Casamento de Pix recebido com títulos em aberto (pura, sem banco).
 *
 * Regra de ouro: só sugerimos baixa; quem confirma é a pessoa. O valor precisa
 * bater ao centavo para a baixa ser oferecida; nome parecido só ajuda a escolher.
 */

export interface PixInput {
  value: number;
  payerName: string | null;
  /** Só dígitos; 11 (CPF) ou 14 (CNPJ) quando o banco informa completo. */
  payerDocument: string | null;
}

export interface OpenTitle {
  transactionId: string;
  orderNumero: number;
  customerId: string;
  customerLabel: string;
  /** Nome fantasia, razão social etc. */
  names: string[];
  /** CPF/CNPJ do cliente, só dígitos. */
  docs: string[];
  value: number;
  dueDate: string | null;
}

export type Confidence = 'alta' | 'media' | 'baixa' | 'info';

export interface PixSuggestion {
  confidence: Confidence;
  score: number;
  customerId: string;
  customerLabel: string;
  transactionIds: string[];
  orderNumeros: number[];
  total: number;
  nameSimilarity: number;
  reasons: string[];
  /** false = só informativo (valor não bate): não oferecer botão de baixa. */
  canSettle: boolean;
}

const STOPWORDS = new Set([
  'ltda', 'me', 'mei', 'epp', 'eireli', 'sa', 's', 'a', 'de', 'da', 'do', 'das', 'dos', 'e', 'comercio', 'comercial', 'industria', 'servicos',
]);
const ALIASES: Record<string, string> = { jr: 'junior', jun: 'junior', fil: 'filho' };

export function nameTokens(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ') // números (CNPJ no nome de MEI) e pontuação saem
    .split(/\s+/)
    .filter((t) => t.length > 0 && !STOPWORDS.has(t))
    .map((t) => ALIASES[t] ?? t);
}

function editDistanceAtMost1(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

function tokenScore(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 1 && b.startsWith(a)) return 0.5;
  if (b.length === 1 && a.startsWith(b)) return 0.5;
  if (a.length >= 5 && b.length >= 5 && editDistanceAtMost1(a, b)) return 0.9;
  return 0;
}

/** 0..1 — quanto dos nomes coincide (iniciais e "jr/junior" contam). */
export function nameSimilarity(a: string | null | undefined, b: string | null | undefined): number {
  const A = nameTokens(a);
  const B = nameTokens(b);
  if (A.length === 0 || B.length === 0) return 0;
  const [small, large] = A.length <= B.length ? [A, B] : [B, A];
  const used = new Set<number>();
  let matched = 0;
  for (const t of small) {
    let best = 0;
    let bestIdx = -1;
    large.forEach((u, idx) => {
      if (used.has(idx)) return;
      const s = tokenScore(t, u);
      if (s > best) {
        best = s;
        bestIdx = idx;
      }
    });
    if (bestIdx >= 0) {
      used.add(bestIdx);
      matched += best;
    }
  }
  return Math.round((0.65 * (matched / small.length) + 0.35 * (matched / large.length)) * 1000) / 1000;
}

const cents = (v: number) => Math.round(v * 100);

function bestNameSim(payer: string | null, names: string[]): number {
  return names.reduce((m, n) => Math.max(m, nameSimilarity(payer, n)), 0);
}

function docMatches(payerDoc: string | null, docs: string[]): boolean {
  if (!payerDoc || (payerDoc.length !== 11 && payerDoc.length !== 14)) return false;
  return docs.some((d) => d === payerDoc);
}

function subsetsSumming(items: OpenTitle[], target: number, maxSize = 4): OpenTitle[][] {
  const pool = items.slice(0, 12);
  const out: OpenTitle[][] = [];
  const t = cents(target);
  const walk = (start: number, chosen: OpenTitle[], sum: number) => {
    if (chosen.length >= 2 && sum === t) {
      out.push([...chosen]);
      return;
    }
    if (chosen.length >= maxSize || sum >= t) return;
    for (let i = start; i < pool.length; i++) walk(i + 1, [...chosen, pool[i]!], sum + cents(pool[i]!.value));
  };
  walk(0, [], 0);
  return out.slice(0, 3);
}

export function suggestForPix(pix: PixInput, titles: OpenTitle[], limit = 4): PixSuggestion[] {
  const out: PixSuggestion[] = [];
  const byCustomer = new Map<string, OpenTitle[]>();
  for (const t of titles) {
    const arr = byCustomer.get(t.customerId) ?? [];
    arr.push(t);
    byCustomer.set(t.customerId, arr);
  }
  const exactCount = titles.filter((t) => cents(t.value) === cents(pix.value)).length;

  for (const [customerId, list] of byCustomer) {
    const label = list[0]!.customerLabel;
    const names = [...new Set(list.flatMap((t) => t.names))];
    const docs = [...new Set(list.flatMap((t) => t.docs))];
    const sim = bestNameSim(pix.payerName, names);
    const doc = docMatches(pix.payerDocument, docs);
    const nameStrength = doc ? 1 : sim;

    const exact = list.filter((t) => cents(t.value) === cents(pix.value));
    for (const t of exact) {
      const reasons = ['valor igual ao do título'];
      if (doc) reasons.push('CPF/CNPJ confere');
      else if (sim >= 0.25) reasons.push(`nome parecido (${Math.round(sim * 100)}%)`);
      else if (exactCount === 1) reasons.push('único título com esse valor');
      let confidence: Confidence = 'baixa';
      if (nameStrength >= 0.6) confidence = 'alta';
      else if (nameStrength >= 0.25) confidence = 'media';
      else if (exactCount === 1) confidence = 'media';
      out.push({
        confidence,
        score: 55 + Math.round(nameStrength * 45) + (exactCount === 1 ? 3 : 0),
        customerId,
        customerLabel: label,
        transactionIds: [t.transactionId],
        orderNumeros: [t.orderNumero],
        total: t.value,
        nameSimilarity: sim,
        reasons,
        canSettle: true,
      });
    }

    if (exact.length === 0 && nameStrength >= 0.25) {
      for (const combo of subsetsSumming(list, pix.value)) {
        out.push({
          confidence: nameStrength >= 0.6 ? 'alta' : 'media',
          score: 50 + Math.round(nameStrength * 45),
          customerId,
          customerLabel: label,
          transactionIds: combo.map((c) => c.transactionId),
          orderNumeros: combo.map((c) => c.orderNumero),
          total: combo.reduce((s, c) => s + c.value, 0),
          nameSimilarity: sim,
          reasons: [`soma de ${combo.length} títulos do mesmo cliente`, doc ? 'CPF/CNPJ confere' : `nome parecido (${Math.round(sim * 100)}%)`],
          canSettle: true,
        });
      }
    }

    // Cliente provável, mas o valor não fecha: só aviso (não oferece baixa).
    if (exact.length === 0 && nameStrength >= 0.6 && !out.some((s) => s.customerId === customerId)) {
      const open = list.reduce((s, t) => s + t.value, 0);
      out.push({
        confidence: 'info',
        score: Math.round(nameStrength * 40),
        customerId,
        customerLabel: label,
        transactionIds: list.slice(0, 1).map((t) => t.transactionId),
        orderNumeros: list.map((t) => t.orderNumero),
        total: open,
        nameSimilarity: sim,
        reasons: [`nome bate, mas o valor não: em aberto ${list.length} título(s) somando ${open.toFixed(2).replace('.', ',')}`],
        canSettle: false,
      });
    }
  }

  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}
