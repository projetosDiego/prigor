'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Clock,
  Copy,
  Gift,
  Loader2,
  LogOut,
  MessageCircle,
  Share2,
  Sparkles,
  Star,
  Store,
  Trophy,
  X,
} from 'lucide-react';

import { apiErrorMessage, errorMessage } from '@/lib/errors';
import { prigorWhatsappLink, type ClubeMember, type ClubeReward, type ClubeTask } from '@/lib/clube';

interface Props {
  /** Ponto do QR escaneado; null quando o cliente abriu /clube direto. */
  point: { name: string; code: string } | null;
  initialMember: ClubeMember | null;
  /** Código de indicação vindo do link do amigo (?ref=). */
  referralCode?: string | null;
  sms: SmsConfig;
}

interface SmsConfig {
  /** Cadastro exige código SMS. */
  smsRequired: boolean;
  /** Dá para recuperar o PIN por SMS. */
  smsAvailable: boolean;
}

interface CodeResponse {
  required: boolean;
  sentTo?: string;
  devCode?: string;
}

/** Mesma regra do servidor, só para avisar antes de gastar um SMS. */
function pinIssue(pin: string): string | null {
  if (!/^\d{4}$/.test(pin)) return 'O PIN deve ter 4 números.';
  if (/^(\d)\1{3}$/.test(pin)) return 'Evite números repetidos (ex.: 1111).';
  if ('0123456789'.includes(pin) || '9876543210'.includes(pin)) return 'Evite sequências (ex.: 1234).';
  return null;
}

const LIVE_SECONDS = 180;
type Tab = 'premios' | 'ganhar' | 'trocar';

// ─── utilidades ─────────────────────────────────────────────────────────────

function maskPhone(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d ? `(${d}` : '';
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function timeSP(date: Date, withSeconds = false): string {
  return date.toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    ...(withSeconds ? { second: '2-digit' } : {}),
  });
}

function dateSP(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' });
}

async function postJson<T>(url: string, body: unknown, fallback: string): Promise<T> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const json: unknown = await res.json();
  if (!res.ok) throw Object.assign(new Error(apiErrorMessage(json, fallback)), { status: res.status });
  return json as T;
}

/** Reduz o print para no máx. 1280 px em JPEG — fica leve para enviar no 4G. */
async function compressImage(file: File): Promise<{ base64: string; mime: string }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
  return { base64: dataUrl.split(',')[1] ?? '', mime: 'image/jpeg' };
}

const inputCls =
  'mt-1 w-full rounded-xl border border-stone-200 px-4 py-3 text-base outline-none focus:border-[#B77A45] bg-white';

// ─── raiz ───────────────────────────────────────────────────────────────────

export default function ClubeClient({ point, initialMember, referralCode, sms }: Props) {
  const [member, setMember] = useState<ClubeMember | null>(initialMember);
  const [clockOffset, setClockOffset] = useState(() =>
    initialMember ? new Date(initialMember.serverNow).getTime() - Date.now() : 0,
  );
  const [celebrate, setCelebrate] = useState<string | null>(null);
  const [liveDismissed, setLiveDismissed] = useState<string | null>(null);

  const updateMember = (m: ClubeMember | null) => {
    setMember(m);
    if (m) setClockOffset(new Date(m.serverNow).getTime() - Date.now());
  };

  const liveReward = member?.rewards.find((r) => r.liveSecondsLeft > 0 && r.redeemedAt && r.id !== liveDismissed);

  if (member && liveReward) {
    return (
      <LiveScreen reward={liveReward} memberName={member.firstName} clockOffset={clockOffset} onDone={() => setLiveDismissed(liveReward.id)} />
    );
  }

  return (
    <main className="min-h-screen bg-[#FAF7F1] text-[#24130F]">
      <header className="bg-[#24130F] px-5 pt-7 pb-10 text-center text-white rounded-b-[2rem] shadow-lg">
        <Image src="/logo.png" alt="Doces Prigor" width={532} height={469} priority className="mx-auto h-14 w-auto" />
        <h1 className="mt-2 text-2xl font-black tracking-tight">Clube Prigor</h1>
        {point ? (
          <p className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-[#F3E9D8]">
            <Store className="h-3.5 w-3.5" /> {point.name}
          </p>
        ) : (
          <p className="mt-1 text-sm text-[#F3E9D8]/80">Brownie de presente para quem é da casa</p>
        )}
      </header>

      <div className="mx-auto -mt-6 max-w-md px-4 pb-10 space-y-4">
        {member ? (
          <MemberArea member={member} point={point} onUpdate={updateMember} />
        ) : (
          <AuthArea
            point={point}
            sms={sms}
            referralCode={referralCode ?? null}
            onSignup={(m, prize) => {
              updateMember(m);
              setCelebrate(prize);
            }}
            onLogin={updateMember}
          />
        )}
        <p className="text-center text-[11px] text-stone-400">
          Doces Prigor · brownies artesanais do Rio · seus dados ficam só com a Prigor
        </p>
      </div>

      {celebrate && <Celebration prize={celebrate} hasPoint={!!point} onClose={() => setCelebrate(null)} />}
    </main>
  );
}

// ─── cadastro / login ───────────────────────────────────────────────────────

function AuthArea({
  point,
  sms,
  referralCode,
  onSignup,
  onLogin,
}: {
  point: Props['point'];
  sms: SmsConfig;
  referralCode: string | null;
  onSignup: (m: ClubeMember, prizeTitle: string) => void;
  onLogin: (m: ClubeMember) => void;
}) {
  const [mode, setMode] = useState<'cadastro' | 'login'>('cadastro');
  return (
    <div className="rounded-3xl bg-white p-5 shadow-xl shadow-[#24130F]/5 space-y-4">
      <div className="grid grid-cols-2 gap-1 rounded-full bg-stone-100 p-1 text-sm font-bold">
        {(['cadastro', 'login'] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`rounded-full py-2 transition-all ${mode === m ? 'bg-[#24130F] text-white shadow' : 'text-stone-500'}`}
          >
            {m === 'cadastro' ? 'Quero participar' : 'Já sou do Clube'}
          </button>
        ))}
      </div>
      {mode === 'cadastro' ? (
        <SignupForm point={point} sms={sms} referralCode={referralCode} onDone={onSignup} onGoLogin={() => setMode('login')} />
      ) : (
        <LoginForm sms={sms} onDone={onLogin} />
      )}
    </div>
  );
}

