'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { CircleCheck, Loader2 } from 'lucide-react';

import { track } from '@/lib/analytics';
import { BUSINESS_TYPES } from '@/lib/leads/schema';
import { fillTemplate, waLink } from '@/lib/whatsapp';
import { WhatsAppIcon } from '../icons';

type Errors = Record<string, string>;

function maskPhone(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function ResellerForm({ whatsapp, followUpTemplate }: { whatsapp: string; followUpTemplate: string }) {
  const [phone, setPhone] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<{ name: string; company: string; city: string } | null>(null);
  const [utm, setUtm] = useState({ utmSource: '', utmMedium: '', utmCampaign: '', referrer: '' });
  const doneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Guarda a origem da visita (UTM) para o lead chegar ao painel/CRM com contexto.
    const params = new URLSearchParams(window.location.search);
    const stored = (() => {
      try {
        return JSON.parse(sessionStorage.getItem('dp_utm') ?? '{}') as Record<string, string>;
      } catch {
        return {};
      }
    })();
    const next = {
      utmSource: params.get('utm_source') ?? stored.utmSource ?? '',
      utmMedium: params.get('utm_medium') ?? stored.utmMedium ?? '',
      utmCampaign: params.get('utm_campaign') ?? stored.utmCampaign ?? '',
      referrer: stored.referrer ?? (document.referrer && !document.referrer.includes(window.location.host) ? document.referrer : ''),
    };
    try {
      sessionStorage.setItem('dp_utm', JSON.stringify(next));
    } catch {
      /* ignora */
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lê URL/sessionStorage uma vez após montar
    setUtm(next);
  }, []);

  useEffect(() => {
    if (done) doneRef.current?.focus();
  }, [done]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const payload = {
      name: String(form.get('name') ?? ''),
      company: String(form.get('company') ?? ''),
      whatsapp: phone,
      city: String(form.get('city') ?? ''),
      neighborhood: String(form.get('neighborhood') ?? ''),
      businessType: String(form.get('businessType') ?? ''),
      instagram: String(form.get('instagram') ?? ''),
      howFound: String(form.get('howFound') ?? ''),
      message: String(form.get('message') ?? ''),
      consent: form.get('consent') === 'on',
      website: String(form.get('website') ?? ''),
      source: 'site:seja-um-revendedor',
      ...utm,
    };

    setSending(true);
    setErrors({});
    setFormError('');
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; fieldErrors?: Errors };
      if (!res.ok || !data.ok) {
        setErrors(data.fieldErrors ?? {});
        setFormError(data.error ?? 'Não foi possível enviar agora. Tente novamente ou fale pelo WhatsApp.');
        const first = Object.keys(data.fieldErrors ?? {})[0];
        if (first) document.getElementById(`lead-${first}`)?.focus();
        return;
      }
      track('lead_submit', { label: payload.businessType, city: payload.city });
      setDone({ name: payload.name.split(' ')[0], company: payload.company, city: payload.city });
    } catch {
      setFormError('Sem conexão no momento. Tente novamente ou fale pelo WhatsApp.');
    } finally {
      setSending(false);
    }
  }

  if (done) {
    const href = waLink(whatsapp, fillTemplate(followUpTemplate, { nome: done.name, empresa: done.company, cidade: done.city }));
    return (
      <div ref={doneRef} tabIndex={-1} className="rounded-[1.8rem] border border-gold/30 bg-cocoa-2 p-8 text-cream outline-none md:p-12" role="status">
        <CircleCheck size={40} strokeWidth={1.4} className="text-gold" />
        <h3 className="mt-6 text-3xl font-medium md:text-4xl">Recebemos seu cadastro, {done.name}.</h3>
        <p className="mt-4 max-w-md text-cream/75">
          Nossa equipe vai entrar em contato pelo WhatsApp informado. Se preferir adiantar a conversa, é só chamar agora.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <a href={href} target="_blank" rel="noopener" className="btn btn-whatsapp" data-track="whatsapp_click" data-track-label="lead:confirmacao">
            <WhatsAppIcon size={18} /> Falar pelo WhatsApp
          </a>
          <Link href="/produtos" className="btn btn-outline-light">
            Ver produtos
          </Link>
        </div>
      </div>
    );
  }

  const err = (field: string) =>
    errors[field] ? (
      <p id={`lead-${field}-erro`} className="mt-1.5 text-sm text-terracotta">
        {errors[field]}
      </p>
    ) : null;

  const aria = (field: string) =>
    errors[field] ? { 'aria-invalid': true as const, 'aria-describedby': `lead-${field}-erro` } : {};

  return (
    <form onSubmit={onSubmit} noValidate className="relative rounded-[1.8rem] border border-line bg-cream p-6 text-ink shadow-[0_50px_90px_-50px_rgb(0_0_0_/_0.7)] md:p-10">
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="lead-company" className="label">Nome do estabelecimento *</label>
          <input id="lead-company" name="company" className="field" autoComplete="organization" required {...aria('company')} />
          {err('company')}
        </div>
        <div>
          <label htmlFor="lead-name" className="label">Nome do responsável *</label>
          <input id="lead-name" name="name" className="field" autoComplete="name" required {...aria('name')} />
          {err('name')}
        </div>
        <div>
          <label htmlFor="lead-whatsapp" className="label">WhatsApp *</label>
          <input
            id="lead-whatsapp"
            name="whatsapp"
            className="field"
            inputMode="tel"
            autoComplete="tel-national"
            placeholder="(21) 90000-0000"
            value={phone}
            onChange={(e) => setPhone(maskPhone(e.target.value))}
            required
            {...aria('whatsapp')}
          />
          {err('whatsapp')}
        </div>
        <div>
          <label htmlFor="lead-businessType" className="label">Tipo de estabelecimento *</label>
          <select id="lead-businessType" name="businessType" className="field" defaultValue="" required {...aria('businessType')}>
            <option value="" disabled>Selecione</option>
            {BUSINESS_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          {err('businessType')}
        </div>
        <div>
          <label htmlFor="lead-city" className="label">Cidade *</label>
          <input id="lead-city" name="city" className="field" autoComplete="address-level2" required {...aria('city')} />
          {err('city')}
        </div>
        <div>
          <label htmlFor="lead-neighborhood" className="label">Bairro</label>
          <input id="lead-neighborhood" name="neighborhood" className="field" autoComplete="address-level3" />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="lead-message" className="label">Mensagem (opcional)</label>
          <textarea
            id="lead-message"
            name="message"
            rows={4}
            className="field resize-y"
            placeholder="Conte um pouco sobre o seu negócio: movimento, público, o que você já vende…"
          />
        </div>
        <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
          <label htmlFor="lead-website">Site</label>
          <input id="lead-website" name="website" tabIndex={-1} autoComplete="off" />
        </div>

        <div className="sm:col-span-2">
          <label className="flex items-start gap-3 text-sm leading-relaxed text-muted">
            <input type="checkbox" name="consent" className="mt-1 size-4 shrink-0 accent-[#2a1812]" required {...aria('consent')} />
            <span>
              Autorizo a Doces Prigor a entrar em contato pelo WhatsApp informado para tratar da revenda, conforme a{' '}
              <Link href="/politica-de-privacidade" className="underline underline-offset-2">Política de Privacidade</Link>.
            </span>
          </label>
          {err('consent')}
        </div>
      </div>

      {formError && (
        <p className="mt-6 rounded-xl bg-terracotta/10 px-4 py-3 text-sm font-medium text-terracotta" role="alert">
          {formError}
        </p>
      )}

      <button type="submit" disabled={sending} className="btn btn-primary mt-8 w-full disabled:opacity-70 sm:w-auto">
        {sending ? <Loader2 className="animate-spin" size={18} /> : null}
        {sending ? 'Enviando…' : 'Quero ser revendedor'}
      </button>
    </form>
  );
}
