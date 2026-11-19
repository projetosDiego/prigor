'use client';

/**
 * "Perto de mim" — mapa de campo do vendedor.
 *
 * Mostra onde ele está, os clientes Prigor e os leads da carteira dele ao redor,
 * e deixa buscar estabelecimentos NOVOS na área do mapa (Google Places), que
 * entram direto como leads dele. O mapa em si é OpenStreetMap (grátis); só o
 * botão "Buscar novos aqui" consome a cota do Google.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Loader2, LocateFixed, Navigation, Route, Search } from 'lucide-react';

import { escapeHtml, loadLeaflet, type LeafletLayer, type LeafletMap, type LeafletStatic } from '@/lib/leaflet-loader';
import { distanceKm, nearestNeighborOrder } from '@/server/domain/geo';

type PointKind = 'CUSTOMER' | 'LEAD' | 'NEW';

interface Point {
  id: string;
  kind: PointKind;
  tradeName: string;
  category: string;
  address: string;
  latitude: number;
  longitude: number;
  score?: number;
}

interface NearbyPlaceDTO {
  id: string;
  tradeName: string;
  category: string;
  address: string;
  latitude: number;
  longitude: number;
  score?: number;
}

interface NearbyResponse {
  customers?: NearbyPlaceDTO[];
  leads?: NearbyPlaceDTO[];
}

interface DiscoverResponse {
  found: number;
  newLeads: NearbyPlaceDTO[];
  duplicates: number;
  existingCustomers: number;
  remainingToday: number;
}

interface ApiErrorBody {
  error?: { message?: string };
}

/** Centro do Rio — usado só até o GPS responder. */
const RIO: [number, number] = [-22.9068, -43.1729];

const CATEGORIES: { value: string; label: string }[] = [
  { value: 'padarias', label: 'Padarias' },
  { value: 'lanchonetes', label: 'Lanchonetes' },
  { value: 'bares', label: 'Bares e botecos' },
  { value: 'cafeterias', label: 'Cafeterias' },
  { value: 'restaurantes', label: 'Restaurantes' },
  { value: 'mercados', label: 'Mercados' },
  { value: 'conveniencias', label: 'Conveniências' },
  { value: 'acaiterias', label: 'Açaiterias' },
];

const COLORS: Record<PointKind, string> = {
  CUSTOMER: '#059669', // verde: já é cliente
  LEAD: '#ea580c', // laranja: lead da carteira
  NEW: '#2563eb', // azul: acabou de ser descoberto
};

/** Paradas máximas num link de rota do Google Maps (origem + 9 waypoints + destino). */
const MAX_ROUTE_STOPS = 10;

function formatDistance(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1).replace('.', ',')} km`;
}

function directionsUrl(p: { latitude: number; longitude: number }): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${p.latitude},${p.longitude}`;
}

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as ApiErrorBody;
    return body.error?.message ?? fallback;
  } catch {
    return fallback;
  }
}

