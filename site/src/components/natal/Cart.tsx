'use client';

import Image from 'next/image';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Minus, Plus, ShoppingBag, Trash2, X } from 'lucide-react';

import type { NatalItem } from '@/lib/natal/catalog';
import { amountDue, brl, priceCart, type CartLineInput, type PricedCart, type PricingRules } from '@/lib/natal/pricing';

const STORAGE_KEY = 'prigor:carrinho:natal';

type CartCtx = {
  lines: CartLineInput[];
  priced: PricedCart;
  catalog: NatalItem[];
  rules: PricingRules;
  depositPct: number;
  count: number;
  ready: boolean;
  add: (sku: string, option: string, quantity: number) => void;
  setQuantity: (sku: string, option: string, quantity: number) => void;
  remove: (sku: string, option: string) => void;
  clear: () => void;
  open: boolean;
  setOpen: (v: boolean) => void;
  bump: number;
};

const Ctx = createContext<CartCtx | null>(null);

export function useCart(): CartCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useCart fora do CartProvider');
  return c;
}

function readStorage(): CartLineInput[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const data = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(data)
      ? data
          .filter((l): l is CartLineInput => !!l && typeof l.sku === 'string' && Number.isFinite(l.quantity))
          .map((l) => ({ sku: l.sku, option: typeof l.option === 'string' ? l.option : '', quantity: Math.max(1, Math.floor(l.quantity)) }))
      : [];
  } catch {
    return [];
  }
}

export function CartProvider({
  children,
  catalog,
  rules,
  depositPct,
}: {
  children: React.ReactNode;
  catalog: NatalItem[];
  rules: PricingRules;
  depositPct: number;
}) {
  const [lines, setLines] = useState<CartLineInput[]>([]);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [bump, setBump] = useState(0);

  useEffect(() => {
    // Carrinho guardado no navegador: só existe depois de montar.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLines(readStorage());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
    } catch {
      /* navegador sem armazenamento: o carrinho vale só nesta aba */
    }
  }, [lines, ready]);

  const add = useCallback((sku: string, option: string, quantity: number) => {
    setLines((prev) => {
      const i = prev.findIndex((l) => l.sku === sku && (l.option ?? '') === option);
      if (i === -1) return [...prev, { sku, option, quantity }];
      const next = [...prev];
      next[i] = { ...next[i]!, quantity: Math.min(500, next[i]!.quantity + quantity) };
      return next;
    });
    setBump((b) => b + 1);
  }, []);

  const setQuantity = useCallback((sku: string, option: string, quantity: number) => {
    setLines((prev) =>
      quantity < 1
        ? prev.filter((l) => !(l.sku === sku && (l.option ?? '') === option))
        : prev.map((l) => (l.sku === sku && (l.option ?? '') === option ? { ...l, quantity: Math.min(500, quantity) } : l)),
    );
  }, []);

  const remove = useCallback((sku: string, option: string) => setLines((prev) => prev.filter((l) => !(l.sku === sku && (l.option ?? '') === option))), []);
  const clear = useCallback(() => setLines([]), []);

  const priced = useMemo(() => priceCart(lines, catalog, rules), [lines, catalog, rules]);
  const count = priced.lines.reduce((s, l) => s + l.quantity, 0);

  const value = useMemo<CartCtx>(
    () => ({ lines, priced, catalog, rules, depositPct, count, ready, add, setQuantity, remove, clear, open, setOpen, bump }),
    [lines, priced, catalog, rules, depositPct, count, ready, add, setQuantity, remove, clear, open, bump],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/* ------------------------------------------------------------------ */

export function QtyStepper({ value, onChange, min = 1, label }: { value: number; onChange: (v: number) => void; min?: number; label: string }) {
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label="Diminuir quantidade">
        <Minus size={15} />
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={500}
        value={value}
        onChange={(e) => {
          const n = Math.floor(Number(e.target.value));
          if (Number.isFinite(n)) onChange(Math.max(0, Math.min(500, n)));
        }}
        onBlur={(e) => {
          if (Number(e.target.value) < min) onChange(min);
        }}
        aria-label="Quantidade"
      />
      <button type="button" onClick={() => onChange(Math.min(500, value + 1))} disabled={value >= 500} aria-label="Aumentar quantidade">
        <Plus size={15} />
      </button>
    </div>
  );
}

