'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useRef, useState } from 'react';
import { ArrowLeft, Building2, CreditCard, Loader2, Lock, MapPin, QrCode, Truck, User } from 'lucide-react';

import { formatCep, formatCnpj, formatCpf, formatPhone, isValidCnpj, isValidCpf } from '@/lib/documents';
import { describeDate } from '@/lib/natal/dates';
import { amountDue, brl } from '@/lib/natal/pricing';
import { onlyDigits } from '@/lib/text';
import { WhatsAppIcon } from '../icons';
import { useCart } from './Cart';

type Props = {
  dates: string[];
  pickupPoints: string[];
  deliveryNote: string;
  depositPct: number;
  pixReady: boolean;
  acceptingOrders: boolean;
  whatsappHref: string;
};

type Errors = Record<string, string>;

function Section({ n, title, icon: Icon, children }: { n: number; title: string; icon: typeof User; children: React.ReactNode }) {
  return (
    <section className="min-w-0 rounded-[1.4rem] border border-line bg-white p-5 md:p-6">
      <h2 className="flex items-center gap-3 font-display text-[1.35rem] text-cocoa md:text-[1.45rem]">
        <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-cocoa font-sans text-sm font-bold text-cream">{n}</span>
        {title}
        <Icon size={20} strokeWidth={1.5} className="ml-auto text-bronze" />
      </h2>
      <div className="mt-5 grid grid-cols-[minmax(0,1fr)] gap-4">{children}</div>
    </section>
  );
}

function Err({ id, errors }: { id: string; errors: Errors }) {
  return errors[id] ? (
    <p id={`${id}-erro`} className="mt-1.5 text-[0.82rem] font-semibold text-berry">
      {errors[id]}
    </p>
  ) : null;
}

