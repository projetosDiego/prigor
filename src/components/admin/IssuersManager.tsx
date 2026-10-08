'use client';

/**
 * Empresas emissoras (CNPJs) — cadastro e situação das integrações de cada uma.
 * Ver: services/issuers.ts. Credenciais ficam no servidor (variáveis EMPRESA_<prefixo>_...).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Building2, CheckCircle2, Loader2, Pencil, Plus, Search, Star, X, XCircle } from 'lucide-react';

import { useToast } from '@/components/shared/Toast';
import { apiErrorMessage, errorMessage } from '@/lib/errors';

interface Issuer {
  id: string;
  name: string;
  legalName: string;
  tradeName: string | null;
  cnpj: string;
  ie: string | null;
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
  configPrefix: string;
  isDefault: boolean;
  active: boolean;
  annualLimit: number;
  integrations: {
    invoice: { ready: boolean; environment: string; missing: string[] };
    boleto: { ready: boolean; enabled: boolean; missing: string[] };
    sampleVar: string;
  };
}

type Form = Omit<Issuer, 'id' | 'integrations' | 'annualLimit'> & { id?: string; annualLimit: string };

const EMPTY: Form = {
  name: '', legalName: '', tradeName: '', cnpj: '', ie: '', address: '', number: '', complement: '',
  neighborhood: '', city: '', cityIbgeCode: '', state: 'RJ', zipCode: '', phone: '', email: '',
  configPrefix: '', isDefault: false, active: true, annualLimit: '81000',
};

const fmtCnpj = (c: string) => c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function Line({ ok, label, missing }: { ok: boolean; label: string; missing: string[] }) {
  return (
    <div className="text-[11px]">
      <span className={`inline-flex items-center gap-1 font-bold ${ok ? 'text-emerald-700' : 'text-stone-500'}`}>
        {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />} {label}
      </span>
      {!ok && missing.length > 0 && <span className="text-stone-400"> — falta {missing.join(', ')}</span>}
    </div>
  );
}

export default function IssuersManager() {
  const { toast } = useToast();
  const [issuers, setIssuers] = useState<Issuer[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);
  const [lookup, setLookup] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/issuers?todas=1');
      const data: unknown = await res.json();
      if (!res.ok) throw new Error(apiErrorMessage(data, 'Erro ao carregar as empresas.'));
      setIssuers((data as { data: Issuer[] }).data ?? []);
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  const edit = (i: Issuer) =>
    setForm({
      ...i,
      tradeName: i.tradeName ?? '', ie: i.ie ?? '', address: i.address ?? '', number: i.number ?? '',
      complement: i.complement ?? '', neighborhood: i.neighborhood ?? '', city: i.city ?? '',
      cityIbgeCode: i.cityIbgeCode ?? '', state: i.state ?? '', zipCode: i.zipCode ?? '', phone: i.phone ?? '',
      email: i.email ?? '', annualLimit: String(i.annualLimit),
    });

  const consultCnpj = async () => {
    if (!form) return;
    const cnpj = form.cnpj.replace(/\D/g, '');
    if (cnpj.length !== 14) return toast('Digite o CNPJ completo (14 números).', 'error');
    setLookup(true);
    try {
      const res = await fetch(`/api/tools/cnpj?cnpj=${cnpj}`);
      const d = (await res.json()) as Record<string, string | null | boolean>;
      if (!res.ok || !d.razao_social) throw new Error(apiErrorMessage(d, 'CNPJ não encontrado.'));
      setForm((f) =>
        f
          ? {
              ...f,
              legalName: String(d.razao_social ?? f.legalName),
              tradeName: String(d.nome_fantasia ?? f.tradeName ?? ''),
              address: String(d.logradouro ?? ''),
              number: String(d.numero ?? ''),
              complement: String(d.complemento ?? ''),
              neighborhood: String(d.bairro ?? ''),
              city: String(d.municipio ?? ''),
              state: String(d.uf ?? ''),
              zipCode: String(d.cep ?? ''),
              phone: String(d.ddd_telefone_1 ?? f.phone ?? ''),
              ie: d.inscricao_estadual ? String(d.inscricao_estadual) : f.ie,
            }
          : f,
      );
      toast(d.inscricao_estadual ? 'Dados e IE preenchidos.' : 'Dados preenchidos. Confira a IE.', 'success');
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setLookup(false);
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    try {
      const n = (v: string | null | undefined) => (v == null || String(v).trim() === '' ? null : String(v).trim());
      const payload = {
        name: form.name.trim(), legalName: form.legalName.trim(), tradeName: n(form.tradeName),
        cnpj: form.cnpj, ie: n(form.ie), address: n(form.address), number: n(form.number),
        complement: n(form.complement), neighborhood: n(form.neighborhood), city: n(form.city),
        cityIbgeCode: n(form.cityIbgeCode), state: n(form.state), zipCode: n(form.zipCode),
        phone: n(form.phone), email: n(form.email), configPrefix: form.configPrefix.trim(),
        isDefault: form.isDefault, active: form.active, annualLimit: form.annualLimit || '81000',
      };
      const res = await fetch(form.id ? `/api/settings/issuers/${form.id}` : '/api/settings/issuers', {
        method: form.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data: unknown = await res.json();
      if (!res.ok) throw new Error(apiErrorMessage(data, 'Erro ao salvar a empresa.'));
      toast('Empresa salva.', 'success');
      setForm(null);
      await load();
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const input = 'w-full px-3 py-2 rounded-lg border border-stone-200 bg-stone-50/50 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500';
  const label = 'text-[10px] text-stone-400 font-bold uppercase tracking-wider block mb-1';
  const field = (k: keyof Form, l: string, opts: { placeholder?: string; span?: boolean } = {}) => (
    <div className={opts.span ? 'md:col-span-2' : ''}>
      <label className={label}>{l}</label>
      <input
        className={input}
        placeholder={opts.placeholder}
        value={String(form?.[k] ?? '')}
        onChange={(e) => set(k, e.target.value as never)}
      />
    </div>
  );

  return (
    <section className="rounded-xl border border-stone-200 bg-white p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-xs font-black text-amber-700 uppercase tracking-widest flex items-center gap-1.5">
            <Building2 className="h-4 w-4" /> Empresas emissoras (CNPJ)
          </h2>
          <p className="text-[11px] text-stone-500">Cada pedido escolhe por qual CNPJ sai a nota e o boleto.</p>
        </div>
        <button
          type="button"
          onClick={() => setForm({ ...EMPTY })}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-stone-900 text-white text-xs font-bold cursor-pointer"
        >
          <Plus className="h-4 w-4" /> Adicionar empresa
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-6 text-stone-400"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : issuers.length === 0 ? (
        <p className="text-sm text-stone-500">Nenhuma empresa cadastrada. Adicione a principal (o CNPJ que já emite).</p>
      ) : (
        <div className="grid md:grid-cols-2 gap-3">
          {issuers.map((i) => (
            <div key={i.id} className={`rounded-xl border p-3 space-y-2 ${i.active ? 'border-stone-200' : 'border-dashed border-stone-300 opacity-60'}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-black text-stone-800 flex items-center gap-1.5">
                    {i.name}
                    {i.isDefault && <span className="inline-flex items-center gap-0.5 text-[9px] font-black uppercase text-amber-700 bg-amber-100 rounded-full px-1.5 py-0.5"><Star className="h-2.5 w-2.5" /> padrão</span>}
                    {!i.active && <span className="text-[9px] font-black uppercase text-stone-500 bg-stone-100 rounded-full px-1.5 py-0.5">inativa</span>}
                  </p>
                  <p className="text-[11px] text-stone-500 truncate">{i.legalName}</p>
                  <p className="text-[11px] text-stone-500">
                    {fmtCnpj(i.cnpj)} · IE {i.ie || '—'} · {[i.city, i.state].filter(Boolean).join('/') || 'sem endereço'}
                  </p>
                </div>
                <button type="button" onClick={() => edit(i)} className="p-1.5 rounded-lg border border-stone-200 hover:bg-stone-50 cursor-pointer" title="Editar">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </div>
              <Line
                ok={i.integrations.invoice.ready}
                label={`Nota fiscal${i.integrations.invoice.ready ? (i.integrations.invoice.environment === 'producao' ? ' — produção' : ' — homologação (teste)') : ''}`}
                missing={i.integrations.invoice.missing}
              />
              <Line
                ok={i.integrations.boleto.ready}
                label={i.integrations.boleto.enabled ? 'Boleto Sicoob' : 'Boleto Sicoob (desligado)'}
                missing={i.integrations.boleto.missing}
              />
              <p className="text-[10px] text-stone-400">
                Limite anual: {brl(i.annualLimit)} · Configuração no servidor:{' '}
                {i.configPrefix ? <code>EMPRESA_{i.configPrefix}_…</code> : 'variáveis principais'}
              </p>
            </div>
          ))}
        </div>
      )}

      {form && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setForm(null)}>
          <form
            onSubmit={save}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5 space-y-3"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-black text-stone-800">{form.id ? `Editar ${form.name}` : 'Nova empresa emissora'}</h3>
              <button type="button" onClick={() => setForm(null)} className="p-1.5 rounded-lg hover:bg-stone-100 cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid md:grid-cols-2 gap-3">
              {field('name', 'Apelido (aparece no faturamento)', { placeholder: 'ex.: Priscilla' })}
              <div>
                <label className={label}>CNPJ</label>
                <div className="flex gap-2">
                  <input className={input} placeholder="só números" value={form.cnpj} onChange={(e) => set('cnpj', e.target.value)} />
                  <button type="button" onClick={consultCnpj} disabled={lookup} className="shrink-0 inline-flex items-center gap-1 px-3 rounded-lg border border-stone-300 text-xs font-bold hover:bg-stone-50 cursor-pointer disabled:opacity-50">
                    {lookup ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />} Consultar
                  </button>
                </div>
              </div>
              {field('legalName', 'Razão social', { span: true })}
              {field('tradeName', 'Nome fantasia')}
              {field('ie', 'Inscrição Estadual')}
              {field('phone', 'Telefone')}
              {field('email', 'E-mail')}
              {field('zipCode', 'CEP', { placeholder: 'só números' })}
              {field('address', 'Endereço')}
              {field('number', 'Número')}
              {field('complement', 'Complemento')}
              {field('neighborhood', 'Bairro')}
              {field('city', 'Cidade')}
              {field('state', 'UF', { placeholder: 'RJ' })}
              {field('cityIbgeCode', 'Código IBGE da cidade', { placeholder: 'Rio = 3304557' })}
              {field('annualLimit', 'Limite anual de faturamento (R$)', { placeholder: '81000' })}
              <div>
                <label className={label}>Prefixo da configuração no servidor</label>
                <input
                  className={input}
                  placeholder="vazio = principal; ex.: PRISCILLA"
                  value={form.configPrefix}
                  onChange={(e) => set('configPrefix', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                />
                <span className="text-[10px] text-stone-400">
                  {form.configPrefix ? `Variáveis EMPRESA_${form.configPrefix}_SICOOB_CLIENT_ID, …` : 'Usa as variáveis principais (SICOOB_…, FISCAL_…).'}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap gap-4 text-xs">
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="accent-amber-600" checked={form.isDefault} onChange={(e) => set('isDefault', e.target.checked)} />
                Empresa padrão
              </label>
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="accent-amber-600" checked={form.active} onChange={(e) => set('active', e.target.checked)} />
                Ativa
              </label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setForm(null)} className="px-4 py-2 rounded-lg border border-stone-200 text-sm font-bold cursor-pointer">Cancelar</button>
              <button type="submit" disabled={saving} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-bold disabled:opacity-60 cursor-pointer">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />} Salvar
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
