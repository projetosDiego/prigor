'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  Users,
  Plus,
  Edit2,
  Power,
  CalendarX,
  Loader2,
  Wallet,
  Bus,
  X,
  Trash2,
  DollarSign,
  TrendingUp,
  ShieldCheck,
  Award,
  AlertCircle,
} from 'lucide-react';

import { responseErrorMessage } from '@/lib/errors';
import { useToast } from '@/components/shared/Toast';

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

interface Employee {
  id: string;
  name: string;
  role: string | null;
  payType: 'diarista' | 'mensalista';
  dailyRate: number;
  monthlySalary: number;
  transportPerDay: number;
  workDays: number[];
  active: boolean;
}

interface Absence {
  id: string;
  employeeId: string;
  date: string | null;
  note: string | null;
}

interface Advance {
  id: string;
  employeeId: string | null;
  employeeName: string | null;
  sellerId: string | null;
  sellerName: string | null;
  date: string;
  amount: number;
  reason: string | null;
  createdAt: string | null;
}

interface EmployeeMonthlyRow {
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
  advances: number;
  total: number;
  netTotal: number;
}

interface SellerMonthlyRow {
  sellerId: string;
  name: string;
  salesTotal: number;
  ordersCount: number;
  directCommission: number;
  supervisorCommission: number;
  totalCommission: number;
  advances: number;
  netCommission: number;
}

interface MonthlyCosts {
  year: number;
  month: number;
  employees: EmployeeMonthlyRow[];
  sellers: SellerMonthlyRow[];
  advances: Advance[];
  totals: {
    pay: number;
    transport: number;
    employeeGross: number;
    employeeAdvances: number;
    employeeNet: number;
    sellerSales: number;
    sellerCommission: number;
    sellerAdvances: number;
    sellerNet: number;
    total: number;
    advancesTotal: number;
    netTotal: number;
  };
}

interface SimpleSeller {
  id: string;
  name: string;
}