export function Checkout({ dates, pickupPoints, deliveryNote, depositPct, pixReady, acceptingOrders, whatsappHref }: Props) {
  const router = useRouter();
  const { priced, catalog, ready, clear, setOpen } = useCart();
  const bySku = useMemo(() => new Map(catalog.map((i) => [i.sku, i])), [catalog]);
  const mustBePJ = priced.hasCorporate;

  const [type, setType] = useState<'PF' | 'PJ'>('PF');
  const customerType = mustBePJ ? 'PJ' : type;
  const [doc, setDoc] = useState('');
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [fulfillment, setFulfillment] = useState<'ENTREGA' | 'RETIRADA'>('ENTREGA');
  const [pickup, setPickup] = useState('');
  const [addr, setAddr] = useState({ zipCode: '', street: '', number: '', complement: '', neighborhood: '', city: '', state: '' });
  const [cepState, setCepState] = useState<'idle' | 'loading' | 'ok' | 'notfound' | 'error'>('idle');
  const [date, setDate] = useState('');
  const [plan, setPlan] = useState<'SINAL_50' | 'TOTAL'>('SINAL_50');
  const [method, setMethod] = useState<'PIX' | 'CARTAO'>('PIX');
  const [notes, setNotes] = useState('');
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [sending, setSending] = useState(false);
  const [serverError, setServerError] = useState('');
  const numberRef = useRef<HTMLInputElement>(null);
  const honeypot = useRef<HTMLInputElement>(null);

  const lookupCep = async (raw: string) => {
    const cep = onlyDigits(raw);
    if (cep.length !== 8) return;
    setCepState('loading');
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal: AbortSignal.timeout(6000) });
      const data = (await res.json()) as { erro?: boolean; logradouro?: string; bairro?: string; localidade?: string; uf?: string };
      if (data.erro) {
        setCepState('notfound');
        return;
      }
      setAddr((a) => ({
        ...a,
        street: data.logradouro || a.street,
        neighborhood: data.bairro || a.neighborhood,
        city: data.localidade || a.city,
        state: data.uf || a.state,
      }));
      setCepState('ok');
      setErrors((e) => {
        const next = { ...e };
        for (const k of ['address.zipCode', 'address.street', 'address.neighborhood', 'address.city', 'address.state']) delete next[k];
        return next;
      });
      window.setTimeout(() => numberRef.current?.focus(), 50);
    } catch {
      setCepState('error');
    }
  };

  const validate = (): Errors => {
    const e: Errors = {};
    if (customerType === 'PF' ? !isValidCpf(doc) : !isValidCnpj(doc)) e['customer.document'] = customerType === 'PF' ? 'CPF inválido.' : 'CNPJ inválido.';
    if (customerType === 'PJ' && company.trim().length < 2) e['customer.companyName'] = 'Informe a razão social ou o nome da empresa.';
    if (name.trim().split(/\s+/).length < 2) e['customer.name'] = 'Informe o nome completo.';
    const p = onlyDigits(phone);
    if (p.length < 10 || p.length > 11) e['customer.phone'] = 'Telefone inválido: inclua o DDD.';
    if (email && !/^\S+@\S+\.\S+$/.test(email)) e['customer.email'] = 'E-mail inválido.';
    if (fulfillment === 'ENTREGA') {
      if (onlyDigits(addr.zipCode).length !== 8) e['address.zipCode'] = 'CEP inválido.';
      if (addr.street.trim().length < 3) e['address.street'] = 'Informe a rua.';
      if (!addr.number.trim()) e['address.number'] = 'Informe o número (ou “s/n”).';
      if (addr.neighborhood.trim().length < 2) e['address.neighborhood'] = 'Informe o bairro.';
      if (addr.city.trim().length < 2) e['address.city'] = 'Informe a cidade.';
      if (!/^[A-Za-z]{2}$/.test(addr.state.trim())) e['address.state'] = 'UF inválida.';
    } else if (!pickup) e.pickupPoint = 'Escolha onde vai retirar.';
    if (!date) e.deliveryDate = 'Escolha a data.';
    if (!consent) e.consent = 'É preciso aceitar a política de privacidade.';
    return e;
  };

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setServerError('');
    const e = validate();
    setErrors(e);
    const first = Object.keys(e)[0];
    if (first) {
      document.getElementById(`f-${first}`)?.focus();
      return;
    }
    setSending(true);
    try {
      const params = new URLSearchParams(window.location.search);
      const res = await fetch('/api/pedidos', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          items: priced.lines.map((l) => ({ sku: l.sku, option: l.option, quantity: l.quantity })),
          customer: { type: customerType, document: doc, name: name.trim(), companyName: company.trim(), phone, email: email.trim() },
          fulfillment,
          pickupPoint: pickup,
          address: addr,
          deliveryDate: date,
          paymentPlan: plan,
          paymentMethod: method,
          notes: notes.trim(),
          consent,
          website: honeypot.current?.value ?? '',
          utmSource: params.get('utm_source') ?? '',
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; redirect?: string; error?: string; field?: string };
      if (!res.ok || !data.redirect) {
        setServerError(data.error ?? 'Não foi possível enviar o pedido. Tente de novo.');
        if (data.field) {
          setErrors((x) => ({ ...x, [data.field!]: data.error ?? '' }));
          document.getElementById(`f-${data.field}`)?.focus();
        }
        setSending(false);
        return;
      }
      clear();
      router.push(data.redirect);
    } catch {
      setServerError('Sem conexão. Verifique a internet e tente de novo.');
      setSending(false);
    }
  };

  if (!ready) {
    return <div className="container-x flex min-h-[60vh] items-center justify-center text-muted"><Loader2 className="animate-spin" /></div>;
  }

  if (priced.lines.length === 0) {
    return (
      <div className="container-x flex min-h-[60vh] flex-col items-center justify-center py-14 text-center">
        <p className="font-display text-3xl text-cocoa">Seu carrinho está vazio.</p>
        <p className="mt-3 text-muted">Escolha os produtos no cardápio de Natal e volte aqui para finalizar.</p>
        <Link href="/natal2026#cardapio" className="btn btn-primary mt-8">
          Ver o cardápio
        </Link>
      </div>
    );
  }

  const due = amountDue(priced.totalCents, plan, depositPct);
  const field = (id: string) => ({ id: `f-${id}`, 'aria-invalid': errors[id] ? true : undefined, 'aria-describedby': errors[id] ? `${id}-erro` : undefined });

  return (
    <div className="natal-paper checkout min-h-screen pb-16">
      <div className="container-x pt-6 md:pt-8">
        <Link href="/natal2026" className="inline-flex items-center gap-2 text-[0.7rem] font-bold tracking-[0.18em] text-muted uppercase hover:text-cocoa">
          <ArrowLeft size={14} /> Voltar ao cardápio
        </Link>
        <h1 className="display-md mt-4 text-cocoa">Finalizar pedido</h1>
        <p className="mt-2 text-muted">Faltam poucos passos para o seu Natal ficar mais gostoso.</p>
      </div>

      <form onSubmit={submit} noValidate className="container-x mt-6 grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(20rem,0.7fr)] lg:gap-6">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
          <Section n={1} title="Seus dados" icon={customerType === 'PJ' ? Building2 : User}>
            {mustBePJ ? (
              <p className="rounded-xl bg-cream-2 px-4 py-3 text-[0.9rem] text-cocoa">Seu carrinho tem itens com preço para empresas: o pedido sai no CNPJ.</p>
            ) : (
              <div className="flex gap-2" role="radiogroup" aria-label="Tipo de cliente">
                {(['PF', 'PJ'] as const).map((t) => (
                  <button key={t} type="button" role="radio" aria-checked={type === t} className="chip" onClick={() => { setType(t); setDoc(''); }}>
                    {t === 'PF' ? 'Pessoa física (CPF)' : 'Empresa (CNPJ)'}
                  </button>
                ))}
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="f-customer.document">{customerType === 'PF' ? 'CPF' : 'CNPJ'} *</label>
                <input
                  {...field('customer.document')}
                  className="field"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder={customerType === 'PF' ? '000.000.000-00' : '00.000.000/0000-00'}
                  value={doc}
                  onChange={(e) => setDoc(customerType === 'PF' ? formatCpf(e.target.value) : formatCnpj(e.target.value))}
                />
                <Err id="customer.document" errors={errors} />
              </div>
              {customerType === 'PJ' && (
                <div>
                  <label className="label" htmlFor="f-customer.companyName">Razão social / empresa *</label>
                  <input {...field('customer.companyName')} className="field" autoComplete="organization" value={company} onChange={(e) => setCompany(e.target.value)} />
                  <Err id="customer.companyName" errors={errors} />
                </div>
              )}
              <div className={customerType === 'PJ' ? 'sm:col-span-2' : ''}>
                <label className="label" htmlFor="f-customer.name">{customerType === 'PJ' ? 'Nome completo do responsável *' : 'Nome completo *'}</label>
                <input {...field('customer.name')} className="field" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
                <Err id="customer.name" errors={errors} />
              </div>
              <div>
                <label className="label" htmlFor="f-customer.phone">Telefone / WhatsApp *</label>
                <input {...field('customer.phone')} className="field" inputMode="tel" autoComplete="tel-national" placeholder="(21) 90000-0000" value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))} />
                <Err id="customer.phone" errors={errors} />
              </div>
              <div>
                <label className="label" htmlFor="f-customer.email">E-mail (opcional)</label>
                <input {...field('customer.email')} className="field" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                <Err id="customer.email" errors={errors} />
              </div>
            </div>
          </Section>

          <Section n={2} title="Entrega ou retirada" icon={fulfillment === 'ENTREGA' ? Truck : MapPin}>
            <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Forma de recebimento">
              {(
                [
                  ['ENTREGA', 'Entrega no endereço', 'Taxa conforme a região, combinada no WhatsApp'],
                  ['RETIRADA', 'Retirar', `Sem taxa de entrega · ${pickupPoints.join(', ')}`],
                ] as const
              ).map(([v, t, d]) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={fulfillment === v}
                  onClick={() => setFulfillment(v)}
                  className={`rounded-2xl border p-4 text-left transition-colors ${fulfillment === v ? 'border-cocoa bg-cocoa text-cream' : 'border-line bg-cream hover:border-cocoa'}`}
                >
                  <span className="block font-bold">{t}</span>
                  <span className={`mt-1 block text-[0.85rem] ${fulfillment === v ? 'text-cream/75' : 'text-muted'}`}>{d}</span>
                </button>
              ))}
            </div>

            {fulfillment === 'ENTREGA' ? (
              <>
                <p className="text-[0.88rem] text-muted">{deliveryNote}</p>
                <div className="grid grid-cols-6 gap-x-3 gap-y-4 sm:gap-4">
                  <div className="col-span-6 sm:col-span-2">
                    <label className="label" htmlFor="f-address.zipCode">CEP *</label>
                    <input
                      {...field('address.zipCode')}
                      className="field"
                      inputMode="numeric"
                      autoComplete="postal-code"
                      placeholder="00000-000"
                      value={addr.zipCode}
                      onChange={(e) => {
                        const v = formatCep(e.target.value);
                        setAddr((a) => ({ ...a, zipCode: v }));
                        if (onlyDigits(v).length === 8) void lookupCep(v);
                        else setCepState('idle');
                      }}
                    />
                    <p className="mt-1.5 min-h-5 text-[0.8rem] text-muted" aria-live="polite">
                      {cepState === 'loading' && 'Buscando endereço…'}
                      {cepState === 'ok' && 'Endereço encontrado. Confira e informe o número.'}
                      {cepState === 'notfound' && 'CEP não encontrado. Preencha o endereço abaixo.'}
                      {cepState === 'error' && 'Não deu para buscar agora. Preencha o endereço abaixo.'}
                    </p>
                    <Err id="address.zipCode" errors={errors} />
                  </div>
                  <div className="col-span-6 sm:col-span-4">
                    <label className="label" htmlFor="f-address.street">Rua / avenida *</label>
                    <input {...field('address.street')} className="field" autoComplete="address-line1" value={addr.street} onChange={(e) => setAddr((a) => ({ ...a, street: e.target.value }))} />
                    <Err id="address.street" errors={errors} />
                  </div>
                  <div className="col-span-2">
                    <label className="label" htmlFor="f-address.number">Número *</label>
                    <input ref={numberRef} {...field('address.number')} className="field" value={addr.number} onChange={(e) => setAddr((a) => ({ ...a, number: e.target.value }))} />
                    <Err id="address.number" errors={errors} />
                  </div>
                  <div className="col-span-4">
                    <label className="label" htmlFor="f-address.complement">Complemento</label>
                    <input {...field('address.complement')} className="field" autoComplete="address-line2" placeholder="Apto, bloco, referência" value={addr.complement} onChange={(e) => setAddr((a) => ({ ...a, complement: e.target.value }))} />
                  </div>
                  <div className="col-span-6 sm:col-span-2">
                    <label className="label" htmlFor="f-address.neighborhood">Bairro *</label>
                    <input {...field('address.neighborhood')} className="field" value={addr.neighborhood} onChange={(e) => setAddr((a) => ({ ...a, neighborhood: e.target.value }))} />
                    <Err id="address.neighborhood" errors={errors} />
                  </div>
                  <div className="col-span-6 grid grid-cols-[1fr_4.5rem] gap-3 sm:col-span-4">
                    <div>
                      <label className="label" htmlFor="f-address.city">Cidade *</label>
                      <input {...field('address.city')} className="field" autoComplete="address-level2" value={addr.city} onChange={(e) => setAddr((a) => ({ ...a, city: e.target.value }))} />
                      <Err id="address.city" errors={errors} />
                    </div>
                    <div>
                      <label className="label" htmlFor="f-address.state">UF *</label>
                      <input {...field('address.state')} className="field uppercase" maxLength={2} autoComplete="address-level1" value={addr.state} onChange={(e) => setAddr((a) => ({ ...a, state: e.target.value.toUpperCase() }))} />
                      <Err id="address.state" errors={errors} />
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div>
                <p className="label" id="pickup-label">Onde você prefere retirar? *</p>
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-labelledby="pickup-label" id="f-pickupPoint" tabIndex={-1}>
                  {pickupPoints.map((p) => (
                    <button key={p} type="button" role="radio" aria-checked={pickup === p} className="chip" onClick={() => setPickup(p)}>
                      {p}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-[0.85rem] text-muted">O endereço e o horário de retirada vão junto com a confirmação pelo WhatsApp.</p>
                <Err id="pickupPoint" errors={errors} />
              </div>
            )}
          </Section>

          <Section n={3} title={fulfillment === 'ENTREGA' ? 'Data da entrega' : 'Data da retirada'} icon={Truck}>
            {dates.length === 0 ? (
              <p className="rounded-xl bg-cream-2 px-4 py-3 text-cocoa">Não há mais datas disponíveis pelo site. Fale com a gente pelo WhatsApp.</p>
            ) : (
              <div>
                <div className="hide-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 pb-2 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0" role="radiogroup" aria-label="Datas disponíveis" id="f-deliveryDate" tabIndex={-1}>
                  {dates.map((d) => {
                    const info = describeDate(d);
                    const on = d === date;
                    return (
                      <button
                        key={d}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        aria-label={info.long}
                        onClick={() => setDate(d)}
                        className={`flex w-[4.25rem] shrink-0 flex-col items-center rounded-2xl border py-2 transition-colors ${on ? 'border-berry bg-berry text-white' : 'border-line bg-cream hover:border-cocoa'}`}
                      >
                        <span className={`text-[0.66rem] font-bold tracking-[0.12em] uppercase ${on ? 'text-white/80' : 'text-muted'}`}>{info.weekday.slice(0, 3)}</span>
                        <span className="font-display text-[1.6rem] leading-tight">{info.day}</span>
                        <span className={`text-[0.72rem] ${on ? 'text-white/80' : 'text-muted'}`}>{info.month}</span>
                      </button>
                    );
                  })}
                </div>
                {date && <p className="mt-2 text-[0.9rem] text-cocoa">Escolhido: <strong>{describeDate(date).long}</strong></p>}
                <Err id="deliveryDate" errors={errors} />
              </div>
            )}
          </Section>

          <Section n={4} title="Pagamento" icon={Lock}>
            <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Quanto pagar agora">
              {(
                [
                  ['SINAL_50', `Sinal de ${depositPct}%`, `${brl(amountDue(priced.totalCents, 'SINAL_50', depositPct))} agora, o restante na entrega`],
                  ['TOTAL', 'Valor total', `${brl(priced.totalCents)} agora`],
                ] as const
              ).map(([v, t, d]) => (
                <button key={v} type="button" role="radio" aria-checked={plan === v} onClick={() => setPlan(v)} className={`rounded-2xl border p-4 text-left transition-colors ${plan === v ? 'border-cocoa bg-cocoa text-cream' : 'border-line bg-cream hover:border-cocoa'}`}>
                  <span className="block font-bold">{t}</span>
                  <span className={`mt-1 block text-[0.85rem] ${plan === v ? 'text-cream/75' : 'text-muted'}`}>{d}</span>
                </button>
              ))}
            </div>
            <div>
              <p className="label">Forma de pagamento</p>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Forma de pagamento">
                <button type="button" role="radio" aria-checked={method === 'PIX'} className="chip gap-2" onClick={() => setMethod('PIX')}>
                  <QrCode size={16} /> Pix
                </button>
                <button type="button" role="radio" aria-checked={method === 'CARTAO'} className="chip gap-2" onClick={() => setMethod('CARTAO')}>
                  <CreditCard size={16} /> Cartão de crédito
                </button>
              </div>
              <p className="mt-2 text-[0.85rem] text-muted">
                {method === 'PIX'
                  ? pixReady
                    ? 'Na próxima tela aparecem o QR Code e o Pix copia e cola com o valor certo.'
                    : 'Logo depois do pedido enviamos a chave Pix pelo WhatsApp.'
                  : 'Enviamos o link de pagamento com cartão pelo WhatsApp.'}{' '}
                O pedido é confirmado quando o pagamento cai.
              </p>
            </div>
            <div>
              <label className="label" htmlFor="f-notes">Observações (opcional)</label>
              <textarea id="f-notes" className="field min-h-20" maxLength={600} placeholder="Ex.: cartão de presente, horário preferido, ponto de referência" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </Section>
        </div>

        {/* ---------- Resumo ---------- */}
        <aside className="min-w-0 lg:sticky lg:top-[5.75rem]">
          <div className="flex flex-col rounded-[1.4rem] bg-cocoa p-5 text-cream md:p-6 lg:max-h-[max(27rem,calc(100svh-13.5rem))]">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-2xl">Resumo</h2>
              <button type="button" onClick={() => setOpen(true)} className="text-[0.8rem] font-bold text-gold-2 underline underline-offset-4">
                Editar carrinho
              </button>
            </div>
            <ul className="mt-3 min-h-[4.5rem] divide-y divide-cream/10 overflow-y-auto overscroll-contain lg:-mr-2 lg:pr-2">
              {priced.lines.map((l) => (
                <li key={`${l.sku}|${l.option}`} className="flex gap-3 py-2.5">
                  <div className="relative size-12 shrink-0 overflow-hidden rounded-lg bg-cocoa-3">
                    {bySku.get(l.sku) && <Image src={bySku.get(l.sku)!.image} alt="" fill sizes="56px" className="object-cover" />}
                  </div>
                  <div className="min-w-0 flex-1 text-[0.9rem]">
                    <p className="font-semibold leading-snug">
                      {l.quantity}× {l.name}
                    </p>
                    {l.option && <p className="text-cream/65">{l.option}</p>}
                    {l.discountPct > 0 && <p className="text-gold-2">−{l.discountPct}%</p>}
                  </div>
                  <p className="text-[0.9rem] font-semibold whitespace-nowrap">{brl(l.totalCents)}</p>
                </li>
              ))}
            </ul>
            <dl className="grid shrink-0 gap-1 border-t border-cream/15 pt-3 text-[0.95rem]">
              <div className="flex justify-between text-cream/70">
                <dt>Subtotal</dt>
                <dd>{brl(priced.subtotalCents)}</dd>
              </div>
              {priced.discountCents > 0 && (
                <div className="flex justify-between text-gold-2">
                  <dt>Desconto</dt>
                  <dd>− {brl(priced.discountCents)}</dd>
                </div>
              )}
              <div className="flex justify-between text-cream/70">
                <dt>{fulfillment === 'ENTREGA' ? 'Entrega' : 'Retirada'}</dt>
                <dd>{fulfillment === 'ENTREGA' ? 'a combinar' : 'sem taxa'}</dd>
              </div>
              <div className="flex justify-between text-lg font-bold">
                <dt>Total</dt>
                <dd>{brl(priced.totalCents)}</dd>
              </div>
              <div className="mt-1.5 flex justify-between rounded-xl bg-cream/8 px-4 py-2.5 text-gold-2">
                <dt className="font-semibold">{plan === 'TOTAL' ? 'A pagar agora' : `Sinal (${depositPct}%) agora`}</dt>
                <dd className="font-bold">{brl(due)}</dd>
              </div>
            </dl>

            {priced.errors.length > 0 && (
              <ul className="mt-4 rounded-xl bg-berry px-4 py-3 text-sm">
                {priced.errors.map((e) => <li key={e}>{e}</li>)}
              </ul>
            )}

            <label className="mt-4 flex shrink-0 items-start gap-3 text-[0.82rem] leading-snug text-cream/80" htmlFor="f-consent">
              <input id="f-consent" type="checkbox" className="mt-0.5 size-5 shrink-0 accent-[#b99a65]" checked={consent} onChange={(e) => setConsent(e.target.checked)} aria-invalid={errors.consent ? true : undefined} />
              <span>
                Concordo com o uso dos meus dados para processar e entregar este pedido, conforme a{' '}
                <Link href="/politica-de-privacidade" className="underline" target="_blank">política de privacidade</Link>.
              </span>
            </label>
            {errors.consent && <p className="mt-1.5 text-[0.82rem] font-semibold text-gold-2">{errors.consent}</p>}

            <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
              <label>
                Site <input ref={honeypot} tabIndex={-1} autoComplete="off" name="website" />
              </label>
            </div>

            {serverError && <p className="mt-4 rounded-xl bg-berry px-4 py-3 text-sm" role="alert">{serverError}</p>}

            <button type="submit" disabled={sending || !acceptingOrders || priced.errors.length > 0 || dates.length === 0} className="btn btn-gold mt-4 w-full shrink-0 disabled:opacity-60" data-track="natal_checkout_submit">
              {sending ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Enviando…
                </>
              ) : (
                <>Confirmar pedido · {brl(due)}</>
              )}
            </button>
            <a href={whatsappHref} target="_blank" rel="noopener" className="mt-3 flex shrink-0 items-center justify-center gap-2 text-[0.85rem] text-cream/70 hover:text-cream">
              <WhatsAppIcon size={16} /> Prefere finalizar pelo WhatsApp?
            </a>
          </div>
        </aside>
      </form>
    </div>
  );
}
