'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { 
  Navigation, 
  MapPin, 
  Flame, 
  Calendar, 
  CheckCircle, 
  Award, 
  Coffee,
  ChevronRight,
  TrendingUp,
  Loader2,
  Clock,
  DollarSign,
  Truck
} from 'lucide-react';

import { errorMessage, apiErrorMessage } from '@/lib/errors';

interface NearbyOpportunity {
  id: string;
  tradeName: string;
  category: string;
  address: string;
  distance: number;
  score: number;
}

interface NearbyCustomer {
  id: string;
  tradeName: string;
  category: string;
  distance: number;
}

interface Meeting {
  id: string;
  date: string;
  location?: string;
  lead: {
    id: string;
    tradeName: string;
    address: string;
  };
}

interface Delivery {
  id: string;
  numero: number;
  cliente: string;
  data_entrega: string;
  total: number;
  status: string;
}

interface DashboardData {
  sellerName: string;
  summary: {
    totalLeads: number;
    activeLeads: number;
    convertedLeads: number;
    lostLeads: number;
    visitsThisMonth: number;
    goal: number;
    goalProgress: number;
    goalPercent: number;
    monthlyCommissions: number;
  };
  upcomingMeetings: Meeting[];
  recentActivities: {
    id: string;
    date: string;
    type: string;
    description: string;
    lead?: { tradeName: string };
  }[];
  weeklyDeliveries: Delivery[];
  error?: string;
}

/** Resposta de `GET /api/maps/nearby`. */
interface NearbyResponse {
  leads?: NearbyOpportunity[];
  customers?: NearbyCustomer[];
  error?: string;
}

