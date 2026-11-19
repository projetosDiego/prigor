/**
 * Carrega o Leaflet (mapa com OpenStreetMap) sob demanda, direto da CDN.
 *
 * Sem dependência nova no package.json e sem custo: os mapas do OpenStreetMap
 * são gratuitos. Só as telas de mapa pagam o download (~40 KB).
 */

const VERSION = '1.9.4';
const BASE = `https://unpkg.com/leaflet@${VERSION}/dist`;

/** Subconjunto da API do Leaflet que as telas usam. */
export interface LeafletLayer {
  addTo(map: LeafletMap): LeafletLayer;
  remove(): void;
  bindPopup(html: string): LeafletLayer;
  setLatLng?(latlng: [number, number]): LeafletLayer;
  setRadius?(meters: number): LeafletLayer;
}

export interface LeafletMap {
  setView(center: [number, number], zoom: number): LeafletMap;
  getCenter(): { lat: number; lng: number };
  on(event: string, handler: () => void): LeafletMap;
  remove(): void;
  invalidateSize(): void;
}

export interface LeafletStatic {
  map(el: HTMLElement, options?: Record<string, unknown>): LeafletMap;
  tileLayer(url: string, options?: Record<string, unknown>): LeafletLayer;
  circleMarker(latlng: [number, number], options?: Record<string, unknown>): LeafletLayer;
  circle(latlng: [number, number], options?: Record<string, unknown>): LeafletLayer;
  layerGroup(): LeafletLayer & { clearLayers(): void; addLayer(layer: LeafletLayer): void };
}

declare global {
  interface Window {
    L?: LeafletStatic;
  }
}

let loading: Promise<LeafletStatic> | null = null;

export function loadLeaflet(): Promise<LeafletStatic> {
  if (typeof window === 'undefined') return Promise.reject(new Error('Leaflet só roda no navegador.'));
  if (window.L) return Promise.resolve(window.L);
  if (loading) return loading;

  loading = new Promise<LeafletStatic>((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = `${BASE}/leaflet.css`;
    document.head.appendChild(css);

    const script = document.createElement('script');
    script.src = `${BASE}/leaflet.js`;
    script.async = true;
    script.onload = () => (window.L ? resolve(window.L) : reject(new Error('Leaflet não carregou.')));
    script.onerror = () => {
      loading = null;
      reject(new Error('Não consegui carregar o mapa. Verifique a internet.'));
    };
    document.head.appendChild(script);
  });
  return loading;
}

/** Escapa texto que vai dentro do HTML de um popup do mapa. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
