'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, ShoppingBag } from 'lucide-react';

import type { NatalItem } from '@/lib/natal/catalog';
import { brl } from '@/lib/natal/pricing';
import { QtyStepper, useCart } from './Cart';

const SIZES = '(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 92vw';

/** Carrossel de fotos do produto: arrasta no celular, setas e bolinhas em qualquer tela. */
function Gallery({ item, slide, priority, corporate }: { item: NatalItem; slide?: number; priority: boolean; corporate: boolean }) {
  const photos = item.gallery.length > 0 ? item.gallery : [item.image];
  const scroller = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const many = photos.length > 1;

  const go = useCallback(
    (i: number) => {
      const el = scroller.current;
      if (!el) return;
      const next = (i + photos.length) % photos.length;
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      el.scrollTo({ left: next * el.clientWidth, behavior: reduce ? 'auto' : 'smooth' });
    },
    [photos.length],
  );

  // Escolheu um recheio com foto própria: o carrossel vai até ela.
  useEffect(() => {
    if (slide !== undefined) go(slide);
  }, [slide, go]);

  return (
    <div className="group/gal relative bg-sand" role="group" aria-roledescription="carrossel" aria-label={`Fotos de ${item.name}`}>
      <div
        ref={scroller}
        className="hide-scrollbar flex aspect-[4/5] snap-x snap-mandatory overflow-x-auto overscroll-x-contain lg:aspect-[8/9]"
        onScroll={(e) => {
          const el = e.currentTarget;
          const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
          if (i !== index) setIndex(i);
        }}
      >
        {photos.map((src, i) => (
          <div key={src} className="relative h-full w-full shrink-0 snap-center snap-always" aria-hidden={i !== index || undefined}>
            <Image
              src={src}
              alt={i === 0 ? item.imageAlt : `${item.name} — foto ${i + 1}`}
              fill
              sizes={SIZES}
              className="object-cover"
              priority={priority && i === 0}
              loading={priority && i === 0 ? undefined : 'lazy'}
              draggable={false}
            />
          </div>
        ))}
      </div>

      {many && (
        <>
          <button type="button" onClick={() => go(index - 1)} aria-label="Foto anterior" className="gal-arrow left-2.5">
            <ChevronLeft size={18} />
          </button>
          <button type="button" onClick={() => go(index + 1)} aria-label="Próxima foto" className="gal-arrow right-2.5">
            <ChevronRight size={18} />
          </button>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 bg-gradient-to-t from-black/45 to-transparent px-3.5 pt-10 pb-3">
            <div className="pointer-events-auto flex items-center gap-1.5">
              {photos.map((src, i) => (
                <button key={src} type="button" onClick={() => go(i)} aria-label={`Ver foto ${i + 1} de ${photos.length}`} aria-current={i === index || undefined} className="gal-dot" />
              ))}
            </div>
            <span className="rounded-full bg-black/45 px-2 py-0.5 text-[11px] font-bold tracking-wide text-white tabular-nums backdrop-blur-sm" aria-hidden="true">
              {index + 1}/{photos.length}
            </span>
          </div>
        </>
      )}

      {item.detail && (
        <span className="absolute top-3.5 left-3.5 rounded-full bg-cream/92 px-3 py-1.5 text-[11px] font-bold tracking-[0.08em] text-cocoa backdrop-blur">{item.detail}</span>
      )}
      {corporate && item.minQty && (
        <span className="absolute top-3.5 right-3.5 rounded-full bg-gold px-3 py-1.5 text-[11px] font-bold tracking-[0.08em] text-cocoa">A partir de {item.minQty} un.</span>
      )}
    </div>
  );
}

export function NatalProductCard({ item, acceptingOrders, priority = false }: { item: NatalItem; acceptingOrders: boolean; priority?: boolean }) {
  const { add, rules, setOpen } = useCart();
  const min = item.minQty ?? 1;
  const [option, setOption] = useState('');
  const [qty, setQty] = useState(min);
  const [added, setAdded] = useState(false);
  const [needOption, setNeedOption] = useState(false);
  const corporate = item.channel === 'empresa';

  const onAdd = () => {
    if (item.option && !option) {
      setNeedOption(true);
      return;
    }
    add(item.sku, option, Math.max(min, qty));
    setAdded(true);
    window.setTimeout(() => setAdded(false), 2200);
  };

  return (
    <article className={`group flex flex-col overflow-hidden rounded-[1.6rem] ${corporate ? 'bg-cocoa-2 text-cream' : 'bg-white shadow-[0_30px_60px_-45px_rgb(36_19_15_/_0.45)]'}`} data-reveal>
      <Gallery item={item} slide={option ? item.optionSlide?.[option] : undefined} priority={priority} corporate={corporate} />
      <div className="flex flex-1 flex-col p-6">
        <h3 className={`font-display text-[1.6rem] leading-tight ${corporate ? 'text-cream' : 'text-cocoa'}`}>{item.name}</h3>
        <p className={`mt-2 flex-1 text-[0.95rem] leading-relaxed ${corporate ? 'text-cream/72' : 'text-muted'}`}>{item.description}</p>

        <div className="mt-5 flex items-baseline justify-between gap-3">
          <p className={`font-display text-[2rem] leading-none ${corporate ? 'text-gold-2' : 'text-berry'}`}>
            {brl(item.priceCents)}
            {corporate && <span className="ml-1 font-sans text-[0.75rem] font-semibold text-cream/60">/ un.</span>}
          </p>
          {!corporate && rules.bulkPct > 0 && (
            <p className="text-right text-[0.72rem] leading-tight font-semibold text-pine">
              {rules.bulkPct}% off a partir
              <br />
              de {rules.bulkQty} unidades
            </p>
          )}
        </div>

        {acceptingOrders && (
          <>
            {item.option && (
              <fieldset className="mt-5">
                <legend className={`label ${corporate ? '!text-cream/70' : ''} ${needOption && !option ? '!text-berry-2' : ''}`}>
                  {item.option.label}
                  {needOption && !option ? ' — escolha uma opção' : ''}
                </legend>
                <div className="flex flex-wrap gap-2" role="radiogroup">
                  {item.option.values.map((v) => (
                    <button
                      key={v}
                      type="button"
                      role="radio"
                      aria-checked={option === v}
                      onClick={() => {
                        setOption(v);
                        setNeedOption(false);
                      }}
                      className={`chip ${corporate ? '!border-cream/25 !bg-transparent !text-cream aria-checked:!border-gold aria-checked:!bg-gold aria-checked:!text-cocoa' : ''}`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </fieldset>
            )}
            <div className="mt-5 flex items-center gap-3">
              <QtyStepper value={qty} onChange={(v) => setQty(Math.max(min, v))} min={min} label={`Quantidade de ${item.name}`} />
              <button
                type="button"
                onClick={onAdd}
                className={`btn flex-1 !px-4 ${added ? 'btn-gold' : corporate ? 'btn-gold' : 'btn-primary'}`}
                data-track="natal_add"
                data-track-label={item.sku}
              >
                {added ? (
                  <>
                    <Check size={16} /> Adicionado
                  </>
                ) : (
                  <>
                    <ShoppingBag size={16} /> Adicionar
                  </>
                )}
              </button>
            </div>
            {added && (
              <button type="button" onClick={() => setOpen(true)} className={`mt-3 self-start text-[0.85rem] font-bold underline underline-offset-4 ${corporate ? 'text-gold-2' : 'text-cocoa'}`}>
                Ver carrinho
              </button>
            )}
          </>
        )}
      </div>
    </article>
  );
}
