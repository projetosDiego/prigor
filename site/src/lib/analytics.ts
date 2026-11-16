/**
 * Camada única de eventos de conversão.
 *
 * Todo evento vai para: dataLayer (GTM), gtag (GA4), fbq (Meta Pixel) quando
 * existirem, e para /api/events — o registro próprio que alimenta o painel.
 * Para trocar/adicionar ferramentas, só este arquivo muda.
 */
export type EventName =
  | 'page_view'
  | 'whatsapp_click'
  | 'cta_experimentar'
  | 'cta_vender'
  | 'instagram_click'
  | 'point_search'
  | 'point_geolocation'
  | 'point_directions'
  | 'lead_submit';

type Payload = { label?: string; [key: string]: unknown };

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    fbq?: (...args: unknown[]) => void;
  }
}

function sessionId(): string {
  try {
    let id = sessionStorage.getItem('dp_sid');
    if (!id) {
      id = Math.random().toString(36).slice(2) + Date.now().toString(36);
      sessionStorage.setItem('dp_sid', id);
    }
    return id;
  } catch {
    return '';
  }
}

export function track(event: EventName, payload: Payload = {}): void {
  if (typeof window === 'undefined') return;
  const data = { ...payload, path: window.location.pathname };

  window.dataLayer?.push({ event, ...data });
  window.gtag?.('event', event, data);
  if (event === 'lead_submit') window.fbq?.('track', 'Lead');
  if (event === 'whatsapp_click') window.fbq?.('track', 'Contact');

  try {
    const body = JSON.stringify({ type: event, label: payload.label ?? '', path: data.path, sid: sessionId(), meta: payload });
    if (navigator.sendBeacon) navigator.sendBeacon('/api/events', new Blob([body], { type: 'application/json' }));
    else void fetch('/api/events', { method: 'POST', body, keepalive: true, headers: { 'content-type': 'application/json' } });
  } catch {
    /* analytics nunca quebra a navegação */
  }
}
