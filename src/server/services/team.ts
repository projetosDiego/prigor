/**
 * Custos & Equipe: funcionários (diarista/mensalista/motoboy), faltas e o
 * cálculo mensal de custo (diária/salário + passagem).
 *
 * Regras (definidas com o Igor):
 *  - Dias trabalhados são contados pelos DIAS DA SEMANA cadastrados de cada
 *    pessoa (ex.: seg/qua/sex) que caem no mês.
 *  - Passagem é um valor fixo por dia, pago adiantado no início do mês com base
 *    nos dias previstos.
 *  - Faltas descontam a diária E geram um CRÉDITO de passagem (dias pagos e não
 *    usados) que é abatido no mês seguinte.
 */
import { prisma } from '../db';
import { badRequest, notFound } from '../http/errors';
import { dateOnly, num, timestamp } from './serializers';
import type { EmployeeInput, AbsenceInput } from '../validation/team';

export interface EmployeeDTO {
  id: string;
  name: string;
  role: string | null;
  payType: 'diarista' | 'mensalista';
  dailyRate: number;
  monthlySalary: number;
  transportPerDay: number;
  workDays: number[];
  active: boolean;
  createdAt: string | null;
}

export interface AbsenceDTO {
  id: string;
  employeeId: string;
  date: string | null;
  note: string | null;
}

interface EmployeeRow {
  id: string;
  name: string;
  role: string | null;
  payType: string;
  dailyRate: unknown;
  monthlySalary: unknown;
  transportPerDay: unknown;
  workDays: string;
  active: boolean;
  createdAt: Date;
}

function parseWorkDays(csv: string): number[] {
  if (!csv) return [];
  return csv
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
}

function toEmployeeDTO(r: EmployeeRow): EmployeeDTO {
  return {
    id: r.id,
    name: r.name,
    role: r.role,
    payType: r.payType === 'mensalista' ? 'mensalista' : 'diarista',
    dailyRate: num(r.dailyRate),
    monthlySalary: num(r.monthlySalary),
    transportPerDay: num(r.transportPerDay),
    workDays: parseWorkDays(r.workDays),
    active: r.active,
    createdAt: timestamp(r.createdAt),
  };
}

function toPersistable(input: EmployeeInput | Partial<EmployeeInput>): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  const keys: Array<keyof EmployeeInput> = [
    'name',
    'role',
    'payType',
    'dailyRate',
    'monthlySalary',
    'transportPerDay',
    'workDays',
    'active',
  ];
  for (const key of keys) {
    const value = (input as Record<string, unknown>)[key];
    if (value !== undefined) data[key] = value;
  }
  return data;
}

export async function listEmployees(activeOnly = false): Promise<EmployeeDTO[]> {
  const rows = await prisma.employee.findMany({
    where: activeOnly ? { active: true } : {},
    orderBy: [{ active: 'desc' }, { name: 'asc' }],
  });
  return rows.map(toEmployeeDTO);
}

export async function createEmployee(input: EmployeeInput): Promise<EmployeeDTO> {
  const created = await prisma.employee.create({ data: toPersistable(input) as never });
  return toEmployeeDTO(created);
}

export async function updateEmployee(
  id: string,
  input: Partial<EmployeeInput>,
): Promise<EmployeeDTO> {
  const existing = await prisma.employee.findUnique({ where: { id } });
  if (!existing) throw notFound('Funcionário');
  const updated = await prisma.employee.update({ where: { id }, data: toPersistable(input) });
  return toEmployeeDTO(updated);
}

/** Soft delete: desativa para não perder o histórico de faltas/custos. */
export async function deactivateEmployee(id: string): Promise<void> {
  const existing = await prisma.employee.findUnique({ where: { id } });
  if (!existing) throw notFound('Funcionário');
  await prisma.employee.update({ where: { id }, data: { active: false } });
}

// ─── Faltas ──────────────────────────────────────────────────────────────────

export async function listAbsences(
  employeeId: string,
  year?: number,
  month?: number,
): Promise<AbsenceDTO[]> {
  const where: Record<string, unknown> = { employeeId };
  if (year && month) {
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 1));
    where.date = { gte: start, lt: end };
  }
  const rows = await prisma.absence.findMany({ where, orderBy: { date: 'desc' } });
  return rows.map((r: { id: string; employeeId: string; date: Date; note: string | null }) => ({
    id: r.id,
    employeeId: r.employeeId,
    date: dateOnly(r.date),
    note: r.note,
  }));
}

