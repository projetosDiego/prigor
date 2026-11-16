'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Clock, Loader2, LocateFixed, MapPin, Navigation, Search, X } from 'lucide-react';

import { track } from '@/lib/analytics';
import type { PointView } from '@/lib/catalog';
import { directionsUrl, distanceKm, formatDistance, mapEmbedUrl, type LatLng } from '@/lib/geo';
import { instagramHandle, normalize, onlyDigits } from '@/lib/text';
import { waLink } from '@/lib/whatsapp';
import { InstagramIcon, WhatsAppIcon } from '../icons';

type Origin = { point: LatLng; label: string } | null;
type Status = { kind: 'idle' } | { kind: 'loading'; text: string } | { kind: 'error'; text: string };

async function geocodeQuery(q: string): Promise<LatLng | null> {
  try {
    const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { lat?: number; lng?: number };
    return typeof data.lat === 'number' && typeof data.lng === 'number' ? { lat: data.lat, lng: data.lng } : null;
  } catch {
    return null;
  }
}

async function lookupCep(cep: string): Promise<{ bairro: string; localidade: string; uf: string; logradouro: string } | null> {
  try {
    const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.erro ? null : data;
  } catch {
    return null;
  }
}

export function PointFinder({
  points,
  pointMessage,
  findWhatsappHref,
  initialQuery = '',
  autoLocate = false,
}: {
  points: PointView[];
  pointMessage: string;
  findWhatsappHref: string;
  initialQuery?: string;
  autoLocate?: boolean;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [applied, setApplied] = useState(initialQuery);
  const [origin, setOrigin] = useState<Origin>(null);
  const [cepArea, setCepArea] = useState<{ bairro: string; cidade: string } | null>(null);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [city, setCity] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const cities = useMemo(() => Array.from(new Set(points.map((p) => p.city).filter(Boolean))).sort(), [points]);
  const hasCoords = points.some((p) => p.latitude != null && p.longitude != null);

  const results = useMemo(() => {
    let list = points.map((p) => ({
      point: p,
      distance:
        origin && p.latitude != null && p.longitude != null
          ? distanceKm(origin.point, { lat: p.latitude, lng: p.longitude })
          : null,
    }));

    if (city) list = list.filter((r) => r.point.city === city);

    const q = normalize(applied);
    const isCep = onlyDigits(applied).length === 8 && /^[\d\s.-]+$/.test(applied.trim());

    if (q && !isCep && !origin) {
      const tokens = q.split(' ');
      list = list.filter((r) => {
        const hay = normalize(
          [r.point.name, r.point.address, r.point.neighborhood, r.point.city, r.point.state, r.point.zipCode].join(' '),
        );
        return tokens.every((t) => hay.includes(t));
      });
    }

    if (isCep && !origin && cepArea) {
      const b = normalize(cepArea.bairro);
      const c = normalize(cepArea.cidade);
      const sameArea = list.filter((r) => normalize(r.point.neighborhood) === b || normalize(r.point.city) === c);
      list = sameArea.sort((a, z) => Number(normalize(z.point.neighborhood) === b) - Number(normalize(a.point.neighborhood) === b));
    }

    if (origin) {
      list = [...list].sort((a, z) => (a.distance ?? Infinity) - (z.distance ?? Infinity));
    }
    return list;
  }, [points, origin, applied, city, cepArea]);

  const selected = results.find((r) => r.point.id === selectedId)?.point ?? results[0]?.point ?? null;

  const locate = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setStatus({ kind: 'error', text: 'Seu navegador não permite localização. Busque por bairro, cidade ou CEP.' });
      return;
    }
    setStatus({ kind: 'loading', text: 'Buscando sua localização…' });
    track('point_geolocation', { label: 'solicitada' });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setOrigin({ point: { lat: pos.coords.latitude, lng: pos.coords.longitude }, label: 'sua localização' });
        setApplied('');
        setQuery('');
        setCepArea(null);
        setSelectedId(null);
        setStatus({ kind: 'idle' });
        track('point_geolocation', { label: 'concedida' });
      },
      () => {
        setStatus({ kind: 'error', text: 'Não conseguimos acessar sua localização. Busque por bairro, cidade ou CEP.' });
        track('point_geolocation', { label: 'negada' });
      },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 },
    );
  }, []);

  useEffect(() => {
    if (!autoLocate) return;
    const t = setTimeout(locate, 0);
    return () => clearTimeout(t);
  }, [autoLocate, locate]);

  async function submit(value: string) {
    const q = value.trim();
    setSelectedId(null);
    setOrigin(null);
    setCepArea(null);
    setApplied(q);
    if (!q) return;
    track('point_search', { label: q });

    const cep = onlyDigits(q);
    if (cep.length === 8 && /^[\d\s.-]+$/.test(q)) {
      setStatus({ kind: 'loading', text: 'Consultando o CEP…' });
      const info = await lookupCep(cep);
      if (!info) {
        setStatus({ kind: 'error', text: 'CEP não encontrado. Confira os números ou busque pelo bairro.' });
        return;
      }
      setCepArea({ bairro: info.bairro, cidade: info.localidade });
      if (hasCoords) {
        const point = await geocodeQuery(`${info.logradouro ? `${info.logradouro}, ` : ''}${info.bairro}, ${info.localidade} - ${info.uf}`);
        if (point) setOrigin({ point, label: [info.bairro, info.localidade].filter(Boolean).join(', ') });
      }
      setStatus({ kind: 'idle' });
      return;
    }
    setStatus({ kind: 'idle' });
  }

  async function searchNearby() {
    if (!applied) return;
    setStatus({ kind: 'loading', text: `Procurando pontos perto de “${applied}”…` });
    const point = await geocodeQuery(applied);
    if (point) {
      setOrigin({ point, label: applied });
      setStatus({ kind: 'idle' });
    } else {
      setStatus({ kind: 'error', text: 'Não encontramos esse local. Tente um bairro ou cidade.' });
    }
  }

  function clear() {
    setQuery('');
    setApplied('');
    setOrigin(null);
    setCepArea(null);
    setCity('');
    setStatus({ kind: 'idle' });
  }

  function choose(id: string) {
    setSelectedId(id);
  }

  if (points.length === 0) {
    return (
      <div className="rounded-[1.8rem] border border-line bg-white/60 p-8 text-center md:p-14">
        <MapPin className="mx-auto text-bronze" size={34} strokeWidth={1.5} />
        <h2 className="mt-5 text-3xl font-medium text-cocoa md:text-4xl">Estamos atualizando a lista de pontos.</h2>
        <p className="mx-auto mt-4 max-w-lg text-muted">
          Enquanto isso, fale com a gente pelo WhatsApp: indicamos onde encontrar a Doces Prigor perto de você.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <a href={findWhatsappHref} target="_blank" rel="noopener" className="btn btn-whatsapp" data-track="whatsapp_click" data-track-label="onde-encontrar:vazio">
            <WhatsAppIcon size={18} /> Quero saber onde encontrar
          </a>
          <Link href="/seja-um-revendedor" className="btn btn-outline" data-track="cta_vender" data-track-label="onde-encontrar:vazio">
            Quero ser um ponto de venda
          </Link>
        </div>
      </div>
    );
  }

  const isFiltered = Boolean(applied || origin || city);

  return (
    <div>
      {/* Busca */}
      <div className="rounded-[1.6rem] bg-cocoa p-4 md:p-5">
        <form
          role="search"
          className="flex flex-col gap-3 md:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            void submit(query);
          }}
        >
          <label htmlFor="busca-ponto" className="sr-only">
            Bairro, cidade, CEP ou nome do estabelecimento
          </label>
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted" size={19} />
            <input
              id="busca-ponto"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Bairro, cidade, CEP ou estabelecimento"
              className="field !rounded-full !border-0 !pl-12"
              autoComplete="off"
              enterKeyHint="search"
            />
          </div>
          <div className="grid grid-cols-2 gap-3 md:flex">
            <button type="submit" className="btn btn-light">
              Buscar
            </button>
            <button type="button" onClick={locate} className="btn btn-outline-light !px-4">
              <LocateFixed size={17} /> <span className="md:hidden lg:inline">Usar minha localização</span>
              <span className="hidden md:inline lg:hidden">Perto de mim</span>
            </button>
          </div>
        </form>

        {cities.length > 1 && (
          <div className="mt-4 flex gap-2 overflow-x-auto pb-1" aria-label="Filtrar por cidade">
            <button
              type="button"
              onClick={() => setCity('')}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition ${!city ? 'bg-cream text-cocoa' : 'bg-cream/10 text-cream/80 hover:bg-cream/20'}`}
            >
              Todas as cidades
            </button>
            {cities.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCity(c === city ? '' : c)}
                className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition ${city === c ? 'bg-cream text-cocoa' : 'bg-cream/10 text-cream/80 hover:bg-cream/20'}`}
              >
                {c}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Status */}
      <div className="mt-5 flex min-h-7 flex-wrap items-center justify-between gap-3 text-sm" aria-live="polite">
        <p className="text-muted">
          {status.kind === 'loading' ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="animate-spin" size={16} /> {status.text}
            </span>
          ) : status.kind === 'error' ? (
            <span className="text-terracotta">{status.text}</span>
          ) : origin ? (
            <>
              {results.length} {results.length === 1 ? 'ponto' : 'pontos'} — do mais perto ao mais longe de <strong className="text-cocoa">{origin.label}</strong>
            </>
          ) : (
            <>
              {results.length} {results.length === 1 ? 'ponto de venda' : 'pontos de venda'}
              {applied && (
                <>
                  {' '}para <strong className="text-cocoa">“{applied}”</strong>
                </>
              )}
            </>
          )}
        </p>
        {isFiltered && (
          <button type="button" onClick={clear} className="inline-flex items-center gap-1 font-semibold text-cocoa hover:text-bronze">
            <X size={15} /> Limpar busca
          </button>
        )}
      </div>

      {results.length === 0 && status.kind !== 'loading' ? (
        <div className="mt-6 rounded-[1.6rem] border border-line bg-white/60 p-8 md:p-10">
          <p className="font-display text-2xl text-cocoa">Nenhum ponto encontrado com essa busca.</p>
          <p className="mt-2 text-muted">Tente outro bairro, veja todos os pontos ou pergunte no WhatsApp.</p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            {hasCoords && applied && !origin && (
              <button type="button" onClick={searchNearby} className="btn btn-primary">
                <MapPin size={17} /> Ver os mais próximos
              </button>
            )}
            <button type="button" onClick={clear} className="btn btn-outline">
              Ver todos os pontos
            </button>
            <a href={findWhatsappHref} target="_blank" rel="noopener" className="btn btn-whatsapp" data-track="whatsapp_click" data-track-label="onde-encontrar:sem-resultado">
              <WhatsAppIcon size={18} /> Perguntar
            </a>
          </div>
        </div>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.05fr]">
          <div className="grid content-start gap-3">
            {results.map(({ point, distance }) => {
              const active = selected?.id === point.id;
              const ig = instagramHandle(point.instagram);
              return (
                <article
                  key={point.id}
                  className={`rounded-[1.4rem] border bg-white/70 p-5 transition md:p-6 ${active ? 'border-cocoa shadow-[0_18px_40px_-24px_rgb(42_24_18_/_0.45)]' : 'border-line hover:border-bronze-2'}`}
                >
                  <button type="button" onClick={() => choose(point.id)} className="block w-full text-left" aria-pressed={active}>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-[0.7rem] font-bold tracking-[0.18em] text-bronze uppercase">
                          {[point.neighborhood, point.city].filter(Boolean).join(' · ')}
                        </p>
                        <h3 className="mt-1.5 font-display text-2xl text-cocoa">{point.name}</h3>
                      </div>
                      {distance != null && (
                        <span className="shrink-0 rounded-full bg-cream-2 px-3 py-1.5 text-xs font-bold text-cocoa">{formatDistance(distance)}</span>
                      )}
                    </div>
                    {point.address && <p className="mt-3 text-[0.95rem] text-muted">{point.address}</p>}
                    {point.hours && (
                      <p className="mt-2 inline-flex items-center gap-2 text-sm text-muted">
                        <Clock size={15} /> {point.hours}
                      </p>
                    )}
                  </button>
                  <div className="mt-5 flex flex-wrap gap-2">
                    <a
                      href={directionsUrl(point)}
                      target="_blank"
                      rel="noopener"
                      className="btn btn-primary !min-h-10 !px-4 !text-[0.68rem]"
                      data-track="point_directions"
                      data-track-label={point.name}
                    >
                      <Navigation size={15} /> Como chegar
                    </a>
                    {point.whatsapp && (
                      <a
                        href={waLink(point.whatsapp, pointMessage)}
                        target="_blank"
                        rel="noopener"
                        className="btn btn-outline !min-h-10 !px-4 !text-[0.68rem]"
                        data-track="whatsapp_click"
                        data-track-label={`ponto:${point.name}`}
                      >
                        <WhatsAppIcon size={15} /> WhatsApp
                      </a>
                    )}
                    {ig && (
                      <a
                        href={`https://www.instagram.com/${ig}/`}
                        target="_blank"
                        rel="noopener"
                        className="btn btn-outline !min-h-10 !px-4 !text-[0.68rem]"
                        aria-label={`Instagram de ${point.name}`}
                      >
                        <InstagramIcon size={15} />
                      </a>
                    )}
                    <Link href={`/pontos-de-venda/${point.slug}`} className="btn !min-h-10 !px-3 !text-[0.68rem] text-cocoa hover:text-bronze">
                      Detalhes <ArrowUpRight size={14} />
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>

          {selected && (
            <div className="hidden lg:block">
              <div className="sticky top-28 overflow-hidden rounded-[1.6rem] border border-line bg-sand">
                <iframe
                  key={selected.id}
                  title={`Mapa: ${selected.name}`}
                  src={mapEmbedUrl(selected)}
                  className="h-[min(70vh,640px)] w-full"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
                <div className="flex items-center justify-between gap-4 bg-white p-5">
                  <div>
                    <p className="font-display text-xl text-cocoa">{selected.name}</p>
                    <p className="text-sm text-muted">{[selected.address, selected.neighborhood, selected.city].filter(Boolean).join(', ')}</p>
                  </div>
                  <a href={directionsUrl(selected)} target="_blank" rel="noopener" className="btn btn-primary !min-h-10 shrink-0 !px-4 !text-[0.68rem]" data-track="point_directions" data-track-label={selected.name}>
                    Rota
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