/** Barra fixa com o resumo do carrinho (aparece quando há itens). */
export function CartBar() {
  const { count, priced, setOpen, ready, bump } = useCart();
  const pathname = usePathname();
  // Na finalização e na página do pedido o resumo já está na tela: a barra só atrapalharia.
  if (!ready || count === 0 || pathname !== '/natal2026') return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 flex justify-start px-4 md:justify-center md:bottom-6">
      <button
        key={bump}
        type="button"
        onClick={() => setOpen(true)}
        className="cart-bump pointer-events-auto flex h-14 w-[calc(100%-4.5rem)] max-w-md items-center gap-3 rounded-full bg-cocoa pr-2 pl-5 text-cream shadow-[0_20px_40px_-14px_rgb(36_19_15_/_0.7)] md:w-auto md:min-w-[26rem]"
        aria-label={`Abrir carrinho: ${count} itens, ${brl(priced.totalCents)}`}
      >
        <ShoppingBag size={20} className="text-gold-2" />
        <span className="text-[0.82rem] font-bold">
          {count} {count === 1 ? 'item' : 'itens'}
        </span>
        <span className="text-[0.82rem] text-cream/70">·</span>
        <span className="text-[0.95rem] font-bold">{brl(priced.totalCents)}</span>
        <span className="ml-auto inline-flex h-10 items-center gap-2 rounded-full bg-gold px-4 text-[0.7rem] font-extrabold tracking-[0.12em] text-cocoa uppercase">
          Ver carrinho <ArrowRight size={14} />
        </span>
      </button>
    </div>
  );
}