function SignupForm({
  point,
  sms,
  referralCode,
  onDone,
  onGoLogin,
}: {
  point: Props['point'];
  sms: SmsConfig;
  referralCode: string | null;
  onDone: (m: ClubeMember, prizeTitle: string) => void;
  onGoLogin: () => void;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [pin, setPin] = useState('');
  const [consent, setConsent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alreadyRegistered, setAlreadyRegistered] = useState(false);

  const [codeStep, setCodeStep] = useState<CodeResponse | null>(null);
  const [smsCode, setSmsCode] = useState('');

  const createMember = async (code: string | null) => {
    const json = await postJson<{ member: ClubeMember; prizeTitle: string }>(
      '/api/public/clube/cadastro',
      { name, phone, neighborhood, pin, marketingConsent: consent, pointCode: point?.code ?? null, referralCode, smsCode: code },
      'Não foi possível concluir o cadastro.',
    );
    onDone(json.member, json.prizeTitle);
  };

  const run = async (fn: () => Promise<void>) => {
    setSaving(true);
    setError(null);
    setAlreadyRegistered(false);
    try {
      await fn();
    } catch (err: unknown) {
      if ((err as { status?: number }).status === 409) setAlreadyRegistered(true);
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const sendCode = () =>
    run(async () => {
      const res = await postJson<CodeResponse>('/api/public/clube/codigo', { phone, purpose: 'cadastro' }, 'Não foi possível enviar o código.');
      if (!res.required) return createMember(null);
      setCodeStep(res);
    });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const issue = pinIssue(pin);
    if (issue) {
      setError(issue);
      return;
    }
    if (sms.smsRequired) await sendCode();
    else await run(() => createMember(null));
  };

  if (codeStep) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(() => createMember(smsCode));
        }}
        className="space-y-4"
      >
        <div className="rounded-2xl bg-[#F3E9D8] p-4 text-center">
          <p className="text-base font-black">Confirme seu celular</p>
          <p className="text-xs text-stone-600 mt-1">
            Enviamos um código por SMS para <b>{codeStep.sentTo}</b>.
          </p>
          {codeStep.devCode && <p className="mt-2 text-[11px] font-bold text-amber-700">Modo teste (sem SMS): código {codeStep.devCode}</p>}
        </div>
        <input
          value={smsCode}
          onChange={(e) => setSmsCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          required
          className={`${inputCls} text-center text-2xl font-black tracking-[0.5em]`}
          placeholder="••••••"
        />
        {error && <p className="rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-700">{error}</p>}
        <button
          type="submit"
          disabled={saving || smsCode.length !== 6}
          className="w-full rounded-full bg-[#24130F] py-4 text-base font-black text-white shadow-lg disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />} Confirmar e ver meu prêmio
        </button>
        <ResendButton onResend={sendCode} />
        <button type="button" onClick={() => setCodeStep(null)} className="block w-full text-center text-xs font-bold text-stone-500 underline">
          Corrigir o número
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="flex items-start gap-3 rounded-2xl bg-[#F3E9D8] p-4">
        <Gift className="h-8 w-8 shrink-0 text-[#B77A45]" />
        <div>
          <p className="text-base font-black leading-tight">Cadastre-se e ganhe um prêmio</p>
          <p className="text-xs text-stone-600 mt-1">
            Brownie de presente, compre 1 leve 2… e tem até <b>bolsa térmica e copo Prigor</b> no sorteio!
          </p>
        </div>
      </div>
      {referralCode && (
        <p className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
          🎁 Um amigo te indicou! Cadastre-se e use seu cupom num ponto Prigor.
        </p>
      )}

      <label className="block">
        <span className="text-xs font-bold text-stone-600">Seu nome</span>
        <input value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" className={inputCls} placeholder="Como podemos te chamar?" />
      </label>
      <label className="block">
        <span className="text-xs font-bold text-stone-600">WhatsApp</span>
        <input
          value={phone}
          onChange={(e) => setPhone(maskPhone(e.target.value))}
          required
          inputMode="tel"
          autoComplete="tel-national"
          className={inputCls}
          placeholder="(21) 98765-4321"
        />
      </label>
      <label className="block">
        <span className="text-xs font-bold text-stone-600">Crie um PIN de 4 números</span>
        <input
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
          required
          inputMode="numeric"
          type="password"
          autoComplete="new-password"
          className={`${inputCls} tracking-[0.6em] text-center font-black`}
          placeholder="••••"
        />
        <span className="text-[11px] text-stone-400">Você usa o celular + PIN para entrar no Clube em qualquer aparelho.</span>
      </label>
      <label className="block">
        <span className="text-xs font-bold text-stone-600">
          Bairro <span className="font-normal text-stone-400">(opcional)</span>
        </span>
        <input value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} className={inputCls} placeholder="Onde você mora?" />
      </label>
      <label className="flex items-start gap-3 rounded-xl bg-stone-50 p-3 cursor-pointer">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-5 w-5 accent-[#B77A45]" />
        <span className="text-xs text-stone-600">
          Quero receber no WhatsApp as promoções de <b>Natal, Páscoa</b> e ofertas exclusivas do Clube. Posso sair quando quiser.
        </span>
      </label>

      {error && (
        <div className="rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-700 space-y-2">
          <p>{error}</p>
          {alreadyRegistered && (
            <button type="button" onClick={onGoLogin} className="font-bold text-[#24130F] underline">
              Entrar com celular e PIN
            </button>
          )}
        </div>
      )}

      <button
        type="submit"
        disabled={saving}
        className="w-full rounded-full bg-[#24130F] py-4 text-base font-black text-white shadow-lg active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-2"
      >
        {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
        Quero meu prêmio
      </button>
    </form>
  );
}

function ResendButton({ onResend }: { onResend: () => Promise<void> }) {
  const [wait, setWait] = useState(60);
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);
  return (
    <button
      type="button"
      disabled={wait > 0}
      onClick={() => {
        setWait(60);
        void onResend();
      }}
      className="block w-full text-center text-xs font-bold text-stone-500 disabled:text-stone-300"
    >
      {wait > 0 ? `Reenviar código em ${wait}s` : 'Não chegou? Reenviar código'}
    </button>
  );
}