export async function addAbsence(employeeId: string, input: AbsenceInput): Promise<AbsenceDTO> {
  const emp = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!emp) throw notFound('Funcionário');
  // isoDate já entrega um Date em UTC (meia-noite).
  const date = input.date;
  try {
    const created = await prisma.absence.create({
      data: { employeeId, date, note: input.note ?? null },
    });
    return { id: created.id, employeeId, date: dateOnly(created.date), note: created.note };
  } catch {
    throw badRequest('Essa falta já foi lançada para esse dia.');
  }
}

export async function removeAbsence(id: string): Promise<void> {
  const existing = await prisma.absence.findUnique({ where: { id } });
  if (!existing) throw notFound('Falta');
  await prisma.absence.delete({ where: { id } });
}

// ─── Cálculo mensal ────────────────────────────────────────────────────────────

export interface EmployeeMonthlyCost {
  employeeId: string;
  name: string;
  role: string | null;
  payType: 'diarista' | 'mensalista';
  expectedDays: number;
  absences: number;
  workedDays: number;
  pay: number;
  transportToPay: number;
  transportCreditApplied: number;
  transportCreditNext: number;
  total: number;
}

export interface MonthlyCostsDTO {
  year: number;
  month: number;
  employees: EmployeeMonthlyCost[];
  totals: { pay: number; transport: number; total: number };
}

/** Conta quantos dias do mês caem nos dias-da-semana informados. */
function countWorkdays(year: number, month: number, days: number[]): number {
  if (days.length === 0) return 0;
  const set = new Set(days);
  let count = 0;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const weekday = new Date(Date.UTC(year, month - 1, d)).getUTCDay();
    if (set.has(weekday)) count++;
  }
  return count;
}

export async function getMonthlyCosts(year: number, month: number): Promise<MonthlyCostsDTO> {
  const employees = await prisma.employee.findMany({
    where: { active: true },
    orderBy: { name: 'asc' },
  });

  // Faltas do mês atual e do mês anterior (para o crédito de passagem).
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const windowStart = new Date(Date.UTC(prevYear, prevMonth - 1, 1));
  const windowEnd = new Date(Date.UTC(year, month, 1));

  const absences = await prisma.absence.findMany({
    where: { date: { gte: windowStart, lt: windowEnd } },
    select: { employeeId: true, date: true },
  });

  const countIn = (empId: string, y: number, m: number): number =>
    absences.filter(
      (a: { employeeId: string; date: Date }) =>
        a.employeeId === empId &&
        a.date.getUTCFullYear() === y &&
        a.date.getUTCMonth() === m - 1,
    ).length;

  const rows: EmployeeMonthlyCost[] = employees.map((e: EmployeeRow) => {
    const dto = toEmployeeDTO(e);
    const expectedDays = countWorkdays(year, month, dto.workDays);
    const absCount = countIn(e.id, year, month);
    const workedDays = Math.max(expectedDays - absCount, 0);

    const pay =
      dto.payType === 'mensalista'
        ? dto.monthlySalary
        : Math.round(workedDays * dto.dailyRate * 100) / 100;

    const transportFull = Math.round(expectedDays * dto.transportPerDay * 100) / 100;
    const prevAbs = countIn(e.id, prevYear, prevMonth);
    const transportCreditApplied = Math.round(prevAbs * dto.transportPerDay * 100) / 100;
    const transportToPay = Math.max(Math.round((transportFull - transportCreditApplied) * 100) / 100, 0);
    const transportCreditNext = Math.round(absCount * dto.transportPerDay * 100) / 100;

    return {
      employeeId: e.id,
      name: dto.name,
      role: dto.role,
      payType: dto.payType,
      expectedDays,
      absences: absCount,
      workedDays,
      pay,
      transportToPay,
      transportCreditApplied,
      transportCreditNext,
      total: Math.round((pay + transportToPay) * 100) / 100,
    };
  });

  const totals = rows.reduce(
    (acc, r) => {
      acc.pay += r.pay;
      acc.transport += r.transportToPay;
      acc.total += r.total;
      return acc;
    },
    { pay: 0, transport: 0, total: 0 },
  );
  totals.pay = Math.round(totals.pay * 100) / 100;
  totals.transport = Math.round(totals.transport * 100) / 100;
  totals.total = Math.round(totals.total * 100) / 100;

  return { year, month, employees: rows, totals };
}
