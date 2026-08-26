'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Search,
  MapPin,
  ChevronRight,
  Coffee,
  Loader2
} from 'lucide-react';
import { PipelineStage } from '@prisma/client';

import { errorMessage, apiErrorMessage } from '@/lib/errors';

interface Lead {
  id: string;
  tradeName: string;
  category: string;
  address: string;
  neighborhood: string;
  score: number;
  pipelineStage: PipelineStage;
  priority: string;
}

interface LeadsResponse {
  data?: Lead[];
  error?: string;
}

export default function SellerLeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filtros
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedStage, setSelectedStage] = useState('');
  const [scoreFilter, setScoreFilter] = useState(''); // 'hot' (>=80), 'warm' (50-79), 'cold' (<50)

  const fetchLeads = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      // Fazer requisição normal de leads (a API restringe automaticamente ao vendedor logado)
      const res = await fetch('/api/leads');
      const data: LeadsResponse = await res.json();
      if (!res.ok) throw new Error(apiErrorMessage(data, 'Erro ao buscar leads.'));
      setLeads(data.data ?? []);
    } catch (err: unknown) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // A carga roda fora do corpo síncrono do efeito para não encadear renders.
    void (async () => {
      await fetchLeads();
    })();
  }, [fetchLeads]);

  // Filtragem local dos leads
  const filteredLeads = leads.filter((lead) => {
    // 1. Busca por nome / endereço
    const matchesSearch =
      lead.tradeName.toLowerCase().includes(search.toLowerCase()) ||
      lead.address.toLowerCase().includes(search.toLowerCase()) ||
      lead.neighborhood.toLowerCase().includes(search.toLowerCase());

    // 2. Filtro de Categoria
    const matchesCategory = selectedCategory === '' || lead.category === selectedCategory;

    // 3. Filtro de Estágio do Pipeline
    const matchesStage = selectedStage === '' || lead.pipelineStage === selectedStage;

    // 4. Filtro de Score
    let matchesScore = true;
    if (scoreFilter === 'hot') matchesScore = lead.score >= 80;
    else if (scoreFilter === 'warm') matchesScore = lead.score >= 50 && lead.score < 80;
    else if (scoreFilter === 'cold') matchesScore = lead.score < 50;

    return matchesSearch && matchesCategory && matchesStage && matchesScore;
  });

  const getStageColor = (stage: PipelineStage) => {
    switch (stage) {
      case 'NOVO':
        return 'bg-blue-50 text-blue-700 border-blue-100';
      case 'QUALIFICADO':
        return 'bg-purple-50 text-purple-700 border-purple-100';
      case 'ATRIBUIDO':
        return 'bg-indigo-50 text-indigo-700 border-indigo-100';
      case 'ABORDADO':
        return 'bg-yellow-50 text-yellow-800 border-yellow-150';
      case 'CONTATO_REALIZADO':
        return 'bg-amber-50 text-amber-800 border-amber-100';
      case 'INTERESSADO':
        return 'bg-orange-50 text-orange-800 border-orange-100';
      case 'REUNIAO':
      case 'AMOSTRA':
      case 'NEGOCIACAO':
        return 'bg-pink-50 text-pink-700 border-pink-100';
      case 'NOVO_REVENDEDOR':
        return 'bg-emerald-50 text-emerald-800 border-emerald-100';
      case 'PERDIDO':
        return 'bg-red-50 text-red-700 border-red-100';
      default:
        return 'bg-stone-50 text-stone-700 border-stone-200';
    }
  };

  return (
    <div className="max-w-md mx-auto space-y-4">
      <div>
        <h2 className="text-xl font-bold text-stone-900">Meus Oportunidades</h2>
        <p className="text-xs text-stone-500 font-semibold">Gerencie sua carteira de prospecção</p>
      </div>

      {/* Caixa de Busca e Filtros Rápidos */}
      <div className="rounded-xl bg-white p-4 shadow-sm border border-stone-200 space-y-3">
        <div className="relative">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <Search className="h-4 w-4 text-stone-400" />
          </div>
          <input
            type="text"
            placeholder="Buscar por nome, rua, bairro..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="block w-full rounded-lg border border-stone-300 bg-stone-50 py-2.5 pl-10 pr-3 text-xs text-stone-900 placeholder-stone-400 focus:border-amber-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 transition-all"
          />
        </div>

        {/* Filtros Parametrizáveis Accordion-like */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <label className="block text-[10px] font-bold text-stone-500 uppercase mb-1">Categoria</label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="block w-full rounded-lg border border-stone-300 bg-stone-50 p-2 text-stone-800 focus:border-amber-500 focus:outline-none"
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

          <div>
            <label className="block text-[10px] font-bold text-stone-500 uppercase mb-1">Pontuação</label>
            <select
              value={scoreFilter}
              onChange={(e) => setScoreFilter(e.target.value)}
              className="block w-full rounded-lg border border-stone-300 bg-stone-50 p-2 text-stone-800 focus:border-amber-500 focus:outline-none"
            >
              <option value="">Todos</option>
              <option value="hot">🔥 Quentes (&gt;= 80)</option>
              <option value="warm">🟡 Médios (50-79)</option>
              <option value="cold">❄️ Frios (&lt; 50)</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-[10px] font-bold text-stone-500 uppercase mb-1">Estágio do Funil</label>
          <select
            value={selectedStage}
            onChange={(e) => setSelectedStage(e.target.value)}
            className="block w-full rounded-lg border border-stone-300 bg-stone-50 p-2 text-stone-800 focus:border-amber-500 focus:outline-none text-xs"
          >
            <option value="">Todos os Estágios</option>
            <option value="NOVO">Novo</option>
            <option value="QUALIFICADO">Qualificado</option>
            <option value="ATRIBUIDO">Atribuído</option>
            <option value="ABORDADO">Abordado (Primeiro Contato)</option>
            <option value="CONTATO_REALIZADO">Contato Realizado</option>
            <option value="INTERESSADO">Interessado</option>
            <option value="AMOSTRA">Amostra Entregue</option>
            <option value="REUNIAO">Reunião Agendada</option>
            <option value="NEGOCIACAO">Negociação</option>
            <option value="NOVO_REVENDEDOR">Novo Revendedor (Convertido)</option>
            <option value="PERDIDO">Perdido</option>
          </select>
        </div>
      </div>

      {/* Listagem de Leads */}
      {loading ? (
        <div className="flex h-40 flex-col items-center justify-center gap-2">
          <Loader2 className="h-6 w-6 animate-spin text-amber-700" />
          <p className="text-xs text-stone-500">Filtrando carteira...</p>
        </div>
      ) : error ? (
        <div className="p-4 bg-red-50 text-red-700 rounded-xl border border-red-200 text-xs text-center">
          {error}
        </div>
      ) : filteredLeads.length === 0 ? (
        <div className="p-8 text-center bg-white border border-stone-200 rounded-xl text-stone-500 text-xs italic">
          Nenhum lead correspondente aos filtros aplicados.
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex justify-between items-center text-[10px] text-stone-400 font-bold uppercase px-1">
            <span>Resultados</span>
            <span>{filteredLeads.length} leads</span>
          </div>

          <div className="space-y-2">
            {filteredLeads.map((lead) => {
              const isHot = lead.score >= 80;
              const isCold = lead.score < 50;
              
              return (
                <Link
                  key={lead.id}
                  href={`/seller/lead/${lead.id}`}
                  className="flex items-center justify-between p-4 bg-white border border-stone-200 rounded-2xl hover:border-amber-500 hover:shadow-sm hover:shadow-amber-700/5 transition-all group"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-1.5">
                      <h4 className="text-sm font-extrabold text-stone-800 truncate group-hover:text-amber-800">
                        {lead.tradeName}
                      </h4>
                    </div>
                    
                    <p className="text-[11px] text-stone-500 font-medium truncate flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5 text-stone-400" />
                      {lead.address}, {lead.neighborhood}
                    </p>

                    <div className="flex items-center gap-1.5 pt-0.5">
                      <span className="rounded-md border border-stone-200 bg-stone-50 text-stone-600 text-[10px] font-semibold px-2 py-0.5 capitalize flex items-center gap-1 shrink-0">
                        <Coffee className="h-3 w-3 text-stone-400" />
                        {lead.category}
                      </span>
                      <span className={`rounded-md border text-[10px] font-bold px-2 py-0.5 shrink-0 ${getStageColor(lead.pipelineStage)}`}>
                        {lead.pipelineStage.replace('_', ' ')}
                      </span>
                    </div>
                  </div>

                  <div className="ml-4 flex items-center gap-2 shrink-0">
                    <div className={`rounded-full text-[11px] font-extrabold px-2.5 py-1.5 flex items-center gap-0.5 ${
                      isHot 
                        ? 'bg-orange-100 text-orange-800' 
                        : isCold 
                          ? 'bg-blue-100 text-blue-800' 
                          : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {isHot ? '🔥' : isCold ? '❄️' : '🟡'} {lead.score}
                    </div>
                    <ChevronRight className="h-5 w-5 text-stone-400 group-hover:text-amber-700" />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