export default function SellerNearbyPage() {
  const mapEl = useRef<HTMLDivElement | null>(null);
  const leafletRef = useRef<LeafletStatic | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef<(LeafletLayer & { clearLayers(): void; addLayer(layer: LeafletLayer): void }) | null>(null);
  const meRef = useRef<LeafletLayer | null>(null);
  const radiusRef = useRef<LeafletLayer | null>(null);

  const [me, setMe] = useState<{ latitude: number; longitude: number } | null>(null);
  const [points, setPoints] = useState<Point[]>([]);
  const [radiusKm, setRadiusKm] = useState(1);
  const [category, setCategory] = useState('padarias');
  const [filter, setFilter] = useState<'ALL' | PointKind>('ALL');

  const [mapReady, setMapReady] = useState(false);
  const [locating, setLocating] = useState(false);
  const [loadingNearby, setLoadingNearby] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'error' | 'info'; text: string } | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);

  // ── Mapa ────────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    loadLeaflet()
      .then((L) => {
        if (cancelled || !mapEl.current || mapRef.current) return;
        leafletRef.current = L;
        const map = L.map(mapEl.current, { zoomControl: true }).setView(RIO, 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; OpenStreetMap',
        }).addTo(map);
        const group = L.layerGroup();
        group.addTo(map);
        markersRef.current = group;
        mapRef.current = map;
        setMapReady(true);
      })
      .catch((err: unknown) => {
        setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Falha ao carregar o mapa.' });
      });
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // ── Dados ao redor ──────────────────────────────────────────────────────
  const loadNearby = useCallback(async (center: { latitude: number; longitude: number }, radius: number) => {
    setLoadingNearby(true);
    try {
      const res = await fetch(`/api/maps/nearby?lat=${center.latitude}&lng=${center.longitude}&radius=${radius}`);
      if (!res.ok) throw new Error(await readError(res, 'Não consegui carregar os pontos ao redor.'));
      const data = (await res.json()) as NearbyResponse;
      const customers: Point[] = (data.customers ?? []).map((c) => ({ ...c, kind: 'CUSTOMER' }));
      const leads: Point[] = (data.leads ?? []).map((l) => ({ ...l, kind: 'LEAD' }));
      setPoints((prev) => {
        // Mantém os recém-descobertos marcados em azul até a próxima busca.
        const fresh = new Set(prev.filter((p) => p.kind === 'NEW').map((p) => p.id));
        return [...customers, ...leads.map((l) => (fresh.has(l.id) ? { ...l, kind: 'NEW' as const } : l))];
      });
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Erro ao carregar pontos.' });
    } finally {
      setLoadingNearby(false);
    }
  }, []);

  const locate = useCallback(() => {
    if (!navigator.geolocation) {
      setMessage({ type: 'error', text: 'Este aparelho não tem GPS disponível no navegador.' });
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const here = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        setMe(here);
        setLocating(false);
        mapRef.current?.setView([here.latitude, here.longitude], 15);
      },
      () => {
        setLocating(false);
        setMessage({
          type: 'error',
          text: 'Não consegui pegar sua localização. Libere o GPS para este site nas permissões do navegador.',
        });
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );
  }, []);

  // GPS assim que o mapa existir.
  useEffect(() => {
    if (mapReady) locate();
  }, [mapReady, locate]);

  // Recarrega os pontos quando a posição ou o raio mudam.
  useEffect(() => {
    if (me) void loadNearby(me, radiusKm);
  }, [me, radiusKm, loadNearby]);

  // ── Desenho ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    const group = markersRef.current;
    if (!L || !map || !group) return;

    if (me) {
      const pos: [number, number] = [me.latitude, me.longitude];
      meRef.current?.remove();
      radiusRef.current?.remove();
      radiusRef.current = L.circle(pos, {
        radius: radiusKm * 1000,
        color: '#b45309',
        weight: 1,
        fillOpacity: 0.04,
      }).addTo(map);
      meRef.current = L.circleMarker(pos, {
        radius: 8,
        color: '#ffffff',
        weight: 3,
        fillColor: '#1d4ed8',
        fillOpacity: 1,
      })
        .bindPopup('<b>Você está aqui</b>')
        .addTo(map);
    }

    group.clearLayers();
    for (const p of points) {
      if (filter !== 'ALL' && p.kind !== filter) continue;
      const label = p.kind === 'CUSTOMER' ? 'Cliente Prigor' : p.kind === 'NEW' ? 'Novo lead' : 'Lead';
      const details =
        p.kind === 'CUSTOMER' ? '' : `<a href="/seller/lead/${p.id}" style="font-weight:700">Abrir lead</a> · `;
      const html =
        `<div style="font-size:12px;line-height:1.35">` +
        `<b>${escapeHtml(p.tradeName)}</b><br/>` +
        `<span style="color:${COLORS[p.kind]};font-weight:700">${label}</span>` +
        (p.score !== undefined && p.kind !== 'CUSTOMER' ? ` · score ${p.score}` : '') +
        `<br/><span style="color:#78716c">${escapeHtml(p.address)}</span><br/>` +
        `${details}<a href="${directionsUrl(p)}" target="_blank" rel="noopener">Como chegar</a></div>`;
      group.addLayer(
        L.circleMarker([p.latitude, p.longitude], {
          radius: p.kind === 'NEW' ? 9 : 7,
          color: '#ffffff',
          weight: 2,
          fillColor: COLORS[p.kind],
          fillOpacity: 0.95,
        }).bindPopup(html),
      );
    }
  }, [points, me, radiusKm, filter]);

  // ── Ações ───────────────────────────────────────────────────────────────
  const discoverHere = async () => {
    const map = mapRef.current;
    if (!map) return;
    const c = map.getCenter();
    setDiscovering(true);
    setMessage(null);
    try {
      const res = await fetch('/api/maps/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat: c.lat, lng: c.lng, category, radius: radiusKm }),
      });
      if (!res.ok) throw new Error(await readError(res, 'A busca falhou.'));
      const data = (await res.json()) as DiscoverResponse;
      setRemaining(data.remainingToday);

      const fresh: Point[] = data.newLeads.map((l) => ({ ...l, kind: 'NEW' }));
      setPoints((prev) => [...prev.filter((p) => !fresh.some((f) => f.id === p.id)), ...fresh]);

      const parts = [`${data.newLeads.length} novo(s) lead(s) na sua carteira`];
      if (data.duplicates) parts.push(`${data.duplicates} já eram leads`);
      if (data.existingCustomers) parts.push(`${data.existingCustomers} já são clientes`);
      setMessage({
        type: data.newLeads.length ? 'ok' : 'info',
        text: data.found === 0 ? 'Nada encontrado nessa área. Tente outra categoria ou aumente o raio.' : parts.join(' · '),
      });
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'A busca falhou.' });
    } finally {
      setDiscovering(false);
    }
  };

  const openRoute = () => {
    if (!me) return;
    const leads = points.filter((p) => p.kind !== 'CUSTOMER');
    if (leads.length === 0) {
      setMessage({ type: 'info', text: 'Nenhum lead no raio para montar rota.' });
      return;
    }
    const ordered = nearestNeighborOrder(me, leads).slice(0, MAX_ROUTE_STOPS);
    const destination = ordered[ordered.length - 1];
    const waypoints = ordered.slice(0, -1).map((p) => `${p.latitude},${p.longitude}`).join('|');
    const url =
      `https://www.google.com/maps/dir/?api=1&origin=${me.latitude},${me.longitude}` +
      `&destination=${destination.latitude},${destination.longitude}` +
      (waypoints ? `&waypoints=${encodeURIComponent(waypoints)}` : '') +
      '&travelmode=walking';
    window.open(url, '_blank', 'noopener');
  };

  const list = points
    .filter((p) => filter === 'ALL' || p.kind === filter)
    .map((p) => ({ ...p, distance: me ? distanceKm(me, p) : null }))
    .sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0));

  const counts = {
    CUSTOMER: points.filter((p) => p.kind === 'CUSTOMER').length,
    LEAD: points.filter((p) => p.kind === 'LEAD').length,
    NEW: points.filter((p) => p.kind === 'NEW').length,
  };

  return (
    <div className="max-w-md mx-auto space-y-3">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-stone-900">Perto de mim</h2>
          <p className="text-xs text-stone-500 font-semibold">Clientes, leads e novos pontos ao seu redor</p>
        </div>
        <button
          onClick={locate}
          disabled={locating}
          className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800 hover:bg-amber-100 cursor-pointer"
        >
          {locating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LocateFixed className="h-3.5 w-3.5" />}
          Onde estou
        </button>
      </div>

      {/* Mapa */}
      <div className="relative rounded-2xl overflow-hidden border border-stone-200 shadow-sm">
        <div ref={mapEl} className="h-80 w-full bg-stone-100" />
        {(!mapReady || loadingNearby) && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[500] rounded-full bg-white/95 px-3 py-1 text-[10px] font-bold text-stone-600 shadow flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" /> {mapReady ? 'Atualizando…' : 'Carregando mapa…'}
          </div>
        )}
        <div className="absolute bottom-2 left-2 z-[500] rounded-lg bg-white/95 p-1.5 shadow text-[9px] font-extrabold text-stone-700 space-y-0.5">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full block" style={{ background: COLORS.CUSTOMER }} /> Clientes ({counts.CUSTOMER})</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full block" style={{ background: COLORS.LEAD }} /> Leads ({counts.LEAD})</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full block" style={{ background: COLORS.NEW }} /> Novos ({counts.NEW})</span>
        </div>
      </div>

      {/* Controles */}
      <div className="rounded-xl bg-white p-3 shadow-sm border border-stone-200 space-y-2 text-xs">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[10px] font-bold text-stone-500 uppercase mb-1">Procurar</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="block w-full rounded-lg border border-stone-300 bg-stone-50 p-2 text-stone-800"
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-stone-500 uppercase mb-1">Raio</label>
            <select
              value={radiusKm}
              onChange={(e) => setRadiusKm(Number(e.target.value))}
              className="block w-full rounded-lg border border-stone-300 bg-stone-50 p-2 text-stone-800"
            >
              <option value={0.5}>500 m (a pé)</option>
              <option value={1}>1 km</option>
              <option value={2}>2 km</option>
              <option value={3}>3 km</option>
            </select>
          </div>
        </div>

        <button
          onClick={discoverHere}
          disabled={!mapReady || discovering}
          className="w-full flex items-center justify-center gap-2 rounded-lg bg-amber-700 hover:bg-amber-800 disabled:opacity-60 px-3 py-2.5 text-sm font-bold text-white cursor-pointer"
        >
          {discovering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Buscar novos pontos aqui
        </button>
        <p className="text-[10px] text-stone-400 text-center">
          Busca no centro do mapa — arraste o mapa para procurar em outro lugar.
          {remaining !== null && ` Restam ${remaining} buscas hoje.`}
        </p>

        <button
          onClick={openRoute}
          disabled={!me}
          className="w-full flex items-center justify-center gap-2 rounded-lg border border-stone-300 bg-white hover:bg-stone-50 disabled:opacity-60 px-3 py-2 text-xs font-bold text-stone-700 cursor-pointer"
        >
          <Route className="h-4 w-4" />
          Montar rota com os leads mais próximos
        </button>
      </div>

      {message && (
        <div
          className={`rounded-lg px-3 py-2 text-xs font-semibold border ${
            message.type === 'ok'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : message.type === 'error'
                ? 'bg-red-50 text-red-700 border-red-200'
                : 'bg-stone-50 text-stone-700 border-stone-200'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Lista por distância */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-xs font-bold text-stone-500 uppercase tracking-wider">Mais perto primeiro</h3>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as 'ALL' | PointKind)}
            className="rounded border border-stone-300 bg-white px-1.5 py-1 text-[10px] font-semibold text-stone-700"
          >
            <option value="ALL">Todos</option>
            <option value="NEW">Novos</option>
            <option value="LEAD">Leads</option>
            <option value="CUSTOMER">Clientes</option>
          </select>
        </div>

        {list.length === 0 ? (
          <p className="text-xs text-stone-400 italic text-center p-4">
            {me ? 'Nada no raio. Use "Buscar novos pontos aqui".' : 'Aguardando sua localização…'}
          </p>
        ) : (
          list.map((p) => (
            <div key={`${p.kind}-${p.id}`} className="flex items-center justify-between p-3 bg-white border border-stone-200 rounded-xl text-xs">
              <div className="min-w-0 flex-1 pr-2">
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ background: COLORS[p.kind] }} />
                  <h4 className="font-bold text-stone-800 truncate">{p.tradeName}</h4>
                </div>
                <p className="text-[10px] text-stone-400 truncate mt-0.5">{p.address}</p>
                <p className="text-[10px] font-semibold text-stone-500 mt-0.5">
                  {p.distance !== null && formatDistance(p.distance)}
                  {p.kind !== 'CUSTOMER' && p.score !== undefined && ` · score ${p.score}`}
                  {p.kind === 'CUSTOMER' && ' · já é cliente'}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {p.kind !== 'CUSTOMER' && (
                  <Link href={`/seller/lead/${p.id}`} className="rounded bg-stone-100 hover:bg-amber-100 px-2 py-1 font-semibold">
                    Abrir
                  </Link>
                )}
                <a
                  href={directionsUrl(p)}
                  target="_blank"
                  rel="noopener"
                  className="rounded bg-amber-50 text-amber-800 hover:bg-amber-100 p-1.5"
                  aria-label="Como chegar"
                >
                  <Navigation className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
