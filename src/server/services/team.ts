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

import { listAdvances, type AdvanceDTO } from './advances';

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
  /** Desconto da diária pelas faltas do mês (só diarista). */
  absenceDiscount: number;
  advances: number;
  total: number;
  netTotal: number;
}

export interface SellerMonthlyCost {
  sellerId: string;
  name: string;
  salesTotal: number;
  ordersCount: number;
  directCommission: number;
  supervisorCommission: number;
  totalCommission: number;
  /** Ajuda de custo mensal fixa (custo fixo, somada ao líquido). */
  allowance: number;
  advances: number;
  netCommission: number;
}

export interface MonthlyCostsDTO {
  year: number;
  month: number;
  employees: EmployeeMonthlyCost[];
  sellers: SellerMonthlyCost[];
  advances: AdvanceDTO[];
  totals: {
    pay: number;
    transport: number;
    employeeGross: number;
    employeeAdvances: number;
    employeeNet: number;
    sellerSales: number;
    sellerCommission: number;
    sellerAllowance: number;
    sellerAdvances: number;
    sellerNet: number;
    total: number;
    advancesTotal: number;
    netTotal: number;
  };
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
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthEnd = new Date(Date.UTC(year, month, 1));

  const [employees, advancesList, sellersList] = await Promise.all([
    prisma.employee.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
    }),
    listAdvances(year, month),
    prisma.seller.findMany({
      where: { active: true },
      select: {
        id: true,
        name: true,
        commissionPct: true,
        supervisorId: true,
        supervisorCommissionPct: true,
        allowance: true,
        subordinates: {
          where: { active: true },
          select: { id: true, supervisorCommissionPct: true },
        },
      },
      orderBy: { name: 'asc' },
    }),
  ]);

  // Faltas do mês atual e do mês anterior (para o crédito de passagem).
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const windowStart = new Date(Date.UTC(prevYear, prevMonth - 1, 1));

  const absences = await prisma.absence.findMany({
    where: { date: { gte: windowStart, lt: monthEnd } },
    select: { employeeId: true, date: true },
  });

  const countIn = (empId: string, y: number, m: number): number =>
    absences.filter(
      (a: { employeeId: string; date: Date }) =>
        a.employeeId === empId &&
        a.date.getUTCFullYear() === y &&
        a.date.getUTCMonth() === m - 1,
    ).length;

  const employeeRows: EmployeeMonthlyCost[] = employees.map((e: EmployeeRow) => {
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

    const empAdvances = advancesList
      .filter((a) => a.employeeId === e.id)
      .reduce((sum, a) => sum + a.amount, 0);

    const total = Math.round((pay + transportToPay) * 100) / 100;
    const netTotal = Math.max(Math.round((total - empAdvances) * 100) / 100, 0);

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
      absenceDiscount:
        dto.payType === 'diarista' ? Math.round(absCount * dto.dailyRate * 100) / 100 : 0,
      advances: Math.round(empAdvances * 100) / 100,
      total,
      netTotal,
    };
  });

  // Vendas e comissões dos vendedores no mês
  const sellerIds = sellersList.map((s) => s.id);
  const sellerOrders = await prisma.order.groupBy({
    by: ['sellerId'],
    where: {
      status: { not: 'cancelado' },
      sellerId: { in: sellerIds },
      orderDate: { gte: monthStart, lt: monthEnd },
    },
    _count: { _all: true },
    _sum: { total: true, commissionVal: true },
  });

  const bySellerOrder = new Map(sellerOrders.map((g) => [g.sellerId, g]));

  const sellerRows: SellerMonthlyCost[] = sellersList.map((s) => {
    const orderData = bySellerOrder.get(s.id);
    const salesTotal = num(orderData?._sum.total);
    const ordersCount = orderData?._count._all ?? 0;
    const directCommission = Math.round(num(orderData?._sum.commissionVal) * 100) / 100;

    // Comissão de supervisão sobre subordinados
    let supervisorCommission = 0;
    if (s.subordinates && s.subordinates.length > 0) {
      for (const sub of s.subordinates) {
        const subData = bySellerOrder.get(sub.id);
        const subSales = num(subData?._sum.total);
        const subRate = num(sub.supervisorCommissionPct);
        if (subSales > 0 && subRate > 0) {
          supervisorCommission += (subSales * subRate) / 100;
        }
      }
    }
    supervisorCommission = Math.round(supervisorCommission * 100) / 100;

    const totalCommission = Math.round((directCommission + supervisorCommission) * 100) / 100;

    const selAdvances = advancesList
      .filter((a) => a.sellerId === s.id)
      .reduce((sum, a) => sum + a.amount, 0);

    const allowance = Math.round(num(s.allowance) * 100) / 100;
    // Ajuda de custo é fixa: soma ao líquido depois de abatidos os vales da comissão.
    const netCommission =
      Math.round((Math.max(totalCommission - selAdvances, 0) + allowance) * 100) / 100;

    return {
      sellerId: s.id,
      name: s.name,
      salesTotal,
      ordersCount,
      directCommission,
      supervisorCommission,
      totalCommission,
      allowance,
      advances: Math.round(selAdvances * 100) / 100,
      netCommission,
    };
  });

  const employeePay = employeeRows.reduce((sum, r) => sum + r.pay, 0);
  const employeeTransport = employeeRows.reduce((sum, r) => sum + r.transportToPay, 0);
  const employeeGross = employeeRows.reduce((sum, r) => sum + r.total, 0);
  const employeeAdvances = employeeRows.reduce((sum, r) => sum + r.advances, 0);
  const employeeNet = employeeRows.reduce((sum, r) => sum + r.netTotal, 0);

  const sellerSales = sellerRows.reduce((sum, s) => sum + s.salesTotal, 0);
  const sellerCommission = sellerRows.reduce((sum, s) => sum + s.totalCommission, 0);
  const sellerAdvances = sellerRows.reduce((sum, s) => sum + s.advances, 0);
  const sellerAllowance = sellerRows.reduce((sum, s) => sum + s.allowance, 0);
  const sellerNet = sellerRows.reduce((sum, s) => sum + s.netCommission, 0);

  const grandTotal = Math.round((employeeGross + sellerCommission + sellerAllowance) * 100) / 100;
  const advancesTotal = Math.round((employeeAdvances + sellerAdvances) * 100) / 100;
  const netTotal = Math.round((employeeNet + sellerNet) * 100) / 100;

  return {
    year,
    month,
    employees: employeeRows,
    sellers: sellerRows,
    advances: advancesList,
    totals: {
      pay: Math.round(employeePay * 100) / 100,
      transport: Math.round(employeeTransport * 100) / 100,
      employeeGross: Math.round(employeeGross * 100) / 100,
      employeeAdvances: Math.round(employeeAdvances * 100) / 100,
      employeeNet: Math.round(employeeNet * 100) / 100,
      sellerSales: Math.round(sellerSales * 100) / 100,
      sellerCommission: Math.round(sellerCommission * 100) / 100,
      sellerAllowance: Math.round(sellerAllowance * 100) / 100,
      sellerAdvances: Math.round(sellerAdvances * 100) / 100,
      sellerNet: Math.round(sellerNet * 100) / 100,
      total: grandTotal,
      advancesTotal,
      netTotal,
    },
  };
}
