'use client';

/**
 * Configuração fiscal da empresa (emitente da NF-e), padrões do boleto e
 * situação das integrações (Sicoob e provedor de nota fiscal).
 * Leitura: gerência. Salvar: só administrador (a API recusa os demais).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Landmark, Loader2, Receipt, Save, XCircle } from 'lucide-react';

import { useToast } from '@/components/shared/Toast';
import { apiErrorMessage, errorMessage } from '@/lib/errors';

interface FiscalSettings {
  cnpj: string | null;
  ie: string | null;
  legalName: string | null;
  tradeName: string | null;
  crt: number;
  address: string | null;
  number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  cityIbgeCode: string | null;
  state: string | null;
  zipCode: string | null;
  phone: string | null;
  email: string | null;
  nfeSeries: number;
  nfeEnvironment: string;
  defaultCfopInState: string | null;
  defaultCfopOutState: string | null;
  defaultCsosn: string | null;
  invoiceForConsumers: boolean;
  boletoInstructions: string | null;
  boletoFinePct: number | null;
  boletoInterestPct: number | null;
}

interface IntegrationStatus {
  billingEnabled: boolean;
  sicoob: { environment: string; ready: boolean; missing: string[] };
  fiscal: { provider: string | null; environment: string; ready: boolean; missing: string[] };
}

type Form = Record<keyof FiscalSettings, string | boolean>;

const TEXT_FIELDS: Array<{ key: keyof FiscalSettings; label: string; placeholder?: string; span?: number }> = [
  { key: 'legalName', label: 'Razão social', span: 2 },
  { key: 'tradeName', label: 'Nome fantasia' },
  { key: 'cnpj', label: 'CNPJ', placeholder: 'só números' },
  { key: 'ie', label: 'Inscrição Estadual' },
  { key: 'phone', label: 'Telefone' },
  { key: 'email', label: 'E-mail' },
  { key: 'zipCode', label: 'CEP', placeholder: 'só números' },
  { key: 'address', label: 'Endereço', span: 2 },
  { key: 'number', label: 'Número' },
  { key: 'complement', label: 'Complemento' },
  { key: 'neighborhood', label: 'Bairro' },
  { key: 'city', label: 'Cidade' },
  { key: 'state', label: 'UF', placeholder: 'RJ' },
  { key: 'cityIbgeCode', label: 'Código IBGE da cidade', placeholder: 'Rio = 3304557' },
];

const FISCAL_FIELDS: Array<{ key: keyof FiscalSettings; label: string; placeholder?: string }> = [
  { key: 'defaultCfopInState', label: 'CFOP padrão (dentro do RJ)', placeholder: 'ex.: 5101' },
  { key: 'defaultCfopOutState', label: 'CFOP padrão (fora do RJ)', placeholder: 'ex.: 6101' },
  { key: 'defaultCsosn', label: 'CSOSN padrão', placeholder: 'ex.: 102' },
  { key: 'crt', label: 'CRT', placeholder: '4 = MEI' },
  { key: 'nfeSeries', label: 'Série da NF-e', placeholder: '1' },
];

function toForm(s: FiscalSettings): Form {
  const f = {} as Form;
  for (const [k, v] of Object.entries(s)) {
    f[k as keyof FiscalSettings] = typeof v === 'boolean' ? v : v == null ? '' : String(v);
  }
  return f;
}

function Status({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-bold ${ok ? 'text-emerald-700' : 'text-stone-500'}`}>
      {ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
      {label}
    </span>
  );
}

export default function FiscalSettingsPage() {
  const { toast } = useToast();
  const [form, setForm] = useState<Form | null>(null);
  const [status, setStatus] = useState<IntegrationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/settings/fiscal');
      const data: unknown = await res.json();
      if (!res.ok) throw new Error(apiErrorMessage(data, 'Erro ao carregar a configuração fiscal.'));
      const d = data as { settings: FiscalSettings; integrations: IntegrationStatus };
      setForm(toForm(d.settings));
      setStatus(d.integrations);
    } catch (err: unknown) {
      toast(errorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const set = (key: keyof FiscalSettings, value: string | boolean) =>
    setForm((f) => (f ? { ...f, [key]: value } : f));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    try {
      const str = (k: keyof FiscalSettings) => (String(form[k] ?? '').trim() === '' ? null : String(form[k]).trim());
      const payload = {
        cnpj: str('cnpj'), ie: str('ie'), legalName: str('legalName'), tradeName: str('tradeName'),
        crt: Number(form.crt) || 4,
        address: str('address'), number: str('number'), complement: str('complement'),
        neighborhood: str('neighborhood'), city: str('city'), cityIbgeCode: str('cityIbgeCode'),
        state: str('state'), zipCode: str('zipCode'), phone: str('phone'), email: str('email'),
        nfeSeries: Number(form.nfeSeries) || 1,
        nfeEnvironment: form.nfeEnvironment,
        defaultCfopInState: str('defaultCfopInState'), defaultCfopOutState: str('defaultCfopOutState'),
        defaultCsosn: str('defaultCsosn'),
        invoiceForConsumers: Boolean(form.invoiceForConsumers),
        boletoInstructions: str('boletoInstructions'),
        boletoFinePct: str('boletoFinePct'), boletoInterestPct: str('boletoInterestPct'),
      };
      const res = await fetch('/api/settings/fiscal', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data: unknown = await res.json();
      if (!res.ok) throw new Error(apiErrorMessage(data, 'Erro ao salvar.'));
      setForm(toForm(data as FiscalSettings));
      toast('Configuração fiscal salva.', 'success');
    } catch (err: unknown) {
      toast(errorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !form) {
    return (
      <div className="flex items-center justify-center p-12 text-stone-400">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  const input = 'w-full px-3 py-2 rounded-lg border border-stone-200 bg-stone-50/50 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500';
  const label = 'text-[10px] text-stone-400 font-bold uppercase tracking-wider block mb-1';

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-black text-stone-900 flex items-center gap-2">
          <Receipt className="h-5 w-5 text-amber-600" /> Configuração Fiscal
        </h1>
        <p className="text-xs text-stone-500 mt-1">
          Dados da empresa para a nota fiscal e padrões do boleto. Valores fiscais (CFOP, CSOSN, CRT) devem ser confirmados com o contador.
        </p>
      </div>

      {status && (
        <div className="grid md:grid-cols-2 gap-3">
          <div className="rounded-xl border border-stone-200 bg-white p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm flex items-center gap-2"><Landmark className="h-4 w-4 text-amber-600" /> Boletos — Sicoob</span>
              <span className="text-[10px] font-bold uppercase text-stone-400">{status.sicoob.environment === 'production' ? 'Produção' : 'Ambiente de testes'}</span>
            </div>
            <Status ok={status.sicoob.ready} label={status.sicoob.ready ? 'Pronto' : 'Pendente'} />
            {status.sicoob.missing.length > 0 && (
              <ul className="text-[11px] text-stone-500 list-disc pl-4">{status.sicoob.missing.map((m) => <li key={m}>{m}</li>)}</ul>
            )}
          </div>
          <div className="rounded-xl border border-stone-200 bg-white p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm flex items-center gap-2"><Receipt className="h-4 w-4 text-amber-600" /> Nota fiscal</span>
              <span className="text-[10px] font-bold uppercase text-stone-400">{status.fiscal.environment === 'producao' ? 'Produção' : 'Homologação'}</span>
            </div>
            <Status ok={status.fiscal.ready} label={status.fiscal.ready ? `Pronto (${status.fiscal.provider})` : 'Pendente'} />
            {status.fiscal.missing.length > 0 && (
              <ul className="text-[11px] text-stone-500 list-disc pl-4">{status.fiscal.missing.map((m) => <li key={m}>{m}</li>)}</ul>
            )}
          </div>
        </div>
      )}

      <form onSubmit={save} className="space-y-5">
        <section className="rounded-xl border border-stone-200 bg-white p-4">
          <h2 className="text-xs font-black text-amber-700 uppercase tracking-widest mb-3">Empresa (emitente)</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {TEXT_FIELDS.map((f) => (
              <div key={f.key} className={f.span === 2 ? 'md:col-span-2' : ''}>
                <label className={label}>{f.label}</label>
                <input className={input} placeholder={f.placeholder} value={String(form[f.key] ?? '')} onChange={(e) => set(f.key, e.target.value)} />
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-stone-200 bg-white p-4">
          <h2 className="text-xs font-black text-amber-700 uppercase tracking-widest mb-3">Nota fiscal</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {FISCAL_FIELDS.map((f) => (
              <div key={f.key}>
                <label className={label}>{f.label}</label>
                <input className={input} placeholder={f.placeholder} value={String(form[f.key] ?? '')} onChange={(e) => set(f.key, e.target.value)} />
              </div>
            ))}
            <div>
              <label className={label}>Ambiente</label>
              <select className={input} value={String(form.nfeEnvironment)} onChange={(e) => set('nfeEnvironment', e.target.value)}>
                <option value="homologacao">Homologação (teste)</option>
                <option value="producao">Produção</option>
              </select>
            </div>
            <label className="md:col-span-3 flex items-center gap-2 text-xs text-stone-700">
              <input type="checkbox" className="accent-amber-600" checked={Boolean(form.invoiceForConsumers)} onChange={(e) => set('invoiceForConsumers', e.target.checked)} />
              Permitir NF para consumidor pessoa física (CPF)
            </label>
          </div>
        </section>

        <section className="rounded-xl border border-stone-200 bg-white p-4">
          <h2 className="text-xs font-black text-amber-700 uppercase tracking-widest mb-3">Boleto</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className={label}>Multa por atraso (%)</label>
              <input className={input} placeholder="ex.: 2" value={String(form.boletoFinePct ?? '')} onChange={(e) => set('boletoFinePct', e.target.value)} />
            </div>
            <div>
              <label className={label}>Juros ao mês (%)</label>
              <input className={input} placeholder="ex.: 1" value={String(form.boletoInterestPct ?? '')} onChange={(e) => set('boletoInterestPct', e.target.value)} />
            </div>
            <div className="md:col-span-3">
              <label className={label}>Mensagem impressa no boleto</label>
              <textarea rows={2} className={input} value={String(form.boletoInstructions ?? '')} onChange={(e) => set('boletoInstructions', e.target.value)} />
            </div>
          </div>
        </section>

        <div className="flex justify-end">
          <button type="submit" disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-bold disabled:opacity-60">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar
          </button>
        </div>
      </form>
    </div>
  );
}