/** Gaveta lateral do carrinho. */
export function CartDrawer({ acceptingOrders }: { acceptingOrders: boolean }) {
  const { priced, catalog, rules, depositPct, open, setOpen, setQuantity, remove, count } = useCart();
  const panel = useRef<HTMLDivElement>(null);
  const bySku = useMemo(() => new Map(catalog.map((i) => [i.sku, i])), [catalog]);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [open, setOpen]);

  // Quanto falta para o desconto por volume, por produto
  const qtyBySku = new Map<string, number>();
  for (const l of priced.lines) qtyBySku.set(l.sku, (qtyBySku.get(l.sku) ?? 0) + l.quantity);

  return (
    <div className={`fixed inset-0 z-[60] ${open ? '' : 'pointer-events-none'}`} aria-hidden={!open}>
      <div className={`absolute inset-0 bg-cocoa/50 backdrop-blur-[2px] transition-opacity duration-500 ${open ? 'opacity-100' : 'opacity-0'}`} onClick={() => setOpen(false)} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label="Seu carrinho"
        tabIndex={-1}
        inert={!open}
        className={`absolute top-0 right-0 flex h-full w-full max-w-[28rem] flex-col bg-cream shadow-2xl outline-none transition-transform duration-500 ease-[var(--ease-premium)] ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="flex items-center justify-between border-b border-line px-6 py-5">
          <div>
            <p className="eyebrow eyebrow-plain">Natal Prigor</p>
            <h2 className="mt-1 font-display text-2xl text-cocoa">Seu carrinho</h2>
          </div>
          <button type="button" onClick={() => setOpen(false)} className="inline-flex size-11 items-center justify-center rounded-full border border-line text-cocoa hover:bg-cream-2" aria-label="Fechar carrinho">
            <X size={18} />
          </button>
        </div>

        {count === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
            <ShoppingBag size={36} strokeWidth={1.2} className="text-bronze" />
            <p className="mt-4 font-display text-2xl text-cocoa">Seu carrinho está vazio.</p>
            <p className="mt-2 text-muted">Escolha suas delícias de Natal no cardápio.</p>
            <button type="button" className="btn btn-primary mt-7" onClick={() => setOpen(false)}>
              Ver cardápio
            </button>
          </div>
        ) : (
          <>
            <ul className="flex-1 divide-y divide-line overflow-y-auto px-6">
              {priced.lines.map((l) => {
                const item = bySku.get(l.sku);
                const skuQty = qtyBySku.get(l.sku) ?? 0;
                const missing = item?.channel === 'varejo' && rules.bulkPct > 0 && skuQty < rules.bulkQty ? rules.bulkQty - skuQty : 0;
                return (
                  <li key={`${l.sku}|${l.option}`} className="flex gap-4 py-5">
                    <div className="relative size-20 shrink-0 overflow-hidden rounded-xl bg-sand">
                      {item && <Image src={item.image} alt="" fill sizes="80px" className="object-cover" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold leading-snug text-cocoa">{l.name}</p>
                          {l.option && <p className="text-[0.85rem] text-muted">{item?.option?.label}: {l.option}</p>}
                        </div>
                        <button type="button" onClick={() => remove(l.sku, l.option)} className="text-muted hover:text-berry" aria-label={`Remover ${l.name}`}>
                          <Trash2 size={16} />
                        </button>
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <QtyStepper value={l.quantity} onChange={(q) => setQuantity(l.sku, l.option, q)} min={0} label={`Quantidade de ${l.name}`} />
                        <div className="text-right">
                          {l.discountCents > 0 && <p className="text-[0.78rem] text-muted line-through">{brl(l.grossCents)}</p>}
                          <p className="font-bold text-cocoa">{brl(l.totalCents)}</p>
                        </div>
                      </div>
                      {l.discountPct > 0 ? (
                        <p className="mt-2 text-[0.78rem] font-semibold text-pine">{l.discountPct}% de desconto aplicado</p>
                      ) : missing > 0 && missing <= 5 ? (
                        <p className="mt-2 text-[0.78rem] text-muted">
                          Mais {missing} {missing === 1 ? 'unidade' : 'unidades'} deste produto e você ganha {rules.bulkPct}% de desconto.
                        </p>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>

            <div className="border-t border-line bg-cream-2/70 px-6 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
              {priced.errors.length > 0 && (
                <ul className="mb-4 rounded-xl bg-berry/8 px-4 py-3 text-[0.85rem] text-berry">
                  {priced.errors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              )}
              <dl className="grid gap-1.5 text-[0.95rem]">
                <div className="flex justify-between text-muted">
                  <dt>Subtotal</dt>
                  <dd>{brl(priced.subtotalCents)}</dd>
                </div>
                {priced.discountCents > 0 && (
                  <div className="flex justify-between text-pine">
                    <dt>Desconto</dt>
                    <dd>− {brl(priced.discountCents)}</dd>
                  </div>
                )}
                <div className="flex justify-between text-lg font-bold text-cocoa">
                  <dt>Total</dt>
                  <dd>{brl(priced.totalCents)}</dd>
                </div>
                <div className="flex justify-between text-[0.85rem] text-muted">
                  <dt>Sinal para confirmar ({depositPct}%)</dt>
                  <dd>{brl(amountDue(priced.totalCents, 'SINAL_50', depositPct))}</dd>
                </div>
              </dl>
              <p className="mt-2 text-[0.78rem] text-muted">Taxa de entrega combinada pelo WhatsApp, conforme o endereço.</p>
              {acceptingOrders ? (
                <Link
                  href="/natal2026/finalizar"
                  onClick={() => setOpen(false)}
                  aria-disabled={priced.errors.length > 0}
                  className={`btn btn-primary mt-5 w-full ${priced.errors.length > 0 ? 'pointer-events-none opacity-50' : ''}`}
                  data-track="natal_checkout_start"
                >
                  Finalizar pedido <ArrowRight size={16} />
                </Link>
              ) : (
                <p className="mt-5 rounded-xl bg-cocoa px-4 py-3 text-center text-sm text-cream">As encomendas pelo site estão encerradas.</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
