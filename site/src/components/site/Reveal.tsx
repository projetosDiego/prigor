'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Runtime de movimento do site — um único componente, sem biblioteca de animação.
 *
 *  [data-reveal]    entra na tela → recebe .is-visible (CSS faz a transição)
 *  [data-parallax]  recebe --p (-1…1) conforme atravessa a tela
 *  [data-scrub]     recebe --s (0…1) conforme sobe pela tela (transição de calda)
 *  [data-pointer]   recebe --mx / --my (-1…1) com a posição do cursor
 *  .spot            recebe --lx / --ly (px) — "luz de vitrine" que segue o cursor
 *
 * Com prefers-reduced-motion nada é animado: tudo aparece no estado final.
 */
export function RevealObserver() {
  const pathname = usePathname();

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('js');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* ---- revelações ---- */
    const reveals = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]:not(.is-visible)'));
    let io: IntersectionObserver | null = null;
    if (reduced || !('IntersectionObserver' in window)) {
      reveals.forEach((el) => el.classList.add('is-visible'));
    } else {
      io = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              entry.target.classList.add('is-visible');
              io?.unobserve(entry.target);
            }
          }
        },
        { rootMargin: '0px 0px -7% 0px', threshold: 0.06 },
      );
      reveals.forEach((el) => io?.observe(el));
    }
    if (reduced) return () => io?.disconnect();

    /* ---- parallax e calda, ligados à rolagem ---- */
    const parallax = Array.from(document.querySelectorAll<HTMLElement>('[data-parallax]'));
    const scrubs = Array.from(document.querySelectorAll<HTMLElement>('[data-scrub]'));
    let frame = 0;
    const update = () => {
      frame = 0;
      const vh = window.innerHeight;
      for (const el of parallax) {
        const host = el.parentElement ?? el;
        const r = host.getBoundingClientRect();
        if (r.bottom < -200 || r.top > vh + 200) continue;
        const p = (r.top + r.height / 2 - vh / 2) / (vh / 2 + r.height / 2);
        el.style.setProperty('--p', Math.max(-1, Math.min(1, p)).toFixed(4));
      }
      for (const el of scrubs) {
        const r = el.getBoundingClientRect();
        if (r.top > vh + 100 || r.top < -400) continue;
        const s = (vh - r.top) / (vh * 0.85);
        el.style.setProperty('--s', Math.max(0, Math.min(1, s)).toFixed(4));
      }
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });

    /* ---- cursor ---- */
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    let pFrame = 0;
    let last: PointerEvent | null = null;
    const applyPointer = () => {
      pFrame = 0;
      const e = last;
      if (!e) return;
      const target = e.target as Element | null;
      const spot = target?.closest<HTMLElement>('.spot');
      if (spot) {
        const r = spot.getBoundingClientRect();
        spot.style.setProperty('--lx', `${(e.clientX - r.left).toFixed(0)}px`);
        spot.style.setProperty('--ly', `${(e.clientY - r.top).toFixed(0)}px`);
      }
      const stage = target?.closest<HTMLElement>('[data-pointer]');
      if (stage) {
        const r = stage.getBoundingClientRect();
        stage.style.setProperty('--mx', (((e.clientX - r.left) / r.width) * 2 - 1).toFixed(3));
        stage.style.setProperty('--my', (((e.clientY - r.top) / r.height) * 2 - 1).toFixed(3));
        stage.style.setProperty('--cx', `${(e.clientX - r.left).toFixed(0)}px`);
        stage.style.setProperty('--cy', `${(e.clientY - r.top).toFixed(0)}px`);
      }
    };
    const onPointer = (e: PointerEvent) => {
      last = e;
      if (!pFrame) pFrame = requestAnimationFrame(applyPointer);
    };
    if (fine) window.addEventListener('pointermove', onPointer, { passive: true });

    return () => {
      io?.disconnect();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      window.removeEventListener('pointermove', onPointer);
      if (frame) cancelAnimationFrame(frame);
      if (pFrame) cancelAnimationFrame(pFrame);
    };
  }, [pathname]);

  return null;
}
