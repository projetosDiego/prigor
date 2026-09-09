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

interface MonthlyRow {
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

interface MonthlyCosts {
  year: number;
  month: number;
  employees: MonthlyRow[];
  totals: { pay: number; transport: number; total: number };
}

const brl = (n: number) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function CostsPage() {
  const { toast, confirm } = useToast();
  const now = new Date();

  const [employees, setEmployees] = useState<Employee[]>([]);
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

  const loadEmployees = useCallback(async () => {
    const res = await fetch('/api/employees?activeOnly=false');
    if (res.ok) {
      const d = (await res.json()) as { data?: Employee[] };
      setEmployees(d.data ?? []);
    }
  }, []);

  const loadCosts = useCallback(async () => {
    const res = await fetch(`/api/costs/monthly?year=${year}&month=${month}`);
    if (res.ok) setCosts((await res.json()) as MonthlyCosts);
  }, [year, month]);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      await Promise.all([loadEmployees(), loadCosts()]);
      setLoading(false);
    })();
  }, [loadEmployees, loadCosts]);

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
      toast(editId ? 'Funcionário atualizado.' : 'Funcionário cadastrado.', 'success');
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
      message: `Desativar "${e.name}"? Ele deixa de entrar no cálculo do mês, mas o histórico é mantido.`,
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

  const years = [now.getUTCFullYear() - 1, now.getUTCFullYear(), now.getUTCFullYear() + 1];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-black text-stone-900 tracking-tight flex items-center gap-2">
            <Users className="h-6 w-6 text-amber-700" />
            Custos &amp; Equipe
          </h2>
          <p className="text-xs text-stone-500 font-medium">
            Funcionárias, motoboy e diaristas — cálculo automático de pagamento e passagem por mês.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 rounded-lg bg-amber-700 hover:bg-amber-800 text-white px-4 py-2 text-xs font-bold cursor-pointer transition-all"
        >
          <Plus className="h-4 w-4" />
          Novo Funcionário
        </button>
      </div>

      {/* Seletor de mês + totais */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-[10px] text-stone-400 font-bold uppercase mb-1">Mês</label>
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-semibold text-stone-800"
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
            className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-semibold text-stone-800"
          >
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center gap-2 bg-white rounded-2xl border border-stone-200">
          <Loader2 className="h-6 w-6 animate-spin text-amber-700" />
        </div>
      ) : (
        <>
          {/* Cards de total */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-2xl border border-stone-200 bg-white p-4">
              <div className="flex items-center gap-2 text-stone-400 text-[10px] font-black uppercase tracking-wider">
                <Wallet className="h-4 w-4" /> Pagamentos
              </div>
              <p className="mt-1 text-2xl font-black text-stone-900">{brl(costs?.totals.pay ?? 0)}</p>
            </div>
            <div className="rounded-2xl border border-stone-200 bg-white p-4">
              <div className="flex items-center gap-2 text-stone-400 text-[10px] font-black uppercase tracking-wider">
                <Bus className="h-4 w-4" /> Passagem (a pagar no início)
              </div>
              <p className="mt-1 text-2xl font-black text-stone-900">{brl(costs?.totals.transport ?? 0)}</p>
            </div>
            <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
              <div className="flex items-center gap-2 text-amber-700 text-[10px] font-black uppercase tracking-wider">
                Custo total do mês
              </div>
              <p className="mt-1 text-2xl font-black text-amber-800">{brl(costs?.totals.total ?? 0)}</p>
            </div>
          </div>

          {/* Tabela de cálculo do mês */}
          <div className="rounded-2xl bg-white border border-stone-200 shadow-sm overflow-x-auto">
            <table className="w-full text-left text-xs whitespace-nowrap">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50 text-stone-400 font-bold uppercase tracking-wider">
                  <th className="py-3 px-4">Funcionário</th>
                  <th className="py-3 px-4 text-center">Dias prev.</th>
                  <th className="py-3 px-4 text-center">Faltas</th>
                  <th className="py-3 px-4 text-center">Trabalhados</th>
                  <th className="py-3 px-4 text-right">Pagamento</th>
                  <th className="py-3 px-4 text-right">Passagem</th>
                  <th className="py-3 px-4 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 font-semibold text-stone-700">
                {(costs?.employees ?? []).length === 0 ? (
                  <tr><td colSpan={7} className="py-8 text-center text-stone-400">Nenhum funcionário ativo.</td></tr>
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
                        {r.absences > 0 ? <span className="text-red-600 font-bold">{r.absences}</span> : <span className="text-stone-400">0</span>}
                      </td>
                      <td className="py-3 px-4 text-center text-stone-700">{r.workedDays}</td>
                      <td className="py-3 px-4 text-right">{brl(r.pay)}</td>
                      <td className="py-3 px-4 text-right">
                        {brl(r.transportToPay)}
                        {r.transportCreditApplied > 0 && (
                          <span className="block text-[9px] text-emerald-600 font-bold">-{brl(r.transportCreditApplied)} crédito</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-black text-stone-900">{brl(r.total)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-stone-400">
            Passagem é paga adiantada com base nos dias previstos. Faltas geram crédito de passagem
            que é abatido automaticamente no mês seguinte.
          </p>

          {/* Lista de funcionários (cadastro) */}
          <div className="rounded-2xl bg-white border border-stone-200 shadow-sm overflow-x-auto">
            <table className="w-full text-left text-xs whitespace-nowrap">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50 text-stone-400 font-bold uppercase tracking-wider">
                  <th className="py-3 px-4">Funcionário</th>
                  <th className="py-3 px-4">Pagamento</th>
                  <th className="py-3 px-4">Passagem/dia</th>
                  <th className="py-3 px-4">Dias da semana</th>
                  <th className="py-3 px-4 text-center">Situação</th>
                  <th className="py-3 px-4 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 font-semibold text-stone-700">
                {employees.length === 0 ? (
                  <tr><td colSpan={6} className="py-8 text-center text-stone-400">Cadastre o primeiro funcionário.</td></tr>
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
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${e.active ? 'bg-emerald-50 text-emerald-800 border border-emerald-100' : 'bg-red-50 text-red-800 border border-red-100'}`}>
                          {e.active ? 'ATIVO' : 'INATIVO'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button onClick={() => openAbsences(e)} title="Lançar falta" className="p-1 text-stone-400 hover:text-red-600 hover:bg-stone-50 rounded cursor-pointer"><CalendarX className="h-4 w-4" /></button>
                          <button onClick={() => openEdit(e)} title="Editar" className="p-1 text-stone-400 hover:text-amber-700 hover:bg-stone-50 rounded cursor-pointer"><Edit2 className="h-4 w-4" /></button>
                          {e.active && (
                            <button onClick={() => deactivate(e)} title="Desativar" className="p-1 text-stone-400 hover:text-red-600 hover:bg-stone-50 rounded cursor-pointer"><Power className="h-4 w-4" /></button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Modal funcionário */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md border border-stone-200 shadow-xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
              <h3 className="font-black text-stone-900 text-sm">{editId ? 'Editar Funcionário' : 'Novo Funcionário'}</h3>
              <button onClick={() => setShowForm(false)} className="p-1 text-stone-400 hover:text-stone-600 cursor-pointer"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={save} className="p-5 space-y-4 text-xs font-semibold text-stone-600">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block mb-1">Nome *</label>
                  <input type="text" value={fName} onChange={(e) => setFName(e.target.value)} required
                    className="block w-full rounded-lg border border-stone-300 bg-stone-50 p-2.5 text-stone-900 focus:bg-white" />
                </div>
                <div className="col-span-2">
                  <label className="block mb-1">Função (ex.: Produção, Motoboy)</label>
                  <input type="text" value={fRole} onChange={(e) => setFRole(e.target.value)}
                    className="block w-full rounded-lg border border-stone-300 bg-stone-50 p-2.5 text-stone-900 focus:bg-white" />
                </div>
              </div>

              <div>
                <label className="block mb-1">Tipo de pagamento</label>
                <select value={fPayType} onChange={(e) => setFPayType(e.target.value as 'diarista' | 'mensalista')}
                  className="block w-full rounded-lg border border-stone-300 bg-stone-50 p-2.5 text-stone-900 focus:bg-white">
                  <option value="diarista">Diarista (paga por dia trabalhado)</option>
                  <option value="mensalista">Mensalista (salário fixo/mês)</option>
                </select>
              </div>

              {fPayType === 'diarista' ? (
                <div>
                  <label className="block mb-1">Valor da diária (R$)</label>
                  <input type="number" step="0.01" min="0" value={fDaily} onChange={(e) => setFDaily(e.target.value)}
                    className="block w-full rounded-lg border border-stone-300 bg-stone-50 p-2.5 text-stone-900 focus:bg-white" />
                </div>
              ) : (
                <div>
                  <label className="block mb-1">Salário mensal (R$)</label>
                  <input type="number" step="0.01" min="0" value={fSalary} onChange={(e) => setFSalary(e.target.value)}
                    className="block w-full rounded-lg border border-stone-300 bg-stone-50 p-2.5 text-stone-900 focus:bg-white" />
                </div>
              )}

              <div>
                <label className="block mb-1">Passagem por dia (R$) — ida e volta</label>
                <input type="number" step="0.01" min="0" value={fTransport} onChange={(e) => setFTransport(e.target.value)}
                  className="block w-full rounded-lg border border-stone-300 bg-stone-50 p-2.5 text-stone-900 focus:bg-white" />
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
                <p className="mt-1 text-[10px] text-stone-400 font-medium">Usado para contar os dias previstos no mês e a passagem.</p>
              </div>

              <div className="flex gap-2 justify-end pt-2 border-t border-stone-100">
                <button type="button" onClick={() => setShowForm(false)} className="rounded-lg border border-stone-300 px-4 py-2 text-xs font-bold text-stone-600 hover:bg-stone-50 cursor-pointer">Cancelar</button>
                <button type="submit" disabled={saving} className="rounded-lg bg-amber-700 px-4 py-2 text-xs font-bold text-white hover:bg-amber-800 cursor-pointer disabled:opacity-50">{saving ? 'Salvando...' : 'Salvar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal faltas */}
      {absEmp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md border border-stone-200 shadow-xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
              <div>
                <h3 className="font-black text-stone-900 text-sm">Faltas — {absEmp.name}</h3>
                <p className="text-[10px] text-stone-400 font-semibold uppercase">{MESES[month - 1]} / {year}</p>
              </div>
              <button onClick={() => setAbsEmp(null)} className="p-1 text-stone-400 hover:text-stone-600 cursor-pointer"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <form onSubmit={addAbsence} className="flex items-end gap-2 text-xs font-semibold text-stone-600">
                <div className="flex-1">
                  <label className="block mb-1">Data da falta</label>
                  <input type="date" value={absDate} onChange={(e) => setAbsDate(e.target.value)} required
                    className="block w-full rounded-lg border border-stone-300 bg-stone-50 p-2 text-stone-900 focus:bg-white" />
                </div>
                <div className="flex-1">
                  <label className="block mb-1">Obs (opcional)</label>
                  <input type="text" value={absNote} onChange={(e) => setAbsNote(e.target.value)}
                    className="block w-full rounded-lg border border-stone-300 bg-stone-50 p-2 text-stone-900 focus:bg-white" />
                </div>
                <button type="submit" disabled={absSaving} className="rounded-lg bg-amber-700 px-3 py-2 text-xs font-bold text-white hover:bg-amber-800 cursor-pointer disabled:opacity-50">
                  {absSaving ? '...' : 'Lançar'}
                </button>
              </form>

              <div className="space-y-1.5">
                {absList.length === 0 ? (
                  <p className="text-xs text-stone-400 text-center py-4">Nenhuma falta neste mês.</p>
                ) : (
                  absList.map((a) => (
                    <div key={a.id} className="flex items-center justify-between rounded-lg border border-stone-150 bg-stone-50/50 px-3 py-2">
                      <div className="text-xs">
                        <span className="font-bold text-stone-800">
                          {a.date ? a.date.split('-').reverse().join('/') : '—'}
                        </span>
                        {a.note && <span className="text-stone-400"> · {a.note}</span>}
                      </div>
                      <button onClick={() => removeAbsence(a.id)} className="p-1 text-stone-400 hover:text-red-600 cursor-pointer"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