function LoginForm({ sms, onDone }: { sms: SmsConfig; onDone: (m: ClubeMember) => void }) {
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forgot, setForgot] = useState<'off' | 'phone' | 'code'>('off');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState<CodeResponse | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err: unknown) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const sendCode = () =>
    run(async () => {
      const res = await postJson<CodeResponse>('/api/public/clube/codigo', { phone, purpose: 'pin' }, 'Não foi possível enviar o código.');
      setSent(res);
      setForgot('code');
    });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (forgot === 'phone') return void sendCode();
    if (forgot === 'code') {
      const issue = pinIssue(pin);
      if (issue) return setError(issue);
      return void run(async () => {
        const json = await postJson<{ member: ClubeMember }>('/api/public/clube/pin/redefinir', { phone, code, pin }, 'Não foi possível criar o PIN.');
        onDone(json.member);
      });
    }
    void run(async () => {
      const json = await postJson<{ member: ClubeMember }>('/api/public/clube/login', { phone, pin }, 'Não foi possível entrar.');
      onDone(json.member);
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {forgot !== 'off' && (
        <div className="rounded-2xl bg-[#F3E9D8] p-3 text-center text-xs text-stone-700">
          {forgot === 'phone' ? (
            'Vamos mandar um código por SMS para você criar um PIN novo.'
          ) : (
            <>
              Se este celular for do Clube, enviamos um código para <b>{sent?.sentTo}</b>.
              {sent?.devCode && <span className="block font-bold text-amber-700">Modo teste (sem SMS): código {sent.devCode}</span>}
            </>
          )}
        </div>
      )}
      <label className="block">
        <span className="text-xs font-bold text-stone-600">WhatsApp cadastrado</span>
        <input
          value={phone}
          onChange={(e) => setPhone(maskPhone(e.target.value))}
          required
          readOnly={forgot === 'code'}
          inputMode="tel"
          className={inputCls}
          placeholder="(21) 98765-4321"
        />
      </label>
      {forgot === 'code' && (
        <label className="block">
          <span className="text-xs font-bold text-stone-600">Código do SMS</span>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            required
            inputMode="numeric"
            autoComplete="one-time-code"
            className={`${inputCls} text-center font-black tracking-[0.4em]`}
            placeholder="••••••"
          />
        </label>
      )}
      {forgot !== 'phone' && (
        <label className="block">
          <span className="text-xs font-bold text-stone-600">{forgot === 'code' ? 'Novo PIN (4 números)' : 'PIN'}</span>
          <input
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
            required
            inputMode="numeric"
            type="password"
            autoComplete={forgot === 'code' ? 'new-password' : 'current-password'}
            className={`${inputCls} tracking-[0.6em] text-center font-black`}
            placeholder="••••"
          />
        </label>
      )}
      {error && <p className="rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-700">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-full bg-[#24130F] py-4 text-base font-black text-white shadow-lg disabled:opacity-60 flex items-center justify-center gap-2"
      >
        {busy && <Loader2 className="h-5 w-5 animate-spin" />}
        {forgot === 'phone' ? 'Enviar código por SMS' : forgot === 'code' ? 'Criar PIN e entrar' : 'Entrar'}
      </button>
      {forgot === 'code' && <ResendButton onResend={sendCode} />}
      {forgot === 'off' ? (
        sms.smsAvailable ? (
          <button type="button" onClick={() => setForgot('phone')} className="block w-full text-center text-xs font-bold text-stone-500 underline">
            Esqueci meu PIN
          </button>
        ) : (
          <a
            href={prigorWhatsappLink(`Oi, Prigor! Esqueci meu PIN do Clube. Meu WhatsApp é ${phone || '...'}.`)}
            className="block text-center text-xs font-bold text-stone-500 underline"
          >
            Esqueci meu PIN
          </a>
        )
      ) : (
        <button
          type="button"
          onClick={() => {
            setForgot('off');
            setCode('');
            setError(null);
          }}
          className="block w-full text-center text-xs font-bold text-stone-500 underline"
        >
          Voltar para o login
        </button>
      )}
    </form>
  );
}

function Celebration({ prize, hasPoint, onClose }: { prize: string; hasPoint: boolean; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#24130F]/80 p-6 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-2xl space-y-3 animate-[clubePop_.4s_ease-out]" onClick={(e) => e.stopPropagation()}>
        <style>{`@keyframes clubePop { from { transform: scale(.7); opacity: 0 } to { transform: scale(1); opacity: 1 } }`}</style>
        <div className="text-5xl">🎉</div>
        <p className="text-xs font-black uppercase tracking-widest text-[#B77A45]">Você ganhou</p>
        <p className="text-2xl font-black leading-tight text-[#24130F]">{prize}</p>
        <p className="text-sm text-stone-600">
          {hasPoint
            ? 'Quando for comprar, toque em "Usar agora" e mostre a tela para o atendente.'
            : 'Use em qualquer ponto Prigor: escaneie o QR Code do balcão e toque em "Usar agora".'}
        </p>
        <button onClick={onClose} className="w-full rounded-full bg-[#24130F] py-3.5 text-base font-black text-white">
          Ver meu prêmio
        </button>
      </div>
    </div>
  );
}

// ─── área do membro ─────────────────────────────────────────────────────────

function MemberArea({ member, point, onUpdate }: { member: ClubeMember; point: Props['point']; onUpdate: (m: ClubeMember | null) => void }) {
  const [tab, setTab] = useState<Tab>('premios');
  const available = member.rewards.filter((r) => r.status === 'disponivel').length;

  const logout = async () => {
    await fetch('/api/public/clube/sair', { method: 'POST' });
    onUpdate(null);
  };

  return (
    <>
      <div className="rounded-3xl bg-white p-5 shadow-xl shadow-[#24130F]/5 flex items-center justify-between">
        <div>
          <p className="text-lg font-black">Oi, {member.firstName}! 👋</p>
          <p className="text-xs text-stone-500">{member.phone}</p>
        </div>
        <button onClick={() => setTab('trocar')} className="rounded-2xl bg-[#F3E9D8] px-4 py-2 text-center">
          <p className="text-2xl font-black leading-none text-[#24130F]">{member.points}</p>
          <p className="text-[10px] font-bold uppercase tracking-wider text-[#B77A45]">pontos</p>
        </button>
      </div>

      {!member.hasPin && <CreatePinCard onUpdate={onUpdate} />}

      <div className="grid grid-cols-3 gap-1 rounded-full bg-white p-1 text-xs font-bold shadow-sm">
        {(
          [
            ['premios', `Prêmios${available ? ` (${available})` : ''}`],
            ['ganhar', 'Ganhar pontos'],
            ['trocar', 'Trocar'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`rounded-full py-2.5 transition-all ${tab === key ? 'bg-[#24130F] text-white shadow' : 'text-stone-500'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'premios' && (
        <div className="space-y-3">
          {member.rewards.length === 0 && (
            <p className="rounded-3xl bg-white p-6 text-center text-sm text-stone-500">
              Nenhum prêmio ainda. Complete tarefas em <b>Ganhar pontos</b> e troque por brownies!
            </p>
          )}
          {member.rewards.map((r) => (
            <RewardCard key={r.id} reward={r} point={point} serverNow={member.serverNow} onUpdate={onUpdate} />
          ))}
        </div>
      )}
      {tab === 'ganhar' && <EarnTab member={member} onUpdate={onUpdate} />}
      {tab === 'trocar' && <ExchangeTab member={member} onUpdate={onUpdate} onDone={() => setTab('premios')} />}

      <div className="flex gap-2">
        <a
          href={prigorWhatsappLink(`Oi, Prigor! Sou ${member.firstName}, do Clube (${member.phone}). `)}
          className="flex-1 flex items-center justify-center gap-2 rounded-full border-2 border-[#24130F] bg-white py-3 text-sm font-bold"
        >
          <MessageCircle className="h-4 w-4" /> Falar com a Prigor
        </a>
        <button onClick={() => void logout()} className="flex items-center gap-1.5 rounded-full px-4 text-xs font-bold text-stone-500">
          <LogOut className="h-4 w-4" /> Sair
        </button>
      </div>
    </>
  );
}

function CreatePinCard({ onUpdate }: { onUpdate: (m: ClubeMember) => void }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    try {
      const json = await postJson<{ member: ClubeMember }>('/api/public/clube/pin', { pin }, 'Não foi possível salvar o PIN.');
      onUpdate(json.member);
    } catch (err: unknown) {
      setError(errorMessage(err));
    }
  };
  return (
    <div className="rounded-3xl border-2 border-dashed border-[#B77A45] bg-white p-4 space-y-2">
      <p className="text-sm font-black">Crie seu PIN para entrar de qualquer celular</p>
      <div className="flex gap-2">
        <input
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
          inputMode="numeric"
          type="password"
          className="flex-1 rounded-xl border border-stone-200 px-3 py-2 text-center font-black tracking-[0.5em]"
          placeholder="••••"
        />
        <button onClick={() => void save()} className="rounded-xl bg-[#24130F] px-4 text-sm font-bold text-white">
          Salvar
        </button>
      </div>
      {error && <p className="text-xs font-semibold text-red-600">{error}</p>}
    </div>
  );
}

// ─── prêmios ────────────────────────────────────────────────────────────────

function RewardCard({
  reward,
  point,
  serverNow,
  onUpdate,
}: {
  reward: ClubeReward;
  point: Props['point'];
  serverNow: string;
  onUpdate: (m: ClubeMember) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const expired = !!reward.expiresAt && new Date(reward.expiresAt).getTime() < new Date(serverNow).getTime();

  const redeem = async () => {
    if (!point) return;
    setSending(true);
    setError(null);
    try {
      const json = await postJson<{ member: ClubeMember }>(
        '/api/public/clube/resgatar',
        { rewardId: reward.id, pointCode: point.code },
        'Não foi possível usar o cupom.',
      );
      onUpdate(json.member);
    } catch (err: unknown) {
      setError(errorMessage(err));
      setConfirming(false);
    } finally {
      setSending(false);
    }
  };

  if (reward.status !== 'disponivel') {
    return (
      <div className="rounded-3xl bg-white/70 p-5 border border-stone-200">
        <p className="text-sm font-bold text-stone-500 line-through">{reward.title}</p>
        <p className="text-xs text-stone-500 mt-1">
          Usado{reward.redeemPointName ? ` em ${reward.redeemPointName}` : ''}
          {reward.redeemedAt ? ` às ${timeSP(new Date(reward.redeemedAt))} de ${dateSP(reward.redeemedAt)}` : ''}
        </p>
      </div>
    );
  }

  const wrongPoint = !!point && !!reward.reservedPointName && reward.reservedPointName !== point.name;

  return (
    <div className="rounded-3xl bg-gradient-to-br from-[#382019] to-[#24130F] p-5 text-white shadow-xl space-y-3">
      <div className="flex items-center gap-3">
        <div className="rounded-2xl bg-[#B99A65]/20 p-2.5">
          {reward.source === 'pontos' ? <Trophy className="h-7 w-7 text-[#E8C99A]" /> : <Gift className="h-7 w-7 text-[#E8C99A]" />}
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#E8C99A]">
            {reward.source === 'pontos' ? 'Troca de pontos' : reward.source === 'segunda_via' ? 'Segunda via' : 'Seu prêmio'}
          </p>
          <p className="text-lg font-black leading-tight">{reward.title}</p>
        </div>
      </div>
      {reward.description && <p className="text-xs text-[#F3E9D8]/80">{reward.description}</p>}

      {(reward.reservedPointName || reward.expiresAt) && (
        <div className="flex flex-wrap gap-2 text-[11px] font-semibold">
          {reward.reservedPointName && (
            <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1">
              <Store className="h-3 w-3" /> Retirar em {reward.reservedPointName}
            </span>
          )}
          {reward.expiresAt && (
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 ${expired ? 'bg-red-500/30' : 'bg-white/10'}`}>
              <Clock className="h-3 w-3" /> {expired ? 'Prazo vencido' : `Válido até ${dateSP(reward.expiresAt)}`}
            </span>
          )}
        </div>
      )}

      {reward.requiresCheck && !expired && (
        <p className="flex items-start gap-2 rounded-2xl bg-amber-400/20 p-3 text-xs font-semibold text-amber-100">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Antes de usar, pergunte no balcão se o brinde está disponível.
        </p>
      )}

      {expired && (
        <a
          href={prigorWhatsappLink(`Oi, Prigor! Meu prêmio "${reward.title}" do Clube venceu. Consigo uma segunda via?`)}
          className="block rounded-full bg-white py-3 text-center text-sm font-black text-[#24130F]"
        >
          Pedir segunda via no WhatsApp
        </a>
      )}

      {!expired && !point && (
        <p className="rounded-2xl bg-white/10 p-3 text-xs text-[#F3E9D8]">
          <b>Como usar:</b> no ponto de venda Prigor, escaneie o QR Code do balcão e toque em &quot;Usar agora&quot;.
        </p>
      )}

      {!expired && point && wrongPoint && (
        <p className="rounded-2xl bg-white/10 p-3 text-xs text-[#F3E9D8]">
          Este brinde está reservado para <b>{reward.reservedPointName}</b>. Retire lá.
        </p>
      )}

      {!expired && point && !wrongPoint && !confirming && (
        <button onClick={() => setConfirming(true)} className="w-full rounded-full bg-[#E8C99A] py-4 text-base font-black text-[#24130F] active:scale-[0.98]">
          Usar agora em {point.name}
        </button>
      )}

      {!expired && point && confirming && (
        <div className="rounded-2xl bg-white p-4 text-[#24130F] space-y-3">
          <p className="text-sm font-bold">{reward.requiresCheck ? 'O atendente confirmou que tem o brinde?' : 'Está no balcão, pronto para comprar?'}</p>
          <p className="text-xs text-stone-600">
            O prêmio vale <b>uma vez</b>. Toque em confirmar e mostre a tela verde para o atendente.
          </p>
          <div className="flex gap-2">
            <button onClick={() => setConfirming(false)} className="flex-1 rounded-full border border-stone-300 py-3 text-sm font-bold">
              Agora não
            </button>
            <button
              onClick={() => void redeem()}
              disabled={sending}
              className="flex-1 rounded-full bg-emerald-600 py-3 text-sm font-black text-white flex items-center justify-center gap-1.5 disabled:opacity-60"
            >
              {sending && <Loader2 className="h-4 w-4 animate-spin" />} Confirmar
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-xl bg-red-500/20 p-3 text-xs font-semibold text-red-100 space-y-1">
          <p>{error}</p>
          <a href={prigorWhatsappLink(`Oi, Prigor! Tive um problema para usar meu prêmio "${reward.title}" do Clube: ${error}`)} className="underline">
            Abrir chamado no WhatsApp
          </a>
        </div>
      )}
    </div>
  );
}

// ─── ganhar pontos ──────────────────────────────────────────────────────────

function EarnTab({ member, onUpdate }: { member: ClubeMember; onUpdate: (m: ClubeMember) => void }) {
  const referralTask = member.tasks.find((t) => t.proof === 'indicacao');
  const printTasks = member.tasks.filter((t) => t.proof === 'print');
  return (
    <div className="space-y-3">
      {referralTask && member.referralCode && <ReferralCard task={referralTask} code={member.referralCode} credited={member.referralsCredited} />}
      {printTasks.map((t) => (
        <TaskCard key={t.id} task={t} onUpdate={onUpdate} />
      ))}
      <p className="text-center text-[11px] text-stone-400">Os prints são conferidos pela equipe Prigor em até 24 horas.</p>
    </div>
  );
}

function ReferralCard({ task, code, credited }: { task: ClubeTask; code: string; credited: number }) {
  const [copied, setCopied] = useState(false);
  const link = typeof window !== 'undefined' ? `${window.location.origin}/clube?ref=${code}` : `/clube?ref=${code}`;
  const text = `Entrei no Clube Prigor e ganhei brownie! Se cadastra pelo meu link e ganha um prêmio também: ${link}`;
  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Clube Prigor', text });
        return;
      } catch {
        /* cancelado */
      }
    }
    window.location.href = `https://wa.me/?text=${encodeURIComponent(text)}`;
  };
  return (
    <div className="rounded-3xl bg-gradient-to-br from-[#B77A45] to-[#8a5a30] p-5 text-white shadow-xl space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-lg font-black leading-tight">{task.title}</p>
        <span className="rounded-full bg-white/20 px-3 py-1 text-sm font-black">+{task.points}</span>
      </div>
      <p className="text-xs text-white/90">{task.description}</p>
      <div className="flex gap-2">
        <button onClick={() => void share()} className="flex-1 flex items-center justify-center gap-2 rounded-full bg-white py-3 text-sm font-black text-[#24130F]">
          <Share2 className="h-4 w-4" /> Compartilhar
        </button>
        <button
          onClick={() => {
            void navigator.clipboard.writeText(link);
            setCopied(true);
          }}
          className="flex items-center gap-1.5 rounded-full bg-white/20 px-4 text-xs font-bold"
        >
          <Copy className="h-4 w-4" /> {copied ? 'Copiado!' : 'Copiar'}
        </button>
      </div>
      {credited > 0 && <p className="text-[11px] font-semibold text-white/90">✓ {credited} amigo(s) já te deram pontos</p>}
    </div>
  );
}

