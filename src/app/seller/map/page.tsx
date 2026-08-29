'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Loader2,
  Navigation,
  Compass
} from 'lucide-react';

import type { CustomerDTO, Paginated } from '@/lib/api-types';

interface MapPoint {
  id: string;
  tradeName: string;
  category: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  type: 'LEAD' | 'CUSTOMER';
  score?: number;
}

type MarkerFilter = 'ALL' | 'LEAD' | 'CUSTOMER';

/** Lead devolvido por `GET /api/leads`. */
interface LeadRow {
  id: string;
  tradeName: string;
  category: string;
  address: string;
  latitude: number;
  longitude: number;
  score: number;
  status: string;
  convertedCustomerId?: string | null;
}

interface LeadsResponse {
  data?: LeadRow[];
}

export default function SellerMapPage() {
  const [points, setPoints] = useState<MapPoint[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtros
  const [filterType, setFilterType] = useState<MarkerFilter>('ALL');
  const [category, setCategory] = useState('');

  const [gpsActive, setGpsActive] = useState(false);
  const [locLoading, setLocLoading] = useState(false);

  const loadMapPoints = useCallback(async () => {
    try {
      setLoading(true);

      // Buscar Leads e Clientes em paralelo
      const [leadsRes, customersRes] = await Promise.all([
        fetch('/api/leads'),
        fetch('/api/customers'),
      ]);

      const leadsJson: LeadsResponse = await leadsRes.json();
      const customersJson: Paginated<CustomerDTO> = await customersRes.json();

      if (!leadsRes.ok || !customersRes.ok) {
        throw new Error('Erro ao buscar dados geográficos.');
      }

      const normalizedLeads: MapPoint[] = (leadsJson.data ?? [])
        .filter((l) => l.status === 'ATIVO' && !l.convertedCustomerId)
        .map((l) => ({
          id: l.id,
          tradeName: l.tradeName,
          category: l.category,
          address: l.address,
          latitude: l.latitude,
          longitude: l.longitude,
          type: 'LEAD',
          score: l.score,
        }));

      const normalizedCustomers: MapPoint[] = (customersJson.data ?? [])
        .filter((c) => c.status === 'ATIVO')
        .map((c) => ({
          id: c.id,
          tradeName: c.tradeName,
          category: c.category ?? '',
          address: c.address ?? '',
          latitude: c.latitude,
          longitude: c.longitude,
          type: 'CUSTOMER',
        }));

      setPoints([...normalizedLeads, ...normalizedCustomers]);
    } catch (err) {
      console.error('Falha ao carregar mapa:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // A carga roda fora do corpo síncrono do efeito para não encadear renders.
    void (async () => {
      await loadMapPoints();
    })();
  }, [loadMapPoints]);

  const handleGPSLocation = () => {
    setLocLoading(true);
    if (!navigator.geolocation) {
      alert('Geolocalização não suportada.');
      setLocLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      () => {
        setGpsActive(true);
        setLocLoading(false);
      },
      (err) => {
        console.error(err);
        alert('Permissão de GPS negada.');
        setLocLoading(false);
      }
    );
  };

  // Filtrar pontos locais
  const filteredPoints = points.filter((p) => {
    const matchesType = filterType === 'ALL' || p.type === filterType;
    const matchesCategory = category === '' || p.category === category;
    return matchesType && matchesCategory;
  });

  return (
    <div className="max-w-md mx-auto space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-stone-900">Mapa Comercial</h2>
          <p className="text-xs text-stone-500 font-semibold">Pontos de revenda e leads quentes</p>
        </div>
        
        <button
          onClick={handleGPSLocation}
          disabled={locLoading}
          className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800 hover:bg-amber-100 transition-all cursor-pointer"
        >
          {locLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Navigation className="h-3.5 w-3.5 fill-amber-800" />}
          GPS
        </button>
      </div>

      {/* Caixa de Filtros do Mapa */}
      <div className="rounded-xl bg-white p-3.5 shadow-sm border border-stone-200 grid grid-cols-2 gap-2 text-xs">
        <div>
          <label className="block text-[10px] font-bold text-stone-500 uppercase mb-1">Filtrar Marcadores</label>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as MarkerFilter)}
            className="block w-full rounded-lg border border-stone-300 bg-stone-50 p-2 text-stone-800"
          >
            <option value="ALL">Mostrar Todos</option>
            <option value="LEAD">Somente Leads (Oportunidades)</option>
            <option value="CUSTOMER">Somente Clientes (Ativos)</option>
          </select>
        </div>

        <div>
          <label className="block text-[10px] font-bold text-stone-500 uppercase mb-1">Categoria</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="block w-full rounded-lg border border-stone-300 bg-stone-50 p-2 text-stone-800"
          >
            <option value="">Todas</option>
            <option value="cafeterias">Cafeterias</option>
            <option value="padarias">Padarias</option>
            <option value="confeitarias">Confeitarias</option>
            <option value="lanchonetes">Lanchonetes</option>
            <option value="açaiterias">Açaiterias</option>
            <option value="conveniências">Conveniências</option>
          </select>
        </div>
      </div>

      {/* Canvas do Mapa Interativo Mockado de Alta Qualidade */}
      <div className="relative h-64 rounded-2xl bg-slate-200 border border-stone-200 shadow-inner overflow-hidden flex flex-col items-center justify-center">
        {/* Simulação de Canvas de Mapa */}
        <div className="absolute inset-0 bg-stone-100 flex flex-col items-center justify-center">
          {/* Desenhar malha de ruas mockada */}
          <div className="absolute inset-0 opacity-10" style={{
            backgroundImage: 'radial-gradient(circle, #000 10%, transparent 11%), linear-gradient(0deg, transparent 24%, #000 25%, #000 26%, transparent 27%, transparent 74%, #000 75%, #000 76%, transparent 77%), linear-gradient(90deg, transparent 24%, #000 25%, #000 26%, transparent 27%, transparent 74%, #000 75%, #000 76%, transparent 77%)',
            backgroundSize: '80px 80px'
          }} />

          {/* Marcador de Centro do GPS */}
          {gpsActive && (
            <div className="absolute z-10 flex h-6 w-6 items-center justify-center rounded-full bg-blue-500/20 border border-blue-500 animate-pulse">
              <div className="h-2 w-2 rounded-full bg-blue-600" />
            </div>
          )}

          {/* Marcadores dos Leads e Clientes filtrados (desenhados ao redor do centro) */}
          {filteredPoints.slice(0, 15).map((p, idx) => {
            // Posicionamento pseudo-aleatório controlado
            const topOffset = 20 + ((idx * 47) % 60);
            const leftOffset = 15 + ((idx * 61) % 70);

            const isLead = p.type === 'LEAD';
            
            return (
              <div 
                key={p.id} 
                className="absolute flex flex-col items-center group cursor-pointer"
                style={{ top: `${topOffset}%`, left: `${leftOffset}%` }}
              >
                <div className={`flex h-6 w-6 items-center justify-center rounded-full shadow-md text-white border border-white text-[10px] ${
                  isLead ? 'bg-orange-600' : 'bg-emerald-600'
                }`}>
                  {isLead ? '🔥' : '🤝'}
                </div>
                
                {/* Tooltip Hover no Mobile/Desktop */}
                <div className="hidden group-hover:block absolute bottom-7 bg-stone-900 text-white text-[9px] font-bold p-1.5 rounded shadow-lg whitespace-nowrap z-20">
                  {p.tradeName}
                </div>
              </div>
            );
          })}
        </div>

        {/* Controles do Mapa no Canto */}
        <div className="absolute bottom-3 right-3 flex flex-col gap-1.5">
          <div className="rounded-lg bg-white/90 backdrop-blur-sm p-1.5 shadow border border-stone-200 flex flex-col gap-1 text-[9px] font-extrabold text-stone-700">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-orange-600 block" /> Leads</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-600 block" /> Clientes</span>
          </div>
        </div>

        <div className="absolute top-3 left-3 bg-white/90 backdrop-blur-sm px-2.5 py-1 rounded-full shadow border border-stone-200 text-[10px] font-semibold text-stone-600 flex items-center gap-1">
          <Compass className="h-3.5 w-3.5 text-amber-700 animate-spin" />
          Filtro ativo: {filteredPoints.length} pontos
        </div>
      </div>

      {/* Lista de pontos correspondentes abaixo do mapa */}
      <div className="space-y-2">
        <h3 className="text-xs font-bold text-stone-500 uppercase tracking-wider px-1">Pontos no Mapa</h3>
        
        {loading ? (
          <div className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin text-amber-700" /></div>
        ) : filteredPoints.length === 0 ? (
          <p className="text-xs text-stone-400 italic text-center p-4">Nenhum ponto para exibir.</p>
        ) : (
          <div className="space-y-2 max-h-[250px] overflow-y-auto pr-1">
            {filteredPoints.map((p) => (
              <div 
                key={p.id}
                className="flex items-center justify-between p-3.5 bg-white border border-stone-200 rounded-xl text-xs"
              >
                <div className="min-w-0 flex-1 pr-2">
                  <h4 className="font-bold text-stone-800 truncate">{p.tradeName}</h4>
                  <p className="text-[10px] text-stone-400 truncate mt-0.5">{p.address}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`rounded font-bold text-[9px] px-1.5 py-0.5 border ${
                    p.type === 'LEAD'
                      ? 'bg-orange-50 text-orange-850 border-orange-100'
                      : 'bg-emerald-50 text-emerald-850 border-emerald-100'
                  }`}>
                    {p.type === 'LEAD' ? `LEAD (🔥 ${p.score})` : 'CLIENTE'}
                  </span>
                  
                  {p.type === 'LEAD' ? (
                    <Link href={`/seller/lead/${p.id}`} className="rounded bg-stone-100 hover:bg-amber-100 hover:text-amber-850 p-1 font-semibold transition-colors">
                      Detalhes
                    </Link>
                  ) : (
                    <span className="text-[10px] text-stone-400 font-bold uppercase p-1">Ativo</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