export default function SellerDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Estados de Geolocalização / Estou na Região
  const [locLoading, setLocLoading] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [nearbyLeads, setNearbyLeads] = useState<NearbyOpportunity[]>([]);
  const [nearbyCustomers, setNearbyCustomers] = useState<NearbyCustomer[]>([]);
  const [locError, setLocError] = useState<string | null>(null);

  const fetchDashboard = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/dashboard/seller');
      const json: DashboardData = await res.json();
      if (!res.ok) throw new Error(apiErrorMessage(json, 'Erro ao carregar dados do painel.'));
      setData(json);
    } catch (err: unknown) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // A carga roda fora do corpo síncrono do efeito para não encadear renders.
    void (async () => {
      await fetchDashboard();
    })();
  }, [fetchDashboard]);

  const handleGetLocation = () => {
    setLocLoading(true);
    setLocError(null);
    setCoords(null);
    setNearbyLeads([]);
    setNearbyCustomers([]);

    if (!navigator.geolocation) {
      setLocError('Geolocalização não é suportada por seu navegador.');
      setLocLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        setCoords({ lat: latitude, lng: longitude });
        
        try {
          // Consultar a API de busca por proximidade
          const res = await fetch(`/api/maps/nearby?lat=${latitude}&lng=${longitude}&radius=5`);
          const json: NearbyResponse = await res.json();
          if (!res.ok) throw new Error(apiErrorMessage(json, 'Erro ao buscar oportunidades na região.'));

          setNearbyLeads(json.leads || []);
          setNearbyCustomers(json.customers ?? []);
        } catch (err: unknown) {
          setLocError(errorMessage(err) || 'Falha ao buscar estabelecimentos próximos.');
        } finally {
          setLocLoading(false);
        }
      },
      (err) => {
        console.error('Erro de geolocalização:', err);
        setLocError('Permissão de localização negada ou indisponível.');
        setLocLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  if (loading) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-2">
        <Loader2 className="h-8 w-8 animate-spin text-amber-700" />
        <p className="text-sm text-stone-500 font-medium">Carregando seu painel de vendas...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-red-800">
        <h3 className="font-bold text-base">Falha ao iniciar</h3>
        <p className="mt-2 text-sm">{error || 'Dados indisponíveis'}</p>
        <button onClick={fetchDashboard} className="mt-4 rounded-lg bg-red-700 px-4 py-2 text-white font-semibold text-xs hover:bg-red-800 transition-all">
          Tentar Novamente
        </button>
      </div>
    );
  }

  const { summary, upcomingMeetings, recentActivities, weeklyDeliveries } = data;

  return (
    <div className="max-w-md mx-auto space-y-6">
      {/* Bloco de Boas-vindas e Meta */}
      <div className="rounded-2xl bg-white p-5 shadow-sm border border-stone-200 space-y-4">
        <div>
          <h2 className="text-xl font-bold text-stone-900">Olá, {data.sellerName}!</h2>
          <p className="text-xs text-stone-500 font-medium font-semibold">Vamos conquistar novos parceiros hoje?</p>
        </div>

        {/* Progresso da Meta Mensal */}
        <div className="rounded-xl bg-stone-50 p-4 border border-stone-150 space-y-3">
          <div className="flex items-center justify-between text-xs font-bold text-stone-700">
            <span className="flex items-center gap-1.5">
              <Award className="h-4 w-4 text-amber-700" />
              Meta de Expansão
            </span>
            <span>{summary.goalProgress} / {summary.goal} clientes</span>
          </div>

          <div className="h-2.5 w-full rounded-full bg-stone-200 overflow-hidden">
            <div 
              className="h-full rounded-full bg-amber-700 transition-all duration-500" 
              style={{ width: `${summary.goalPercent}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[10px] text-stone-500 font-semibold">
            <span>{summary.goalPercent}% alcançado</span>
            <span className="flex items-center gap-0.5 text-amber-800">
              <TrendingUp className="h-3.5 w-3.5" />
              Foco no Brownie 7x5
            </span>
          </div>
        </div>

        {/* Comissão Estimada Acumulada */}
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/20 p-4 flex items-center justify-between">
          <div>
            <span className="text-[10px] text-emerald-800 font-bold uppercase block">Comissões Faturadas</span>
            <span className="text-lg font-black text-emerald-900 mt-1 block">
              {summary.monthlyCommissions.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </span>
          </div>
          <div className="h-10 w-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-700 shadow-xs">
            <DollarSign className="h-5 w-5" />
          </div>
        </div>

        {/* Resumo de Contadores */}
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="rounded-lg border border-stone-150 p-2.5">
            <span className="block text-[9px] text-stone-500 font-bold uppercase">Leads Ativos</span>
            <span className="text-base font-extrabold text-stone-800 mt-0.5 block">{summary.activeLeads}</span>
          </div>
          <div className="rounded-lg border border-stone-150 p-2.5">
            <span className="block text-[9px] text-stone-500 font-bold uppercase">Visitas Mês</span>
            <span className="text-base font-extrabold text-stone-800 mt-0.5 block">{summary.visitsThisMonth}</span>
          </div>
          <div className="rounded-lg border border-stone-150 p-2.5 bg-amber-50/30 border-amber-100">
            <span className="block text-[9px] text-amber-800 font-bold uppercase">Novos Pontos</span>
            <span className="text-base font-extrabold text-amber-900 mt-0.5 block">{summary.convertedLeads}</span>
          </div>
        </div>
      </div>

      {/* [NOVO] Agenda de Entregas da Semana */}
      <div className="rounded-2xl bg-white p-5 shadow-sm border border-stone-200 space-y-4">
        <h3 className="text-sm font-bold text-stone-800 flex items-center gap-2">
          <Truck className="h-4.5 w-4.5 text-amber-700" />
          Entregas Agendadas na Semana ({weeklyDeliveries.length})
        </h3>
        
        {weeklyDeliveries.length === 0 ? (
          <p className="text-xs text-stone-400 italic text-center py-2">
            Nenhuma entrega programada para seus clientes nesta semana.
          </p>
        ) : (
          <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1">
            {weeklyDeliveries.map((del) => (
              <div 
                key={del.id}
                className="p-3 bg-stone-50 border border-stone-200 rounded-xl text-xs font-semibold text-stone-700 flex justify-between items-center"
              >
                <div>
                  <span className="font-bold text-stone-850 block">Pedido #{del.numero}</span>
                  <span className="text-[10px] text-stone-500 block truncate max-w-[180px]">{del.cliente}</span>
                  <span className="text-[9px] text-stone-400 block font-medium mt-0.5">
                    Data: {new Date(del.data_entrega).toLocaleDateString('pt-BR')}
                  </span>
                </div>
                <div className="text-right flex flex-col items-end gap-1 shrink-0">
                  <span className="text-stone-850 font-black">
                    {del.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </span>
                  <span className={`inline-flex px-1.5 py-0.5 rounded text-[8px] font-black uppercase ${
                    del.status === 'faturado' ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'
                  }`}>
                    {del.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Botão Estou na Região - Geolocalização Mobile */}
      <div className="rounded-2xl bg-white p-5 shadow-sm border border-stone-200 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-stone-800 flex items-center gap-2">
            <Navigation className="h-4.5 w-4.5 text-amber-700 fill-amber-700" />
            Estou na Região
          </h3>
          <span className="text-[10px] text-stone-400 font-semibold">Raio: 5km</span>
        </div>

        <p className="text-xs text-stone-600 leading-relaxed font-medium">
          Ative seu GPS para listar instantaneamente oportunidades próximas de revenda ordenadas por distância linear.
        </p>

        <button
          onClick={handleGetLocation}
          disabled={locLoading}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-700 py-3 text-sm font-bold text-white shadow-md hover:bg-amber-800 active:bg-amber-900 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
        >
          {locLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Lendo coordenadas GPS...
            </>
          ) : (
            <>
              <MapPin className="h-4 w-4" />
              Buscar Oportunidades Próximas
            </>
          )}
        </button>

        {locError && (
          <div className="rounded-lg bg-red-50 p-3 text-xs text-red-700 border border-red-200">
            {locError}
          </div>
        )}

        {/* Resultados Estou na Região */}
        {coords && (
          <div className="space-y-4 pt-2 border-t border-stone-100">
            <div>
              <span className="text-[10px] text-stone-400 font-bold uppercase block">Minhas Coordenadas</span>
              <span className="text-xs font-semibold text-stone-600">{coords.lat.toFixed(6)}, {coords.lng.toFixed(6)}</span>
            </div>

            {/* Oportunidades Próximas */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-stone-800 uppercase tracking-wider flex items-center gap-1.5">
                <Flame className="h-4 w-4 text-orange-600 fill-orange-600 animate-bounce" />
                Oportunidades Próximas ({nearbyLeads.length})
              </h4>

              {nearbyLeads.length === 0 ? (
                <p className="text-xs text-stone-500 italic p-3 bg-stone-50 rounded-lg border border-stone-200">
                  Nenhum lead qualificado encontrado em um raio de 5km destas coordenadas.
                </p>
              ) : (
                <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                  {nearbyLeads.map((lead) => {
                    const distStr = lead.distance < 1 
                      ? `${Math.round(lead.distance * 1000)} m`
                      : `${lead.distance.toFixed(1)} km`;
                    return (
                      <Link
                        key={lead.id}
                        href={`/seller/lead/${lead.id}`}
                        className="flex items-center justify-between p-3 rounded-xl bg-stone-50 border border-stone-200 hover:border-amber-400 hover:bg-amber-50/10 transition-all group"
                      >
                        <div className="min-w-0 flex-1">
                          <h5 className="text-xs font-bold text-stone-800 truncate group-hover:text-amber-800">{lead.tradeName}</h5>
                          <p className="text-[10px] text-stone-500 font-semibold flex items-center gap-1 mt-0.5 capitalize">
                            <Coffee className="h-3 w-3 text-stone-400" />
                            {lead.category} • {distStr}
                          </p>
                        </div>
                        <div className="ml-3 flex items-center gap-2 shrink-0">
                          <div className="rounded-full bg-orange-100 text-orange-800 text-[10px] font-bold px-2 py-0.5 flex items-center gap-0.5">
                            🔥 {lead.score}
                          </div>
                          <ChevronRight className="h-4 w-4 text-stone-400 group-hover:text-amber-700" />
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Clientes Prigor Próximos (Prova Social) */}
            <div className="space-y-2 pt-2 border-t border-stone-100">
              <h4 className="text-xs font-bold text-stone-800 uppercase tracking-wider flex items-center gap-1.5">
                <CheckCircle className="h-4 w-4 text-emerald-600 fill-emerald-100" />
                Clientes Prigor Próximos ({nearbyCustomers.length})
              </h4>

              {nearbyCustomers.length === 0 ? (
                <p className="text-xs text-stone-500 italic p-3 bg-stone-50 rounded-lg border border-stone-200">
                  Nenhum ponto Prigor cadastrado a menos de 5km de você.
                </p>
              ) : (
                <div className="space-y-2 max-h-[150px] overflow-y-auto pr-1">
                  {nearbyCustomers.map((cust) => {
                    const distStr = cust.distance < 1 
                      ? `${Math.round(cust.distance * 1000)} m`
                      : `${cust.distance.toFixed(1)} km`;
                    return (
                      <div
                        key={cust.id}
                        className="flex items-center justify-between p-2.5 rounded-lg bg-stone-50 border border-stone-150 text-xs font-medium"
                      >
                        <div className="truncate pr-2">
                          <span className="font-semibold text-stone-700 block truncate">{cust.tradeName}</span>
                          <span className="text-[10px] text-stone-400 capitalize">{cust.category}</span>
                        </div>
                        <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100 shrink-0">
                          {distStr}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Próximas Reuniões */}
      <div className="rounded-2xl bg-white p-5 shadow-sm border border-stone-200 space-y-4">
        <h3 className="text-sm font-bold text-stone-800 flex items-center gap-2">
          <Calendar className="h-4.5 w-4.5 text-amber-700" />
          Agenda Próximas Visitas ({upcomingMeetings.length})
        </h3>

        {upcomingMeetings.length === 0 ? (
          <p className="text-xs text-stone-500 italic p-4 text-center">
            Nenhuma reunião ou visita de retorno agendada.
          </p>
        ) : (
          <div className="space-y-3">
            {upcomingMeetings.map((meeting) => (
              <Link
                key={meeting.id}
                href={`/seller/lead/${meeting.lead.id}`}
                className="flex items-start gap-3 p-3 rounded-xl border border-stone-150 hover:border-amber-500 hover:bg-amber-50/5 transition-all group"
              >
                <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg bg-amber-50 text-amber-800 border border-amber-100">
                  <Clock className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="text-xs font-bold text-stone-800 truncate group-hover:text-amber-800">{meeting.lead.tradeName}</h4>
                  <p className="text-[10px] text-stone-500 font-semibold truncate mt-0.5">{meeting.lead.address}</p>
                  <p className="text-[10px] text-amber-700 font-bold mt-1">
                    {new Date(meeting.date).toLocaleString('pt-BR', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Minhas Atividades Recentes */}
      <div className="rounded-2xl bg-white p-5 shadow-sm border border-stone-200 space-y-4">
        <h3 className="text-sm font-bold text-stone-800 flex items-center gap-2">
          <Clock className="h-4.5 w-4.5 text-amber-700" />
          Meu Histórico Recente
        </h3>

        {recentActivities.length === 0 ? (
          <p className="text-xs text-stone-500 italic p-4 text-center">
            Nenhuma atividade registrada por você recentemente.
          </p>
        ) : (
          <div className="relative border-l border-stone-250 ml-3.5 space-y-5">
            {recentActivities.map((act) => {
              const dateStr = new Date(act.date).toLocaleDateString('pt-BR', {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit'
              });
              return (
                <div key={act.id} className="relative pl-6">
                  {/* Ponto na timeline */}
                  <div className="absolute -left-1.5 top-1.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-amber-700 shadow-sm" />
                  
                  <div className="text-xs">
                    <span className="text-[10px] text-stone-400 font-bold block">{dateStr}</span>
                    <h4 className="font-bold text-stone-800 mt-0.5">
                      {act.lead?.tradeName || 'Estabelecimento'}
                    </h4>
                    <p className="text-stone-600 text-[11px] font-medium leading-relaxed mt-0.5">
                      {act.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
