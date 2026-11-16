/**
 * Datas de entrega/retirada permitidas — puro, sem relógio: quem chama passa
 * "hoje" (no fuso de São Paulo) para a regra ser testável e igual no
 * navegador e no servidor.
 */
export type DateRules = {
  /** AAAA-MM-DD */
  start: string;
  end: string;
  /** Dias de antecedência mínima (produção) */
  leadDays: number;
  /** 0 = domingo … 6 = sábado */
  closedWeekdays: number[];
  /** AAAA-MM-DD */
  blockedDates: string[];
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function parse(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
}

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const d = parse(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return fmt(d);
}

/** "Hoje" no fuso de São Paulo, AAAA-MM-DD. */
export function todayInSaoPaulo(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function firstAllowedDate(today: string, rules: DateRules): string {
  const min = addDays(today, rules.leadDays);
  return min > rules.start ? min : rules.start;
}

export function isAllowedDate(date: string, today: string, rules: DateRules): boolean {
  if (!ISO.test(date)) return false;
  if (date < firstAllowedDate(today, rules) || date > rules.end) return false;
  if (rules.blockedDates.includes(date)) return false;
  return !rules.closedWeekdays.includes(parse(date).getUTCDay());
}

/** Lista as datas disponíveis (para o seletor). */
export function allowedDates(today: string, rules: DateRules, limit = 62): string[] {
  const out: string[] = [];
  let d = firstAllowedDate(today, rules);
  while (d <= rules.end && out.length < limit) {
    if (isAllowedDate(d, today, rules)) out.push(d);
    d = addDays(d, 1);
  }
  return out;
}

const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export function describeDate(iso: string): { weekday: string; day: string; month: string; long: string } {
  const d = parse(iso);
  const weekday = WEEKDAYS[d.getUTCDay()]!;
  const day = String(d.getUTCDate());
  const month = MONTHS[d.getUTCMonth()]!;
  return { weekday, day, month, long: `${weekday}, ${day} de ${month}` };
}
