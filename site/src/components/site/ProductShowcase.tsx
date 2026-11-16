'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { ArrowRight } from 'lucide-react';

import type { ProductView } from '@/lib/catalog';

type Item = Pick<ProductView, 'id' | 'slug' | 'name' | 'category' | 'tagline' | 'description' | 'flavors' | 'image' | 'imageAlt' | 'size'>;

/**
 * Vitrine interativa (desktop): a lista de nomes controla o palco de fotografia.
 * Passar o cursor, focar com o teclado ou tocar em um produto troca a foto com
 * transição suave e abre a descrição.
 */
export function ProductShowcase({ products }: { products: Item[] }) {
  const [active, setActive] = useState(0);
  const current = products[active] ?? products[0];
  if (!current) return null;

  return (
    <div className="grid items-center gap-16 lg:grid-cols-[1fr_1.02fr] xl:gap-24">
      <div>
        {/* A lista não muda de altura: o cursor nunca "escorrega" para outro produto. */}
        <ol className="border-t border-cocoa/12">
          {products.map((p, i) => {
            const on = i === active;
            return (
              <li key={p.id} className="border-b border-cocoa/12" onMouseEnter={() => setActive(i)}>
                <button
                  type="button"
                  className="group flex w-full items-baseline gap-5 py-[1.35rem] text-left"
                  onClick={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  aria-pressed={on}
                >
                  <span className={`w-7 shrink-0 text-[0.68rem] font-bold tracking-[0.18em] transition-colors duration-500 ${on ? 'text-caramel' : 'text-cocoa/40'}`}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span
                    className={`font-display text-[2.1rem] leading-none font-light tracking-[-0.03em] transition-[color,transform] duration-700 ease-[var(--ease-premium)] xl:text-[2.7rem] ${
                      on ? 'translate-x-2 text-cocoa italic' : 'text-cocoa/40 group-hover:text-cocoa'
                    }`}
                  >
                    {p.name}
                  </span>
                  <span className={`ml-auto text-[0.64rem] font-bold tracking-[0.2em] uppercase transition-opacity duration-500 ${on ? 'text-bronze opacity-100' : 'opacity-0'}`}>
                    {p.category}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>

        {/* descrição do produto ativo — altura reservada para a página não pular */}
        <div className="relative mt-9 min-h-[15.5rem]" aria-live="polite">
          {products.map((p, i) => (
            <div
              key={p.id}
              inert={i !== active}
              className={`absolute inset-x-0 top-0 transition-[opacity,transform] duration-700 ease-[var(--ease-premium)] ${
                i === active ? 'translate-y-0 opacity-100 delay-150' : 'pointer-events-none translate-y-3 opacity-0'
              }`}
            >
              {p.tagline && <p className="font-display text-[1.45rem] leading-snug font-light text-caramel italic">{p.tagline}</p>}
              {p.description && <p className="mt-3 max-w-lg leading-relaxed text-muted">{p.description}</p>}
              {p.flavors.length > 0 && (
                <ul className="mt-5 flex flex-wrap gap-2" aria-label="Sabores">
                  {p.flavors.map((f) => (
                    <li key={f} className="rounded-full border border-cocoa/15 bg-cream px-4 py-1.5 text-[0.82rem] font-semibold text-cocoa">
                      {f}
                    </li>
                  ))}
                </ul>
              )}
              <Link href={`/produtos/${p.slug}`} className="link-arrow mt-7 text-cocoa">
                Ver detalhes <ArrowRight size={15} />
              </Link>
            </div>
          ))}
        </div>
      </div>

      <div>
        <Link
          href={`/produtos/${current.slug}`}
          className="arch spot relative block aspect-[4/5] bg-sand shadow-[0_60px_90px_-60px_rgb(36_19_15_/_0.55)]"
          aria-label={`Ver detalhes de ${current.name}`}
          tabIndex={-1}
        >
          {products.map((p, i) => (
            <Image
              key={p.id}
              src={p.image}
              alt={i === active ? p.imageAlt || `${p.name} Doces Prigor` : ''}
              fill
              sizes="(min-width: 1024px) 44vw, 92vw"
              className="showcase-img object-cover"
              data-active={i === active}
              loading={i === 0 ? 'eager' : 'lazy'}
            />
          ))}
        </Link>
        <p className="mt-5 flex items-center justify-between text-[0.68rem] font-bold tracking-[0.2em] text-cocoa/55 uppercase" aria-hidden="true">
          <span>{current.name}</span>
          <span>
            {String(active + 1).padStart(2, '0')} / {String(products.length).padStart(2, '0')}
          </span>
        </p>
      </div>
    </div>
  );
}