function TaskCard({ task, onUpdate }: { task: ClubeTask; onUpdate: (m: ClubeMember) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pickFile = (f: File | null) => {
    if (preview) URL.revokeObjectURL(preview);
    setFile(f);
    setPreview(f ? URL.createObjectURL(f) : null);
  };

  const send = async () => {
    if (!file) return;
    setSending(true);
    setError(null);
    try {
      const { base64, mime } = await compressImage(file);
      const json = await postJson<{ member: ClubeMember }>(
        `/api/public/clube/tarefas/${task.id}`,
        { imageBase64: base64, mime, note },
        'Não foi possível enviar o print.',
      );
      pickFile(null);
      onUpdate(json.member);
    } catch (err: unknown) {
      setError(errorMessage(err));
    } finally {
      setSending(false);
    }
  };

  const badge =
    task.state === 'em_analise' ? (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-700">
        <Clock className="h-3 w-3" /> Em análise
      </span>
    ) : task.state === 'concluida' ? (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
        <CheckCircle2 className="h-3 w-3" /> Concluída
      </span>
    ) : task.state === 'aguarde' && task.nextAt ? (
      <span className="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-bold text-stone-500">De novo em {dateSP(task.nextAt)}</span>
    ) : null;

  return (
    <div className={`rounded-3xl bg-white p-5 shadow-sm space-y-3 ${task.state !== 'disponivel' ? 'opacity-80' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-black leading-tight">{task.title}</p>
          {task.description && <p className="text-xs text-stone-500 mt-1">{task.description}</p>}
        </div>
        <span className="shrink-0 rounded-full bg-[#F3E9D8] px-3 py-1 text-sm font-black text-[#24130F]">+{task.points}</span>
      </div>
      {badge}
      {task.state === 'disponivel' && task.lastRejectedNote && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">Último envio recusado: {task.lastRejectedNote}</p>
      )}

      {task.state === 'disponivel' && (
        <>
          {!file ? (
            <div className="flex gap-2">
              {task.actionUrl && (
                <a href={task.actionUrl} target="_blank" rel="noreferrer" className="flex-1 rounded-full border-2 border-[#24130F] py-2.5 text-center text-sm font-bold">
                  {task.actionLabel ?? 'Abrir'}
                </a>
              )}
              <label className="flex-1 flex cursor-pointer items-center justify-center gap-1.5 rounded-full bg-[#24130F] py-2.5 text-sm font-bold text-white">
                <Camera className="h-4 w-4" /> Enviar print
                <input type="file" accept="image/*" className="hidden" onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />
              </label>
            </div>
          ) : (
            <div className="space-y-2">
              {preview && (
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={preview} alt="Print" className="max-h-56 w-full rounded-xl object-contain bg-stone-100" />
                  <button onClick={() => pickFile(null)} className="absolute right-2 top-2 rounded-full bg-black/60 p-1 text-white">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={200}
                className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm"
                placeholder="Seu @ no Instagram ou nome no Google (opcional)"
              />
              <button
                onClick={() => void send()}
                disabled={sending}
                className="w-full flex items-center justify-center gap-1.5 rounded-full bg-emerald-600 py-3 text-sm font-black text-white disabled:opacity-60"
              >
                {sending && <Loader2 className="h-4 w-4 animate-spin" />} Enviar para análise
              </button>
            </div>
          )}
        </>
      )}
      {error && <p className="text-xs font-semibold text-red-600">{error}</p>}
    </div>
  );
}

// ─── trocar pontos ──────────────────────────────────────────────────────────

function ExchangeTab({ member, onUpdate, onDone }: { member: ClubeMember; onUpdate: (m: ClubeMember) => void; onDone: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const exchange = async (prizeId: string) => {
    setBusy(prizeId);
    setError(null);
    try {
      const json = await postJson<{ member: ClubeMember }>('/api/public/clube/trocar', { prizeId }, 'Não foi possível trocar.');
      onUpdate(json.member);
      onDone();
    } catch (err: unknown) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
      setConfirmId(null);
    }
  };

  return (
    <div className="space-y-3">
      {member.catalog.length === 0 && <p className="rounded-3xl bg-white p-6 text-center text-sm text-stone-500">Em breve, prêmios para trocar.</p>}
      {member.catalog.map((c) => {
        const pct = Math.min(100, (member.points / c.pointsCost) * 100);
        const can = member.points >= c.pointsCost;
        return (
          <div key={c.id} className="rounded-3xl bg-white p-5 shadow-sm space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-black">{c.title}</p>
                {c.description && <p className="text-xs text-stone-500 mt-0.5">{c.description}</p>}
              </div>
              <span className="flex items-center gap-1 rounded-full bg-[#F3E9D8] px-3 py-1 text-sm font-black">
                <Star className="h-3.5 w-3.5 text-[#B77A45]" /> {c.pointsCost}
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-stone-100">
              <div className="h-full rounded-full bg-[#B77A45]" style={{ width: `${pct}%` }} />
            </div>
            {confirmId === c.id ? (
              <div className="flex gap-2">
                <button onClick={() => setConfirmId(null)} className="flex-1 rounded-full border border-stone-300 py-2.5 text-sm font-bold">
                  Cancelar
                </button>
                <button
                  onClick={() => void exchange(c.id)}
                  disabled={busy !== null}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-full bg-emerald-600 py-2.5 text-sm font-black text-white"
                >
                  {busy === c.id && <Loader2 className="h-4 w-4 animate-spin" />} Confirmar troca
                </button>
              </div>
            ) : (
              <button
                disabled={!can}
                onClick={() => setConfirmId(c.id)}
                className="w-full rounded-full bg-[#24130F] py-3 text-sm font-black text-white disabled:bg-stone-200 disabled:text-stone-400"
              >
                {can ? `Trocar ${c.pointsCost} pontos` : `Faltam ${c.pointsCost - member.points} pontos`}
              </button>
            )}
          </div>
        );
      })}
      {error && <p className="rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-700">{error}</p>}

      {member.history.length > 0 && (
        <div className="rounded-3xl bg-white p-5 shadow-sm">
          <p className="mb-2 text-sm font-black">Extrato</p>
          <ul className="divide-y divide-stone-100">
            {member.history.map((h, i) => (
              <li key={i} className="flex items-center justify-between py-2 text-xs">
                <span className="text-stone-600">
                  {h.description} <span className="text-stone-400">· {dateSP(h.createdAt)}</span>
                </span>
                <span className={`font-black ${h.delta > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {h.delta > 0 ? '+' : ''}
                  {h.delta}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── tela ao vivo (o que o revendedor vê) ───────────────────────────────────

function LiveScreen({
  reward,
  memberName,
  clockOffset,
  onDone,
}: {
  reward: ClubeReward;
  memberName: string;
  clockOffset: number;
  onDone: () => void;
}) {
  const [now, setNow] = useState(() => new Date(Date.now() + clockOffset));

  useEffect(() => {
    const t = setInterval(() => setNow(new Date(Date.now() + clockOffset)), 250);
    return () => clearInterval(t);
  }, [clockOffset]);

  const secondsLeft = useMemo(() => {
    if (!reward.redeemedAt) return 0;
    const elapsed = Math.floor((now.getTime() - new Date(reward.redeemedAt).getTime()) / 1000);
    return Math.max(0, Math.min(LIVE_SECONDS, LIVE_SECONDS - elapsed));
  }, [now, reward.redeemedAt]);

  const expired = secondsLeft === 0;
  const mm = String(Math.floor(secondsLeft / 60));
  const ss = String(secondsLeft % 60).padStart(2, '0');

  return (
    <main
      className={`min-h-screen flex flex-col items-center justify-between px-6 py-8 text-white text-center transition-colors duration-700 ${
        expired ? 'bg-stone-700' : 'clube-live-bg'
      }`}
    >
      <style>{`
        .clube-live-bg { background: linear-gradient(135deg, #047857, #059669, #10b981, #059669, #047857); background-size: 400% 400%; animation: clubeShift 4s ease infinite; }
        @keyframes clubeShift { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
        @keyframes clubeSpin { to { transform: rotate(360deg); } }
        .clube-spin { animation: clubeSpin 3s linear infinite; }
      `}</style>

      <div className="flex items-center gap-2 text-sm font-bold opacity-90">
        <Image src="/logo.png" alt="" width={532} height={469} className="h-8 w-auto" /> Clube Prigor
      </div>

      <div className="space-y-5">
        <div className="relative mx-auto h-36 w-36">
          {!expired && <span className="absolute inset-0 rounded-full bg-white/30 animate-ping" />}
          {!expired && <span className="clube-spin absolute -inset-2 rounded-full border-4 border-dashed border-white/60" />}
          <span className="relative flex h-36 w-36 items-center justify-center rounded-full bg-white text-emerald-600 shadow-2xl">
            <CheckCircle2 className="h-24 w-24" strokeWidth={2.5} />
          </span>
        </div>

        <p className="text-sm font-black uppercase tracking-[0.3em]">{expired ? 'Prêmio retirado' : 'Prêmio validado'}</p>
        <p className="text-3xl font-black leading-tight">{reward.title}</p>
        <p className="text-lg font-bold opacity-95">
          {memberName} · {reward.redeemPointName}
        </p>

        <div className="mx-auto rounded-2xl bg-black/20 px-6 py-3 inline-block">
          <p className="text-5xl font-black tabular-nums tracking-tight">{timeSP(now, true)}</p>
          <p className="text-xs font-semibold opacity-80 mt-1">
            {now.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long', day: '2-digit', month: 'long' })}
          </p>
        </div>
      </div>

      <div className="w-full max-w-sm space-y-3">
        {!expired ? (
          <>
            <div className="h-2 w-full overflow-hidden rounded-full bg-white/25">
              <div className="h-full rounded-full bg-white transition-all duration-300" style={{ width: `${(secondsLeft / LIVE_SECONDS) * 100}%` }} />
            </div>
            <p className="text-sm font-bold">
              Atendente: entregue o prêmio ao cliente · tela válida por {mm}:{ss}
            </p>
          </>
        ) : (
          <button onClick={onDone} className="w-full rounded-full bg-white py-3 text-sm font-black text-stone-800">
            Voltar ao Clube
          </button>
        )}
      </div>
    </main>
  );
}
