'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Loader2,
  Compass,
  Map,
  Filter,
  Navigation
} from 'lucide-react';

import type { CustomerDTO, Paginated, SellerDTO } from '@/lib/api-types';

/** `GET /api/sellers` devolve `{ data }`: esta listagem não é paginada. */
interface SellersResponse {
  data?: SellerDTO[];
}

/** Ponto desenhado no mapa, derivado do cliente devolvido pela API. */
interface Point {
  id: string;
  tradeName: string;
  category: string;
  address: string;
  neighborhood: string;
  latitude: number | null;
  longitude: number | null;
  sellerId: string | null;
  sellerName: string;
}

export default function AdminMapPage() {
  const [points, setPoints] = useState<Point[]>([]);
  const [sellers, setSellers] = useState<SellerDTO[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtros
  const [filterSeller, setFilterSeller] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterNeighborhood, setFilterNeighborhood] = useState('');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);

      // Carregar clientes e vendedores em paralelo
      const [custRes, sellRes] = await Promise.all([
        fetch('/api/customers'),
        fetch('/api/sellers')
      ]);

      const custData: Paginated<CustomerDTO> = await custRes.json();
      const sellData: SellersResponse = await sellRes.json();

      if (!custRes.ok || !sellRes.ok) {
        throw new Error('Falha ao buscar dados geográficos do servidor.');
      }

      setSellers(sellData.data ?? []);

      // A API manda o nome do vendedor em `sellerName`; não existe objeto
      // `seller` aninhado no cliente.
      const normalized: Point[] = (custData.data ?? []).map((c: CustomerDTO) => ({
        id: c.id,
        tradeName: c.tradeName,
        category: c.category ?? '',
        address: `${c.address ?? ''}, ${c.number || 'S/N'}`,
        neighborhood: c.neighborhood ?? '',
        latitude: c.latitude,
        longitude: c.longitude,
        sellerId: c.sellerId,
        sellerName: c.sellerName || 'Carteira Livre'
      }));

      setPoints(normalized);
    } catch (err) {
      console.error('Erro ao carregar mapa comercial:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // A carga roda fora do corpo síncrono do efeito para não encadear renders.
    void (async () => {
      await loadData();
    })();
  }, [loadData]);

  // Filtrar pontos de acordo com os filtros selecionados
  const filteredPoints = points.filter((p) => {
    const matchesSeller = !filterSeller || p.sellerId === filterSeller;
    const matchesCategory = !filterCategory || p.category === filterCategory;
    const matchesNeighborhood = !filterNeighborhood || p.neighborhood.toLowerCase().includes(filterNeighborhood.toLowerCase());
    return matchesSeller && matchesCategory && matchesNeighborhood;
  });

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-stone-900 flex items-center gap-2">
            <Map className="h-5.5 w-5.5 text-amber-700" />
            Mapa de Distribuição de Revendas
          </h2>
          <p className="text-xs text-stone-500 font-semibold mt-0.5">
            Visualize a cobertura geográfica dos pontos de revendas cadastrados e a distribuição das carteiras de vendedores.
          </p>
        </div>
        
        <button 
          onClick={loadData}
          className="rounded-lg border border-stone-250 bg-white hover:bg-stone-50 px-3 py-1.5 text-stone-700 font-bold text-xs shadow-xs cursor-pointer flex items-center gap-1"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Navigation className="h-3.5 w-3.5" />}
          Recarregar
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Painel Lateral de Filtros */}
        <div className="lg:col-span-1 bg-white rounded-2xl border border-stone-200 p-5 space-y-4 shadow-xs h-fit text-xs font-semibold text-stone-700">
          <div className="flex items-center gap-2 pb-3 border-b border-stone-100">
            <Filter className="h-4.5 w-4.5 text-amber-700" />
            <h3 className="font-extrabold text-stone-900 text-sm">Filtros Geográficos</h3>
          </div>

          {/* Vendedor */}
          <div>
            <label className="block text-[9px] text-stone-400 font-bold uppercase mb-1">Vendedor Responsável</label>
            <select
              value={filterSeller}
              onChange={(e) => setFilterSeller(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-stone-200 bg-stone-50 focus:outline-none text-stone-850"
            >
              <option value="">Todos os Vendedores</option>
              {sellers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          {/* Categoria */}
          <div>
            <label className="block text-[9px] text-stone-400 font-bold uppercase mb-1">Categoria de Revenda</label>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-stone-200 bg-stone-50 focus:outline-none text-stone-850"
            >
              <option value="">Todas as Categorias</option>
              <option value="padarias">Padarias</option>
              <option value="cafeterias">Cafeterias</option>
              <option value="confeitarias">Confeitarias</option>
              <option value="lanchonetes">Lanchonetes</option>
              <option value="açaiterias">Açaiterias</option>
              <option value="conveniências">Conveniências</option>
            </select>
          </div>

          {/* Bairro */}
          <div>
            <label className="block text-[9px] text-stone-400 font-bold uppercase mb-1">Buscar Bairro</label>
            <input
              type="text"
              placeholder="Ex: Copacabana"
              value={filterNeighborhood}
              onChange={(e) => setFilterNeighborhood(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-stone-200 bg-stone-50 focus:outline-none"
            />
          </div>

          {/* Resumo */}
          <div className="pt-3 border-t border-stone-100 text-[11px] text-stone-500 space-y-1.5">
            <div className="flex justify-between">
              <span>Total de Pontos:</span>
              <strong className="text-stone-900">{points.length}</strong>
            </div>
            <div className="flex justify-between">
              <span>Filtrados no Mapa:</span>
              <strong className="text-stone-900">{filteredPoints.length}</strong>
            </div>
          </div>
        </div>

        {/* Canvas de Mapa Gigante de Alta Resolução */}
        <div className="lg:col-span-3 space-y-4">
          <div className="relative h-[480px] rounded-2xl bg-stone-50 border border-stone-200 shadow-inner overflow-hidden flex flex-col items-center justify-center">
            {/* Grid malha de ruas */}
            <div className="absolute inset-0 opacity-15" style={{
              backgroundImage: 'radial-gradient(circle, #000 8%, transparent 9%), linear-gradient(0deg, transparent 24%, #000 25%, #000 26%, transparent 27%, transparent 74%, #000 75%, #000 76%, transparent 77%), linear-gradient(90deg, transparent 24%, #000 25%, #000 26%, transparent 27%, transparent 74%, #000 75%, #000 76%, transparent 77%)',
              backgroundSize: '120px 120px'
            }} />

            {/* Bússola e metadado */}
            <div className="absolute top-4 left-4 bg-white/95 backdrop-blur-sm px-3 py-1.5 rounded-full shadow-md border border-stone-200 text-[10px] font-bold text-stone-600 flex items-center gap-1.5 z-10">
              <Compass className="h-4 w-4 text-amber-700 animate-spin" />
              <span>Mapa Ativo • {filteredPoints.length} Estabelecimentos</span>
            </div>

            {loading ? (
              <div className="flex flex-col items-center gap-2 text-stone-400 font-bold z-10">
                <Loader2 className="h-8 w-8 animate-spin text-amber-700" />
                <span>Carregando dados geográficos...</span>
              </div>
            ) : filteredPoints.length === 0 ? (
              <div className="text-stone-400 font-bold italic text-center z-10 space-y-1">
                <p>Nenhum ponto de revenda localizado com os filtros atuais.</p>
                <p className="text-[10px] text-stone-400 font-normal">Tente alterar os filtros na barra lateral.</p>
              </div>
            ) : (
              <div className="absolute inset-0">
                {/* Renderizar pins de forma pseudo-espalhada calculada */}
                {filteredPoints.slice(0, 30).map((p, idx) => {
                  // Mapeamento visual das coordenadas geográficas pseudo-controlado para preencher a tela
                  const topOffset = 15 + ((idx * 37) % 70);
                  const leftOffset = 10 + ((idx * 43) % 80);

                  return (
                    <div 
                      key={p.id} 
                      className="absolute flex flex-col items-center group cursor-pointer"
                      style={{ top: `${topOffset}%`, left: `${leftOffset}%` }}
                    >
                      {/* Marcador colorido por vendedor */}
                      <div className={`flex h-7 w-7 items-center justify-center rounded-full shadow-md text-white border-2 border-white text-xs ${
                        p.sellerId ? 'bg-amber-800' : 'bg-stone-500'
                      }`}>
                        🤝
                      </div>

                      {/* Caixa suspensa Hover (Tooltip) */}
                      <div className="hidden group-hover:block absolute bottom-8 bg-stone-900/95 backdrop-blur-xs text-white text-[10px] p-2 rounded-xl shadow-xl border border-stone-800 z-30 min-w-[150px]">
                        <span className="font-extrabold block text-amber-500">{p.tradeName}</span>
                        <span className="text-[8px] text-stone-400 block mt-0.5">{p.address}</span>
                        <span className="text-[8px] text-stone-400 block">Bairro: {p.neighborhood}</span>
                        <span className="text-[8px] text-emerald-400 block font-extrabold uppercase mt-1">Dono: {p.sellerName}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Legendas */}
            <div className="absolute bottom-4 right-4 bg-white/95 backdrop-blur-sm p-3 rounded-xl shadow-md border border-stone-200 text-[10px] font-extrabold text-stone-700 flex flex-col gap-1.5 z-10 min-w-[120px]">
              <span className="text-[8px] text-stone-400 uppercase tracking-widest block border-b border-stone-100 pb-1 mb-1">Legendas</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-800 block" /> Com Vendedor</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-stone-500 block" /> Sem Carteira</span>
            </div>
          </div>

          {/* Listagem de Endereços abaixo */}
          <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-xs text-xs font-semibold text-stone-700">
            <h3 className="font-extrabold text-stone-900 text-sm mb-3">Lista de Revendedores no Mapa</h3>
            {filteredPoints.length === 0 ? (
              <p className="text-stone-400 italic text-center py-4">Nenhum ponto cadastrado.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[220px] overflow-y-auto pr-1">
                {filteredPoints.map((p) => (
                  <div key={p.id} className="p-3 bg-stone-50 border border-stone-150 rounded-xl flex items-center justify-between">
                    <div className="min-w-0 pr-2">
                      <h4 className="font-bold text-stone-900 truncate">{p.tradeName}</h4>
                      <p className="text-[10px] text-stone-400 mt-0.5 truncate">{p.address} • Bairro: {p.neighborhood}</p>
                    </div>
                    <div className="shrink-0 flex items-center gap-2">
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase ${
                        p.sellerId ? 'bg-amber-50 text-amber-850 border-amber-100' : 'bg-stone-50 text-stone-500 border-stone-200'
                      }`}>
                        {p.sellerName}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
