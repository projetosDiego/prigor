'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { ExternalLink, Loader2, MessageSquare, Send } from 'lucide-react';

import { errorMessage } from '@/lib/errors';
import { api, Field, inputCls, Toggle } from './parts';

interface SmsSettings {
  smsRequired: boolean;
  hasApiKey: boolean;
  apiKeyHint: string | null;
  fromEnv: boolean;
  smsDailyLimit: number;
  sentToday: number;
  testMode: boolean;
}

export default function SettingsTab() {
  const [cfg, setCfg] = useState<SmsSettings | null>(null);
  const [required, setRequired] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [limit, setLimit] = useState('300');
  const [saving, setSaving] = useState(false);
  const [testPhone, setTestPhone] = useState('');
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<{ ok: boolean; message: string } | null>(null);

  const apply = (c: SmsSettings) => {
    setCfg(c);
    setRequired(c.smsRequired);
    setLimit(String(c.smsDailyLimit));
    setApiKey('');
  };

  const load = useCallback(async () => {
    try {
      apply(await api<SmsSettings>('/api/clube/config'));
    } catch (err: unknown) {
      alert(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      apply(
        await api<SmsSettings>('/api/clube/config', {
          method: 'PUT',
          body: { smsRequired: required, smsDailyLimit: Number(limit) || 300, ...(apiKey.trim() ? { smsApiKey: apiKey.trim() } : {}) },
        }),
      );
    } catch (err: unknown) {
      alert(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    setTestMsg(null);
    try {
      setTestMsg(await api<{ ok: boolean; message: string }>('/api/clube/config/teste', { body: { phone: testPhone } }));
    } catch (err: unknown) {
      setTestMsg({ ok: false, message: errorMessage(err) });
    } finally {
      setTesting(false);
    }
  };

  if (!cfg) return <Loader2 className="h-5 w-5 animate-spin text-stone-400" />;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <form onSubmit={save} className="rounded-xl border border-stone-200 bg-white p-5 space-y-4">
        <h3 className="flex items-center gap-2 text-sm font-black text-stone-900">
          <MessageSquare className="h-4 w-4 text-amber-700" /> Confirmação do celular por SMS
        </h3>
        <p className="text-xs text-stone-500">
          Com a confirmação ligada (padrão), o cliente recebe um código de 6 números por SMS e só conclui o cadastro e vê o prêmio depois de digitar o código. Se o SMS falhar, o cadastro pausa: nunca passa sem confirmar. Também
          libera o &quot;Esqueci meu PIN&quot; pelo SMS, sem você precisar gerar PIN.
        </p>

        <div className={`rounded-lg p-3 text-xs font-semibold ${cfg.hasApiKey ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>
          {cfg.hasApiKey
            ? `Chave da SMSDev cadastrada (${cfg.apiKeyHint})${cfg.fromEnv ? ' — vem do servidor' : ''}.`
            : cfg.testMode
              ? 'Sem chave da SMSDev: modo teste no seu PC (o código aparece na tela, nenhum SMS é enviado).'
              : 'Sem chave da SMSDev: o SMS está desligado.'}
          {' '}Enviados hoje: {cfg.sentToday} de {cfg.smsDailyLimit}.
        </div>

        {cfg.smsRequired && !cfg.hasApiKey && !cfg.testMode && (
          <div className="rounded-lg bg-red-50 p-3 text-xs font-bold text-red-700">
            Atenção: a confirmação está exigida, mas não há chave da SMSDev. Os cadastros estão PAUSADOS até você cadastrar a chave.
          </div>
        )}
        {!cfg.fromEnv && (
          <Field label={cfg.hasApiKey ? 'Trocar a chave da SMSDev' : 'Chave da API da SMSDev'} hint="No painel da SMSDev: menu API → sua chave (KEY).">
            <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} className={inputCls} placeholder="Cole a chave aqui" autoComplete="off" />
          </Field>
        )}
        <Field label="Limite de SMS por dia" hint="Trava de segurança contra abuso. Cada SMS custa uns R$ 0,08–0,09.">
          <input value={limit} onChange={(e) => setLimit(e.target.value.replace(/\D/g, ''))} inputMode="numeric" className={`${inputCls} w-32`} />
        </Field>
        <Toggle checked={required} onChange={setRequired} label="Exigir código SMS no cadastro" />

        <button disabled={saving} className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-amber-700 py-2.5 text-sm font-bold text-white disabled:opacity-60">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />} Salvar
        </button>
      </form>

      <div className="space-y-4">
        <div className="rounded-xl border border-stone-200 bg-white p-5 space-y-3">
          <h3 className="text-sm font-black text-stone-900">Testar envio</h3>
          <p className="text-xs text-stone-500">Manda um SMS de teste para conferir a chave e o saldo.</p>
          <div className="flex gap-2">
            <input value={testPhone} onChange={(e) => setTestPhone(e.target.value)} inputMode="tel" className={inputCls} placeholder="(21) 98765-4321" />
            <button
              type="button"
              onClick={() => void test()}
              disabled={testing || !cfg.hasApiKey}
              className="flex items-center gap-1.5 rounded-lg bg-stone-800 px-4 text-xs font-bold text-white disabled:opacity-40"
            >
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Enviar
            </button>
          </div>
          {testMsg && <p className={`text-xs font-semibold ${testMsg.ok ? 'text-emerald-700' : 'text-red-600'}`}>{testMsg.message}</p>}
        </div>

        <div className="rounded-xl border border-stone-200 bg-white p-5 space-y-2 text-xs text-stone-600">
          <h3 className="text-sm font-black text-stone-900">Como pegar a chave da SMSDev</h3>
          <ol className="list-decimal space-y-1 pl-4">
            <li>Crie a conta no site da SMSDev (cadastro com CNPJ ou CPF).</li>
            <li>Compre créditos. Comece com um pacote pequeno para testar.</li>
            <li>No painel, abra o menu <b>API</b> e copie a sua <b>chave (KEY)</b>.</li>
            <li>Cole aqui, salve e use &quot;Testar envio&quot; com o seu celular.</li>
            <li>Chegou? Ligue &quot;Exigir código SMS no cadastro&quot;.</li>
          </ol>
          <a href="https://www.smsdev.com.br" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-bold text-amber-700">
            smsdev.com.br <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
    </div>
  );
}
