import Image from 'next/image';
import type { CSSProperties, ReactNode } from 'react';

type Vars = CSSProperties & Record<`--${string}`, string | number>;

/** Título revelado linha a linha. Cada item de `lines` é uma linha (pode conter <em>). */
export function Lines({
  lines,
  as: Tag = 'h2',
  className = '',
  id,
  delay = 0,
}: {
  lines: ReactNode[];
  as?: 'h1' | 'h2' | 'h3' | 'p';
  className?: string;
  id?: string;
  delay?: number;
}) {
  return (
    <Tag id={id} className={`lines ${className}`} data-reveal="lines" style={{ '--reveal-delay': `${delay}ms` } as Vars}>
      {lines.map((line, i) => (
        <span key={i} style={{ '--i': i } as Vars}>
          <span>{line}</span>
        </span>
      ))}
    </Tag>
  );
}

/**
 * A transição de "calda escorrendo" foi aposentada: as seções agora se encontram
 * em uma linha limpa. O componente continua existindo para não quebrar quem o usa.
 */
export function Drip(_props: { color?: string }) {
  return null;
}

/** Selo giratório com o slogan — referência ao medalhão dourado que vai sobre as tortas. */
export function Seal({ size = 148, className = '', tone = 'gold' }: { size?: number; className?: string; tone?: 'gold' | 'cocoa' }) {
  const color = tone === 'gold' ? 'var(--color-gold)' : 'var(--color-cocoa)';
  return (
    <div className={`relative shrink-0 ${className}`} style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 200 200" className="absolute inset-0 size-full animate-spin-slow" style={{ color }}>
        <defs>
          <path id="seal-ring" d="M100 100m-82 0a82 82 0 1 1 164 0a82 82 0 1 1-164 0" />
        </defs>
        <circle cx="100" cy="100" r="98" fill="none" stroke="currentColor" strokeOpacity=".35" />
        <circle cx="100" cy="100" r="66" fill="none" stroke="currentColor" strokeOpacity=".35" />
        <text fill="currentColor" fontSize="13.4" fontWeight="700" letterSpacing="3.1" style={{ fontFamily: 'var(--font-sans)' }}>
          <textPath href="#seal-ring" textLength="508">
            A FELICIDADE EM FORMA DE BROWNIE ✦ DOCES PRIGOR ✦
          </textPath>
        </text>
      </svg>
      <Image
        src="/brand/logo-doces-prigor.png"
        alt=""
        width={110}
        height={97}
        className="absolute top-1/2 left-1/2 w-[46%] -translate-x-1/2 -translate-y-1/2"
      />
    </div>
  );
}

/** Faixa de texto em movimento contínuo. */
export function Marquee({ items, className = '' }: { items: string[]; className?: string }) {
  const row = (hidden: boolean) => (
    <ul className="flex shrink-0 items-center" aria-hidden={hidden || undefined}>
      {items.map((item, i) => (
        <li key={i} className="flex items-center whitespace-nowrap">
          <span className="px-6 md:px-10">{item}</span>
          <span className="text-[0.5em] text-gold" aria-hidden="true">
            ✦
          </span>
        </li>
      ))}
    </ul>
  );
  return (
    <div className={`overflow-hidden ${className}`}>
      <div className="marquee">
        {row(false)}
        {row(true)}
      </div>
    </div>
  );
}

export function vars(v: Record<`--${string}`, string | number>): CSSProperties {
  return v as CSSProperties;
}

/** Título revelado palavra a palavra. `emphasis` marca palavras que saem em itálico dourado. */
export function Words({ text, emphasis = [], delay = 0 }: { text: string; emphasis?: string[]; delay?: number }) {
  const norm = (w: string) => w.toLowerCase().replace(/[^\p{L}]/gu, '');
  const em = new Set(emphasis.map(norm));
  return (
    <>
      <span className="sr-only">{text}</span>
      <span className="words" aria-hidden="true">
      {text.split(/\s+/).map((word, i) => (
        <span key={i} style={{ '--i': i, '--d': `${delay}ms` } as Vars}>
          <span>{em.has(norm(word)) ? <em className="text-gold-grad pr-[0.06em]">{word}</em> : word}</span>
        </span>
      ))}
      </span>
    </>
  );
}