const brl = (n: number) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function CostsPage() {
  const { toast, confirm } = useToast();
  const now = new Date();

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [simpleSellers, setSimpleSellers] = useState<SimpleSeller[]>([]);
  const [costs, setCosts] = useState<MonthlyCosts | null>(null);
  const [year, setYear] = useState(now.getUTCFullYear());
  const [month, setMonth] = useState(now.getUTCMonth() + 1);
  const [loading, setLoading] = useState(true);

  // Modal funcionário
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [fName, setFName] = useState('');
  const [fRole, setFRole] = useState('');
  const [fPayType, setFPayType] = useState<'diarista' | 'mensalista'>('diarista');
  const [fDaily, setFDaily] = useState('0');
  const [fSalary, setFSalary] = useState('0');
  const [fTransport, setFTransport] = useState('0');
  const [fWorkDays, setFWorkDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [saving, setSaving] = useState(false);

  // Modal faltas
  const [absEmp, setAbsEmp] = useState<Employee | null>(null);
  const [absList, setAbsList] = useState<Absence[]>([]);
  const [absDate, setAbsDate] = useState('');
  const [absNote, setAbsNote] = useState('');
  const [absSaving, setAbsSaving] = useState(false);

  // Modal Adiantamento / Vale
  const [showAdvanceModal, setShowAdvanceModal] = useState(false);
  const [advType, setAdvType] = useState<'employee' | 'seller'>('employee');
  const [advPersonId, setAdvPersonId] = useState('');
  const [advDate, setAdvDate] = useState(new Date().toISOString().slice(0, 10));
  const [advAmount, setAdvAmount] = useState('');
  const [advReason, setAdvReason] = useState('');
  const [advSaving, setAdvSaving] = useState(false);

  const loadEmployees = useCallback(async () => {
    const res = await fetch('/api/employees?activeOnly=false');
    if (res.ok) {
      const d = (await res.json()) as { data?: Employee[] };
      setEmployees(d.data ?? []);
    }
  }, []);

  const loadSellers = useCallback(async () => {
    const res = await fetch('/api/sellers?activeOnly=true');
    if (res.ok) {
      const d = (await res.json()) as { data?: SimpleSeller[] };
      setSimpleSellers(d.data ?? []);
    }
  }, []);

  const loadCosts = useCallback(async () => {
    const res = await fetch(`/api/costs/monthly?year=${year}&month=${month}`);
    if (res.ok) setCosts((await res.json()) as MonthlyCosts);
  }, [year, month]);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      await Promise.all([loadEmployees(), loadSellers(), loadCosts()]);
      setLoading(false);
    })();
  }, [loadEmployees, loadSellers, loadCosts]);

  const openCreate = () => {
    setEditId(null);
    setFName('');
    setFRole('');
    setFPayType('diarista');
    setFDaily('0');
    setFSalary('0');
    setFTransport('0');
    setFWorkDays([1, 2, 3, 4, 5]);
    setShowForm(true);
  };

  const openEdit = (e: Employee) => {
    setEditId(e.id);
    setFName(e.name);
    setFRole(e.role ?? '');
    setFPayType(e.payType);
    setFDaily(String(e.dailyRate));
    setFSalary(String(e.monthlySalary));
    setFTransport(String(e.transportPerDay));
    setFWorkDays(e.workDays);
    setShowForm(true);
  };

  const toggleDay = (d: number) => {
    setFWorkDays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b),
    );
  };

  const save = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!fName.trim()) {
      toast('Informe o nome do funcionário.', 'error');
      return;
    }
    setSaving(true);
    const payload = {
      name: fName,
      role: fRole || undefined,
      payType: fPayType,
      dailyRate: fDaily || '0',
      monthlySalary: fSalary || '0',
      transportPerDay: fTransport || '0',
      workDays: [...fWorkDays].sort((a, b) => a - b).join(','),
      active: true,
    };
    try {
      const res = await fetch(editId ? `/api/employees/${editId}` : '/api/employees', {
        method: editId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await responseErrorMessage(res, 'Erro ao salvar funcionário.'));
      setShowForm(false);
      toast(editId ? 'Funcionário atualizado.' : 'Funcionário fixo cadastrado com sucesso.', 'success');
      await Promise.all([loadEmployees(), loadCosts()]);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao salvar.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const deactivate = async (e: Employee) => {
    const ok = await confirm({
      title: 'Desativar funcionário',
      message: `Desativar "${e.name}"? Ele deixa de entrar no cálculo dos meses futuros, mas o histórico é mantido.`,
      confirmLabel: 'Desativar',
      danger: true,
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/employees/${e.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await responseErrorMessage(res, 'Erro ao desativar.'));
      toast('Funcionário desativado.', 'success');
      await Promise.all([loadEmployees(), loadCosts()]);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao desativar.', 'error');
    }
  };

  const openAbsences = async (e: Employee) => {
    setAbsEmp(e);
    setAbsDate('');
    setAbsNote('');
    setAbsList([]);
    const res = await fetch(`/api/employees/${e.id}/absences?year=${year}&month=${month}`);
    if (res.ok) {
      const d = (await res.json()) as { data?: Absence[] };
      setAbsList(d.data ?? []);
    }
  };

  const addAbsence = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!absEmp || !absDate) return;
    setAbsSaving(true);
    try {
      const res = await fetch(`/api/employees/${absEmp.id}/absences`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: absDate, note: absNote || undefined }),
      });
      if (!res.ok) throw new Error(await responseErrorMessage(res, 'Erro ao lançar falta.'));
      setAbsDate('');
      setAbsNote('');
      const list = await fetch(`/api/employees/${absEmp.id}/absences?year=${year}&month=${month}`);
      if (list.ok) {
        const d = (await list.json()) as { data?: Absence[] };
        setAbsList(d.data ?? []);
      }
      toast('Falta lançada.', 'success');
      await loadCosts();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao lançar falta.', 'error');
    } finally {
      setAbsSaving(false);
    }
  };

  const removeAbsence = async (id: string) => {
    try {
      const res = await fetch(`/api/employee-absences/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await responseErrorMessage(res, 'Erro ao remover falta.'));
      setAbsList((prev) => prev.filter((a) => a.id !== id));
      await loadCosts();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao remover falta.', 'error');
    }
  };

  // Lançar adiantamento / vale
  const openNewAdvance = () => {
    setAdvType('employee');
    const firstEmp = employees.find((e) => e.active);
    setAdvPersonId(firstEmp ? firstEmp.id : '');
    setAdvDate(new Date().toISOString().slice(0, 10));
    setAdvAmount('');
    setAdvReason('');
    setShowAdvanceModal(true);
  };

  const saveAdvance = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const val = Number(advAmount.replace(',', '.'));
    if (!val || val <= 0) {
      toast('Informe um valor de adiantamento válido.', 'error');
      return;
    }
    if (!advPersonId) {
      toast('Selecione quem recebeu o adiantamento.', 'error');
      return;
    }

    setAdvSaving(true);
    const payload = {
      date: advDate,
      amount: val,
      reason: advReason || undefined,
      employeeId: advType === 'employee' ? advPersonId : undefined,
      sellerId: advType === 'seller' ? advPersonId : undefined,
    };

    try {
      const res = await fetch('/api/advances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await responseErrorMessage(res, 'Erro ao lançar adiantamento.'));
      setShowAdvanceModal(false);
      toast('Adiantamento / Vale lançado com sucesso!', 'success');
      await loadCosts();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao lançar adiantamento.', 'error');
    } finally {
      setAdvSaving(false);
    }
  };

  const handleDeleteAdvance = async (adv: Advance) => {
    const personName = adv.employeeName || adv.sellerName || 'Beneficiário';
    const ok = await confirm({
      title: 'Excluir adiantamento',
      message: `Excluir o adiantamento de ${brl(adv.amount)} para "${personName}"? O valor deixará de ser descontado.`,
      confirmLabel: 'Excluir',
      danger: true,
    });
    if (!ok) return;

    try {
      const res = await fetch(`/api/advances/${adv.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await responseErrorMessage(res, 'Erro ao excluir adiantamento.'));
      toast('Adiantamento excluído.', 'success');
      await loadCosts();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao excluir adiantamento.', 'error');
    }
  };

  const years = [now.getUTCFullYear() - 1, now.getUTCFullYear(), now.getUTCFullYear() + 1];

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-black text-stone-900 tracking-tight flex items-center gap-2">
            <Users className="h-6 w-6 text-amber-700" />
            Custos &amp; Equipe
          </h2>
          <p className="text-xs text-stone-500 font-medium">
            Funcionárias, motoboy, diaristas e comissões de vendedores com cálculo automático e abatimento de adiantamentos/vales.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={openNewAdvance}
            className="flex items-center gap-1.5 rounded-lg border border-amber-600 bg-amber-50 hover:bg-amber-100 text-amber-900 px-3.5 py-2 text-xs font-bold cursor-pointer transition-all shadow-sm"
          >
            <DollarSign className="h-4 w-4 text-amber-700" />
            + Lançar Adiantamento / Vale
          </button>
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 rounded-lg bg-amber-700 hover:bg-amber-800 text-white px-4 py-2 text-xs font-bold cursor-pointer transition-all shadow-sm"
          >
            <Plus className="h-4 w-4" />
            Novo Funcionário Fixo
          </button>
        </div>
      </div>

      {/* Banner explicativo de Funcionário Fixo Recorrente */}
      <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-amber-700 shrink-0 mt-0.5" />
        <div className="text-xs text-amber-950">
          <span className="font-bold">Funcionários Fixos Recorrentes:</span> Cadastre a funcionária ou o motoboy apenas uma vez! O sistema mantém o cadastro fixo e calcula automaticamente os dias úteis, diárias, passagens e salários de todos os meses, sem que você precise recadastrar tudo a cada virada de mês.
        </div>
      </div>

      {/* Seletor de mês/ano */}
      <div className="flex flex-wrap items-end gap-3 bg-white p-3.5 rounded-xl border border-stone-200 shadow-sm">
        <div>
          <label className="block text-[10px] text-stone-400 font-bold uppercase mb-1">Mês de Referência</label>
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-semibold text-stone-800 cursor-pointer"
          >
            {MESES.map((m, i) => (
              <option key={i} value={i + 1}>{m}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] text-stone-400 font-bold uppercase mb-1">Ano</label>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-semibold text-stone-800 cursor-pointer"
          >
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
        <div className="text-xs text-stone-500 font-medium ml-auto self-center">
          Visualizando fechamento de <span className="font-bold text-stone-800">{MESES[month - 1]} de {year}</span>
        </div>
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center gap-2 bg-white rounded-2xl border border-stone-200">
          <Loader2 className="h-6 w-6 animate-spin text-amber-700" />
        </div>
      ) : (
        <>
          {/* Cards de Totais */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 text-stone-400 text-[10px] font-black uppercase tracking-wider">
                <Users className="h-4 w-4 text-stone-600" /> Equipe (Salários + Passagem)
              </div>
              <p className="mt-1 text-2xl font-black text-stone-900">{brl(costs?.totals.employeeNet ?? 0)}</p>
              <div className="mt-1 flex items-center justify-between text-[11px] text-stone-500">
                <span>Bruto: {brl(costs?.totals.employeeGross ?? 0)}</span>
                <span className="text-amber-700 font-bold">Vales: -{brl(costs?.totals.employeeAdvances ?? 0)}</span>
              </div>
            </div>

            <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 text-stone-400 text-[10px] font-black uppercase tracking-wider">
                <Award className="h-4 w-4 text-amber-600" /> Comissões Vendedores
              </div>
              <p className="mt-1 text-2xl font-black text-stone-900">{brl(costs?.totals.sellerNet ?? 0)}</p>
              <div className="mt-1 flex items-center justify-between text-[11px] text-stone-500">
                <span>Total: {brl(costs?.totals.sellerCommission ?? 0)}</span>
                <span className="text-amber-700 font-bold">Vales: -{brl(costs?.totals.sellerAdvances ?? 0)}</span>
              </div>
            </div>

            <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 text-stone-400 text-[10px] font-black uppercase tracking-wider">
                <DollarSign className="h-4 w-4 text-red-500" /> Total Adiantamentos / Vales
              </div>
              <p className="mt-1 text-2xl font-black text-red-600">{brl(costs?.totals.advancesTotal ?? 0)}</p>
              <p className="mt-1 text-[11px] text-stone-400 font-medium">Abatidos do pagamento do mês</p>
            </div>

            <div className="rounded-2xl border-2 border-amber-400 bg-amber-50/70 p-4 shadow-sm">
              <div className="flex items-center gap-2 text-amber-800 text-[10px] font-black uppercase tracking-wider">
                <Wallet className="h-4 w-4" /> Custo Líquido a Pagar no Mês
              </div>
              <p className="mt-1 text-2xl font-black text-amber-900">{brl(costs?.totals.netTotal ?? 0)}</p>
              <p className="mt-1 text-[11px] text-amber-800/80 font-medium">
                Equipe + Vendedores já descontados os vales
              </p>
            </div>
          </div>

          {/* SEÇÃO 1: Funcionários do Mês */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-stone-850 uppercase tracking-wider flex items-center gap-2">
                <Users className="h-4 w-4 text-amber-700" />
                Fechamento de Pagamentos — Funcionárias &amp; Equipe
              </h3>
              <span className="text-xs text-stone-500 font-semibold">
                Total Líquido Equipe: <strong className="text-stone-900">{brl(costs?.totals.employeeNet ?? 0)}</strong>
              </span>
            </div>

            <div className="rounded-2xl bg-white border border-stone-200 shadow-sm overflow-x-auto">
              <table className="w-full text-left text-xs whitespace-nowrap">
                <thead>
                  <tr className="border-b border-stone-200 bg-stone-50 text-stone-400 font-bold uppercase tracking-wider">
                    <th className="py-3 px-4">Funcionário</th>
                    <th className="py-3 px-4 text-center">Dias prev.</th>
                    <th className="py-3 px-4 text-center">Faltas</th>
                    <th className="py-3 px-4 text-center">Trabalhados</th>
                    <th className="py-3 px-4 text-right">Salário / Diárias</th>
                    <th className="py-3 px-4 text-right">Passagem</th>
                    <th className="py-3 px-4 text-right text-stone-500">Total Bruto</th>
                    <th className="py-3 px-4 text-right text-red-600">Adiantamentos (-)</th>
                    <th className="py-3 px-4 text-right text-amber-900 font-black">Líquido a Pagar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 font-semibold text-stone-700">
                  {(costs?.employees ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-stone-400">
                        Nenhum funcionário ativo para este mês.
                      </td>
                    </tr>
                  ) : (
                    costs!.employees.map((r) => (
                      <tr key={r.employeeId} className="hover:bg-stone-50/50">
                        <td className="py-3 px-4">
                          <span className="font-bold text-stone-850 block">{r.name}</span>
                          <span className="text-[10px] text-stone-400">
                            {r.role ? `${r.role} · ` : ''}
                            {r.payType === 'diarista' ? 'Diarista' : 'Mensalista'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center text-stone-500">{r.expectedDays}</td>
                        <td className="py-3 px-4 text-center">
                          {r.absences > 0 ? (
                            <span className="text-red-600 font-bold">{r.absences}</span>
                          ) : (
                            <span className="text-stone-400">0</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center text-stone-700">{r.workedDays}</td>
                        <td className="py-3 px-4 text-right">{brl(r.pay)}</td>
                        <td className="py-3 px-4 text-right">
                          {brl(r.transportToPay)}
                          {r.transportCreditApplied > 0 && (
                            <span className="block text-[9px] text-emerald-600 font-bold">
                              -{brl(r.transportCreditApplied)} crédito
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right text-stone-500">{brl(r.total)}</td>
                        <td className="py-3 px-4 text-right">
                          {r.advances > 0 ? (
                            <span className="font-bold text-red-600">-{brl(r.advances)}</span>
                          ) : (
                            <span className="text-stone-300">R$ 0,00</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-black text-stone-900 bg-amber-50/30">
                          {brl(r.netTotal)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-stone-400">
              * Passagem é paga adiantada com base nos dias previstos. Faltas geram crédito de passagem abatido no mês seguinte.
            </p>
          </div>

          {/* SEÇÃO 2: Vendedores & Comissões do Mês */}
          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-stone-850 uppercase tracking-wider flex items-center gap-2">
                <Award className="h-4 w-4 text-amber-700" />
                Vendedores &amp; Comissões do Mês
              </h3>
              <span className="text-xs text-stone-500 font-semibold">
                Total Líquido Vendedores: <strong className="text-stone-900">{brl(costs?.totals.sellerNet ?? 0)}</strong>
              </span>
            </div>

            <div className="rounded-2xl bg-white border border-stone-200 shadow-sm overflow-x-auto">
              <table className="w-full text-left text-xs whitespace-nowrap">
                <thead>
                  <tr className="border-b border-stone-200 bg-stone-50 text-stone-400 font-bold uppercase tracking-wider">
                    <th className="py-3 px-4">Vendedor</th>
                    <th className="py-3 px-4 text-center">Pedidos</th>
                    <th className="py-3 px-4 text-right">Total Vendido</th>
                    <th className="py-3 px-4 text-right">Comissão Direta</th>
                    <th className="py-3 px-4 text-right">Supervisão</th>
                    <th className="py-3 px-4 text-right text-stone-500">Comissão Total</th>
                    <th className="py-3 px-4 text-right text-red-600">Adiantamentos (-)</th>
                    <th className="py-3 px-4 text-right text-amber-900 font-black">Líquido a Pagar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 font-semibold text-stone-700">
                  {(costs?.sellers ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-stone-400">
                        Nenhum vendedor com movimentação ou ativo neste mês.
                      </td>
                    </tr>
                  ) : (
                    costs!.sellers.map((s) => (
                      <tr key={s.sellerId} className="hover:bg-stone-50/50">
                        <td className="py-3 px-4">
                          <span className="font-bold text-stone-850 block">{s.name}</span>
                        </td>
                        <td className="py-3 px-4 text-center text-stone-600">{s.ordersCount}</td>
                        <td className="py-3 px-4 text-right font-medium">{brl(s.salesTotal)}</td>
                        <td className="py-3 px-4 text-right">{brl(s.directCommission)}</td>
                        <td className="py-3 px-4 text-right">
                          {s.supervisorCommission > 0 ? (
                            <span className="text-amber-700 font-bold">+{brl(s.supervisorCommission)}</span>
                          ) : (
                            <span className="text-stone-300">R$ 0,00</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right text-stone-500">{brl(s.totalCommission)}</td>
                        <td className="py-3 px-4 text-right">
                          {s.advances > 0 ? (
                            <span className="font-bold text-red-600">-{brl(s.advances)}</span>
                          ) : (
                            <span className="text-stone-300">R$ 0,00</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-black text-stone-900 bg-amber-50/30">
                          {brl(s.netCommission)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* SEÇÃO 3: Adiantamentos / Vales Lançados no Mês */}
          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-stone-850 uppercase tracking-wider flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-amber-700" />
                Adiantamentos / Vales do Mês ({MESES[month - 1]} / {year})
              </h3>
              <button
                onClick={openNewAdvance}
                className="text-xs font-bold text-amber-700 hover:text-amber-800 flex items-center gap-1 cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" /> Lançar outro adiantamento
              </button>
            </div>

            <div className="rounded-2xl bg-white border border-stone-200 shadow-sm overflow-x-auto">
              <table className="w-full text-left text-xs whitespace-nowrap">
                <thead>
                  <tr className="border-b border-stone-200 bg-stone-50 text-stone-400 font-bold uppercase tracking-wider">
                    <th className="py-3 px-4">Data</th>
                    <th className="py-3 px-4">Beneficiário</th>
                    <th className="py-3 px-4 text-center">Tipo</th>
                    <th className="py-3 px-4">Motivo / Descrição</th>
                    <th className="py-3 px-4 text-right">Valor</th>
                    <th className="py-3 px-4 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 font-semibold text-stone-700">
                  {(costs?.advances ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-stone-400">
                        Nenhum adiantamento lançado para este mês.
                      </td>
                    </tr>
                  ) : (
                    costs!.advances.map((adv) => {
                      const isSeller = Boolean(adv.sellerId);
                      const name = adv.employeeName || adv.sellerName || '—';
                      return (
                        <tr key={adv.id} className="hover:bg-stone-50/50">
                          <td className="py-3 px-4 text-stone-600 font-bold">
                            {adv.date ? adv.date.split('-').reverse().join('/') : '—'}
                          </td>
                          <td className="py-3 px-4 font-bold text-stone-850">{name}</td>
                          <td className="py-3 px-4 text-center">
                            <span
                              className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                                isSeller
                                  ? 'bg-purple-100 text-purple-800'
                                  : 'bg-blue-100 text-blue-800'
                              }`}
                            >
                              {isSeller ? 'Vendedor' : 'Funcionário'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-stone-500 font-normal">{adv.reason || '—'}</td>
                          <td className="py-3 px-4 text-right font-black text-red-600">{brl(adv.amount)}</td>
                          <td className="py-3 px-4 text-center">
                            <button
                              onClick={() => handleDeleteAdvance(adv)}
                              title="Excluir Adiantamento"
                              className="p-1 text-stone-400 hover:text-red-600 cursor-pointer rounded hover:bg-stone-100"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* SEÇÃO 4: Gestão do Cadastro de Funcionários Fixos */}
          <div className="space-y-2 pt-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black text-stone-850 uppercase tracking-wider flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-amber-700" />
                  Cadastro Geral de Funcionários Fixos
                </h3>
                <p className="text-[11px] text-stone-400 font-medium">
                  Estes funcionários estão cadastrados na empresa e se repetem mês a mês.
                </p>
              </div>
              <button
                onClick={openCreate}
                className="flex items-center gap-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-800 px-3 py-1.5 text-xs font-bold cursor-pointer transition-all"
              >
                <Plus className="h-3.5 w-3.5" />
                Cadastrar Funcionário
              </button>
            </div>

            <div className="rounded-2xl bg-white border border-stone-200 shadow-sm overflow-x-auto">
              <table className="w-full text-left text-xs whitespace-nowrap">
                <thead>
                  <tr className="border-b border-stone-200 bg-stone-50 text-stone-400 font-bold uppercase tracking-wider">
                    <th className="py-3 px-4">Funcionário</th>
                    <th className="py-3 px-4">Pagamento Base</th>
                    <th className="py-3 px-4">Passagem/dia</th>
                    <th className="py-3 px-4">Dias da semana</th>
                    <th className="py-3 px-4 text-center">Situação</th>
                    <th className="py-3 px-4 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 font-semibold text-stone-700">
                  {employees.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-stone-400">
                        Cadastre o primeiro funcionário fixo.
                      </td>
                    </tr>
                  ) : (
                    employees.map((e) => (
                      <tr key={e.id} className={`hover:bg-stone-50/50 ${!e.active ? 'opacity-50' : ''}`}>
                        <td className="py-3 px-4">
                          <span className="font-bold text-stone-850 block">{e.name}</span>
                          {e.role && <span className="text-[10px] text-stone-400">{e.role}</span>}
                        </td>
                        <td className="py-3 px-4">
                          {e.payType === 'diarista'
                            ? `${brl(e.dailyRate)} / dia`
                            : `${brl(e.monthlySalary)} / mês`}
                        </td>
                        <td className="py-3 px-4">{brl(e.transportPerDay)}</td>
                        <td className="py-3 px-4">
                          <div className="flex gap-0.5">
                            {WEEKDAYS.map((w, i) => (
                              <span
                                key={i}
                                className={`inline-flex h-5 w-6 items-center justify-center rounded text-[9px] font-bold ${
                                  e.workDays.includes(i)
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-stone-100 text-stone-300'
                                }`}
                              >
                                {w[0]}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span
                            className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                              e.active
                                ? 'bg-emerald-50 text-emerald-800 border border-emerald-100'
                                : 'bg-red-50 text-red-800 border border-red-100'
                            }`}
                          >
                            {e.active ? 'ATIVO' : 'INATIVO'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => openAbsences(e)}
                              title="Lançar falta"
                              className="p-1 text-stone-400 hover:text-red-600 hover:bg-stone-50 rounded cursor-pointer"
                            >
                              <CalendarX className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => openEdit(e)}
                              title="Editar"
                              className="p-1 text-stone-400 hover:text-amber-700 hover:bg-stone-50 rounded cursor-pointer"
                            >
                              <Edit2 className="h-4 w-4" />
                            </button>
                            {e.active && (
                              <button
                                onClick={() => deactivate(e)}
                                title="Desativar"
                                className="p-1 text-stone-400 hover:text-red-600 hover:bg-stone-50 rounded cursor-pointer"
                              >
                                <Power className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Modal Novo/Editar Funcionário Fixo */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md border border-stone-200 shadow-xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
              <h3 className="font-black text-stone-900 text-sm">
                {editId ? 'Editar Funcionário Fixo' : 'Novo Funcionário Fixo (Recorrente)'}
              </h3>
              <button
                onClick={() => setShowForm(false)}
                className="p-1 text-stone-400 hover:text-stone-600 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={save} className="p-5 space-y-4 text-xs font-semibold text-stone-600">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block mb-1">Nome *</label>
                  <input
                    type="text"
                    value={fName}
                    onChange={(e) => setFName(e.target.value)}
                    required
                    placeholder="Ex.: Maria da Silva"
                    className="block w-full rounded-lg border border-stone-300 bg-stone-50 p-2.5 text-stone-900 focus:bg-white"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block mb-1">Função (ex.: Produção, Cozinha, Motoboy)</label>
                  <input
                    type="text"
                    value={fRole}
                    onChange={(e) => setFRole(e.target.value)}
                    placeholder="Ex.: Produção"
                    className="block w-full rounded-lg border border-stone-300 bg-stone-50 p-2.5 text-stone-900 focus:bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block mb-1">Tipo de pagamento</label>
                <select
                  value={fPayType}
                  onChange={(e) => setFPayType(e.target.value as 'diarista' | 'mensalista')}
                  className="block w-full rounded-lg border border-stone-300 bg-stone-50 p-2.5 text-stone-900 focus:bg-white"
                >
                  <option value="diarista">Diarista (paga por dia trabalhado)</option>
                  <option value="mensalista">Mensalista (salário fixo/mês)</option>
                </select>
              </div>

              {fPayType === 'diarista' ? (
                <div>
                  <label className="block mb-1">Valor da diária (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={fDaily}
                    onChange={(e) => setFDaily(e.target.value)}
                    className="block w-full rounded-lg border border-stone-300 bg-stone-50 p-2.5 text-stone-900 focus:bg-white"
                  />
                </div>
              ) : (
                <div>
                  <label className="block mb-1">Salário mensal (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={fSalary}
                    onChange={(e) => setFSalary(e.target.value)}
                    className="block w-full rounded-lg border border-stone-300 bg-stone-50 p-2.5 text-stone-900 focus:bg-white"
                  />
                </div>
              )}

              <div>
                <label className="block mb-1">Passagem por dia (R$) — ida e volta</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={fTransport}
                  onChange={(e) => setFTransport(e.target.value)}
                  className="block w-full rounded-lg border border-stone-300 bg-stone-50 p-2.5 text-stone-900 focus:bg-white"
                />
              </div>

              <div>
                <label className="block mb-1.5">Dias da semana que trabalha</label>
                <div className="flex flex-wrap gap-1.5">
                  {WEEKDAYS.map((w, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => toggleDay(i)}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer transition-all ${
                        fWorkDays.includes(i)
                          ? 'bg-amber-700 text-white'
                          : 'bg-stone-100 text-stone-500 hover:bg-stone-200'
                      }`}
                    >
                      {w}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-[10px] text-stone-400 font-medium">
                  Usado para contar automaticamente os dias previstos em cada mês e a passagem adiantada.
                </p>
              </div>

              <div className="flex gap-2 justify-end pt-2 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="rounded-lg border border-stone-300 px-4 py-2 text-xs font-bold text-stone-600 hover:bg-stone-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-amber-700 px-4 py-2 text-xs font-bold text-white hover:bg-amber-800 cursor-pointer disabled:opacity-50"
                >
                  {saving ? 'Salvando...' : 'Salvar Funcionário Fixo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Faltas */}
      {absEmp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md border border-stone-200 shadow-xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
              <div>
                <h3 className="font-black text-stone-900 text-sm">Faltas — {absEmp.name}</h3>
                <p className="text-[10px] text-stone-400 font-semibold uppercase">{MESES[month - 1]} / {year}</p>
              </div>
              <button
                onClick={() => setAbsEmp(null)}
                className="p-1 text-stone-400 hover:text-stone-600 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <form onSubmit={addAbsence} className="flex items-end gap-2 text-xs font-semibold text-stone-600">
                <div className="flex-1">
                  <label className="block mb-1">Data da falta</label>
                  <input
                    type="date"
                    value={absDate}
                    onChange={(e) => setAbsDate(e.target.value)}
                    required
                    className="block w-full rounded-lg border border-stone-300 bg-stone-50 p-2 text-stone-900 focus:bg-white"
                  />
                </div>
                <div className="flex-1">
                  <label className="block mb-1">Obs (opcional)</label>
                  <input
                    type="text"
                    value={absNote}
                    onChange={(e) => setAbsNote(e.target.value)}
                    className="block w-full rounded-lg border border-stone-300 bg-stone-50 p-2 text-stone-900 focus:bg-white"
                  />
                </div>
                <button
                  type="submit"
                  disabled={absSaving}
                  className="rounded-lg bg-amber-700 px-3 py-2 text-xs font-bold text-white hover:bg-amber-800 cursor-pointer disabled:opacity-50"
                >
                  {absSaving ? '...' : 'Lançar'}
                </button>
              </form>

              <div className="space-y-1.5">
                {absList.length === 0 ? (
                  <p className="text-xs text-stone-400 text-center py-4">Nenhuma falta neste mês.</p>
                ) : (
                  absList.map((a) => (
                    <div
                      key={a.id}
                      className="flex items-center justify-between rounded-lg border border-stone-150 bg-stone-50/50 px-3 py-2"
                    >
                      <div className="text-xs">
                        <span className="font-bold text-stone-800">
                          {a.date ? a.date.split('-').reverse().join('/') : '—'}
                        </span>
                        {a.note && <span className="text-stone-400"> · {a.note}</span>}
                      </div>
                      <button
                        onClick={() => removeAbsence(a.id)}
                        className="p-1 text-stone-400 hover:text-red-600 cursor-pointer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Lançar Adiantamento / Vale */}
      {showAdvanceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md border border-stone-200 shadow-xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
              <div>
                <h3 className="font-black text-stone-900 text-sm">Lançar Adiantamento / Vale</h3>
                <p className="text-[10px] text-stone-400 font-semibold">
                  O valor será descontado automaticamente no fechamento do mês
                </p>
              </div>
              <button
                onClick={() => setShowAdvanceModal(false)}
                className="p-1 text-stone-400 hover:text-stone-600 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={saveAdvance} className="p-5 space-y-4 text-xs font-semibold text-stone-600">
              {/* Tipo de Beneficiário */}
              <div>
                <label className="block mb-1.5">Quem está recebendo o adiantamento?</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setAdvType('employee');
                      const first = employees.find((e) => e.active);
                      setAdvPersonId(first ? first.id : '');
                    }}
                    className={`py-2 px-3 rounded-lg border text-center font-bold transition-all cursor-pointer ${
                      advType === 'employee'
                        ? 'border-amber-700 bg-amber-50 text-amber-900 shadow-sm'
                        : 'border-stone-200 bg-stone-50 text-stone-600 hover:bg-stone-100'
                    }`}
                  >
                    Funcionário(a)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAdvType('seller');
                      setAdvPersonId(simpleSellers.length > 0 ? simpleSellers[0].id : '');
                    }}
                    className={`py-2 px-3 rounded-lg border text-center font-bold transition-all cursor-pointer ${
                      advType === 'seller'
                        ? 'border-amber-700 bg-amber-50 text-amber-900 shadow-sm'
                        : 'border-stone-200 bg-stone-50 text-stone-600 hover:bg-stone-100'
                    }`}
                  >
                    Vendedor(a)
                  </button>
                </div>
              </div>

              {/* Seleção do Nome */}
              <div>
                <label className="block mb-1">
                  Selecione o(a) {advType === 'employee' ? 'Funcionário(a)' : 'Vendedor(a)'} *
                </label>
                {advType === 'employee' ? (
                  <select
                    value={advPersonId}
                    onChange={(e) => setAdvPersonId(e.target.value)}
                    required
                    className="block w-full rounded-lg border border-stone-300 bg-stone-50 p-2.5 text-stone-900 focus:bg-white"
                  >
                    <option value="">Selecione...</option>
                    {employees
                      .filter((e) => e.active)
                      .map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.name} {e.role ? `(${e.role})` : ''}
                        </option>
                      ))}
                  </select>
                ) : (
                  <select
                    value={advPersonId}
                    onChange={(e) => setAdvPersonId(e.target.value)}
                    required
                    className="block w-full rounded-lg border border-stone-300 bg-stone-50 p-2.5 text-stone-900 focus:bg-white"
                  >
                    <option value="">Selecione...</option>
                    {simpleSellers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Data e Valor */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block mb-1">Data do adiantamento *</label>
                  <input
                    type="date"
                    value={advDate}
                    onChange={(e) => setAdvDate(e.target.value)}
                    required
                    className="block w-full rounded-lg border border-stone-300 bg-stone-50 p-2.5 text-stone-900 focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block mb-1">Valor (R$) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="0,00"
                    value={advAmount}
                    onChange={(e) => setAdvAmount(e.target.value)}
                    required
                    className="block w-full rounded-lg border border-stone-300 bg-stone-50 p-2.5 text-stone-900 focus:bg-white"
                  />
                </div>
              </div>

              {/* Motivo */}
              <div>
                <label className="block mb-1">Motivo / Observação (opcional)</label>
                <input
                  type="text"
                  placeholder="Ex.: Vale quinzena, emergência médica, etc."
                  value={advReason}
                  onChange={(e) => setAdvReason(e.target.value)}
                  className="block w-full rounded-lg border border-stone-300 bg-stone-50 p-2.5 text-stone-900 focus:bg-white"
                />
              </div>

              <div className="flex gap-2 justify-end pt-3 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setShowAdvanceModal(false)}
                  className="rounded-lg border border-stone-300 px-4 py-2 text-xs font-bold text-stone-600 hover:bg-stone-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={advSaving}
                  className="rounded-lg bg-amber-700 px-4 py-2 text-xs font-bold text-white hover:bg-amber-800 cursor-pointer disabled:opacity-50"
                >
                  {advSaving ? 'Lançando...' : 'Confirmar Adiantamento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
