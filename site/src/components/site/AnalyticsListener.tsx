'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

import { track, type EventName } from '@/lib/analytics';

/**
 * Captura cliques em qualquer elemento com data-track="evento" (e data-track-label).
 * Assim as páginas continuam Server Components e os CTAs são rastreados sem JS extra.
 */
export function AnalyticsListener() {
  const pathname = usePathname();

  useEffect(() => {
    track('page_view', { label: document.title });
  }, [pathname]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      const el = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-track]');
      if (!el) return;
      track(el.dataset.track as EventName, { label: el.dataset.trackLabel ?? el.textContent?.trim().slice(0, 60) ?? '' });
    }
    document.addEventListener('click', onClick, { capture: true });
    return () => document.removeEventListener('click', onClick, { capture: true });
  }, []);

  return null;
}
