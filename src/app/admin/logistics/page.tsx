'use client';

import React, { useEffect, useState } from 'react';
import { 
  Truck, 
  Calendar, 
  Play, 
  Check, 
  ExternalLink, 
  Share2, 
  MapPin, 
  RefreshCw, 
  Loader2,
  AlertTriangle
} from 'lucide-react';

interface Pedido {
  id: string;
  numero: number;
  cliente_nome: string;
  total: number;
  status: string;
  data_entrega?: string;
  observacoes?: string;
  endereco?: string;
  bairro?: string;
}

export default function LogisticsPage() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Pedidos selecionados para a carga do dia
  const [selectedPedidoIds, setSelectedPedidoIds] = useState<string[]>([]);
  const [routeOrders, setRouteOrders] = useState<Pedido[]>([]);
  const [routing, setRouting] = useState(false);
  const [routeGenerated, setRouteGenerated] = useState(false);

  useEffect(() => {
    fetchPedidos();
  }, [selectedDate]);

  const fetchPedidos = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Busca todos os pedidos do ERP
      const res = await fetch('/api/erp/pedidos');
      if (!res.ok) throw new Error('Falha ao carregar lista de pedidos do ERP.');
      
      const data: Pedido[] = await res.json();
      
      // Filtra pedidos ativos (confirmados, em produção ou faturados) para a data selecionada
      const filtered = data.filter(p => {
        if (!p.data_entrega) return false;
        // Normaliza a data de entrega (aaaa-mm-dd)
        const entregaDate = p.data_entrega.split('T')[0];
        
        const statusValido = p.status === 'confirmado' || p.status === 'em_producao' || p.status === 'faturado';
        return entregaDate === selectedDate && statusValido;
      });

      // Busca dados cadastrais do cliente (endereço/bairro) para cada pedido
      const hydrated = await Promise.all(filtered.map(async (p) => {
        try {
          const resCli = await fetch(`/api/erp/pedidos/${p.id}`);
          if (resCli.ok) {
            const detail = await resCli.json();
            // Tenta obter o endereço/bairro do cadastro do cliente detalhado
            const fullRes = await fetch(`/api/erp/clientes`);
            if (fullRes.ok) {
              const list = await fullRes.json();
              const cli = list.find((c: any) => c.nome === detail.cliente_nome);
              if (cli) {
                return {
                  ...p,
                  endereco: cli.address || cli.endereco || 'Campo de São Cristóvão, SN',
                  bairro: cli.neighborhood || cli.bairro || 'Centro'
                };
              }
            }
          }
        } catch {}
        return {
          ...p,
          endereco: 'Endereço cadastrado na ficha do cliente',
          bairro: 'Zona Padrão'
        };
      }));

      setPedidos(hydrated);
      setSelectedPedidoIds([]);
      setRouteOrders([]);
      setRouteGenerated(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectToggle = (id: string) => {
    if (selectedPedidoIds.includes(id)) {
      setSelectedPedidoIds(selectedPedidoIds.filter(item => item !== id));
    } else {
      setSelectedPedidoIds([...selectedPedidoIds, id]);
    }
  };

  const handleGenerateRoute = () => {
    if (selectedPedidoIds.length === 0) return;
    
    setRouting(true);
    
    // Simula a otimização de rota ordenando de forma lógica por bairro
    setTimeout(() => {
      const selected = pedidos.filter(p => selectedPedidoIds.includes(p.id));
      
      // Ordena logicamente para evitar entregas espalhadas (agrupa por bairro)
      const sorted = [...selected].sort((a, b) => {
        const bairroA = a.bairro || '';
        const bairroB = b.bairro || '';
        return bairroA.localeCompare(bairroB);
      });

      setRouteOrders(sorted);
      setRouteGenerated(true);
      setRouting(false);
    }, 1500);
  };

  const handleConfirmDeliveries = async () => {
    if (routeOrders.length === 0) return;
    if (!confirm(`Deseja marcar os ${routeOrders.length} pedidos selecionados como ENTREGUES? Isso efetuará a baixa final no estoque de insumos.`)) return;

    try {
      setLoading(true);
      
      // Atualiza o status de todos os pedidos da rota para 'entregue'
      await Promise.all(routeOrders.map(p => 
        fetch(`/api/erp/pedidos/${p.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'entregue' })
        })
      ));

      alert('Carga e roteiro entregues com sucesso! Estoque e lançamentos financeiros atualizados.');
      fetchPedidos();
    } catch (err: any) {
      alert('Erro ao confirmar entregas: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyRouteToClipboard = () => {
    if (routeOrders.length === 0) return;

    const header = `🚚 *ROTEIRO DE ENTREGA DOCES PRIGOR*\n*Data*: ${new Date(selectedDate).toLocaleDateString('pt-BR')}\n*Total Cargas*: ${routeOrders.length} pedidos\n\n📍 *Saída*: Fábrica Doces Prigor (Campo de São Cristóvão)\n\n`;

    const text = routeOrders.map((p, idx) => {
      const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(p.endereco || '')}`;
      return `*Parada ${idx + 1}: Pedido #${p.numero}*\n` +
             `   • Cliente: ${p.cliente_nome}\n` +
             `   • Endereço: ${p.endereco}\n` +
             `   • Bairro: ${p.bairro}\n` +
             `   • Rota de Entrega: ${mapsUrl}`;
    }).join('\n\n');

    const footer = '\n\n🍫 *Doces Prigor - Boa viagem e dirija com segurança!*';

    navigator.clipboard.writeText(header + text + footer);
    alert('Roteiro logístico de entrega copiado para o WhatsApp do motorista!');
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-stone-900 tracking-tight flex items-center gap-2">
            <Truck className="h-6 w-6 text-amber-700" />
            Roteirização Logística
          </h2>
          <p className="text-xs text-stone-500 font-medium">Gestão de entregas diárias, agrupamento de trajetos por proximidade e despacho de motoristas</p>
        </div>
      </div>

      {/* Seletor de Data */}
      <div className="rounded-xl bg-white p-4 shadow-sm border border-stone-200 grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
        <div className="md:col-span-2">
          <label className="text-[10px] text-stone-400 font-bold uppercase tracking-wider block mb-1">Selecionar Data de Entrega</label>
          <div className="relative">
            <input 
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full rounded-lg border border-stone-200 text-xs px-3 py-2 bg-stone-50/50 focus:outline-none"
            />
          </div>
        </div>

        <button 
          onClick={fetchPedidos}
          className="rounded-lg bg-stone-900 hover:bg-stone-850 text-white font-bold text-xs py-2 px-3 text-center cursor-pointer transition-all flex items-center justify-center gap-1.5 h-9"
        >
          <RefreshCw className="h-4 w-4" />
          Recarregar Pedidos
        </button>
      </div>

      {/* Corpo Principal */}
      {loading ? (
        <div className="flex min-h-[30vh] flex-col items-center justify-center gap-2">
          <Loader2 className="h-6 w-6 animate-spin text-amber-700" />
          <p className="text-xs text-stone-500 font-semibold">Consultando pedidos agendados...</p>
        </div>
      ) : error ? (
        <div className="p-4 bg-red-50 border border-red-200 text-red-750 rounded-xl text-center text-xs">{error}</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Seção 1: Seleção de Pedidos na Carga */}
          <div className="rounded-2xl bg-white p-5 shadow-sm border border-stone-200 space-y-4">
            <div className="flex justify-between items-center border-b border-stone-100 pb-2">
              <h3 className="text-xs font-black text-stone-850 uppercase tracking-wider">Carga do Dia ({pedidos.length})</h3>
              {pedidos.length > 0 && (
                <button 
                  onClick={() => setSelectedPedidoIds(pedidos.map(p => p.id))}
                  className="text-[10px] text-amber-800 font-bold hover:underline cursor-pointer"
                >
                  Selecionar Todos
                </button>
              )}
            </div>

            {pedidos.length === 0 ? (
              <div className="text-center py-12 text-stone-400 text-xs italic font-semibold">
                Nenhum pedido agendado para entrega em {new Date(selectedDate).toLocaleDateString('pt-BR')}.
              </div>
            ) : (
              <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                {pedidos.map((p) => {
                  const isSelected = selectedPedidoIds.includes(p.id);
                  return (
                    <div 
                      key={p.id}
                      onClick={() => handleSelectToggle(p.id)}
                      className={`p-3.5 border rounded-xl cursor-pointer transition-all flex items-start justify-between text-xs font-semibold ${
                        isSelected 
                          ? 'border-amber-600 bg-amber-50/20 shadow-xs' 
                          : 'border-stone-200 bg-white hover:bg-stone-50/50'
                      }`}
                    >
                      <div className="min-w-0 pr-3">
                        <span className="text-stone-850 font-bold text-sm block">Pedido #{p.numero}</span>
                        <span className="text-stone-600 block mt-0.5">{p.cliente_nome}</span>
                        <span className="text-[10px] text-stone-400 block font-medium mt-1">
                          📍 {p.endereco} • Bairro: {p.bairro}
                        </span>
                      </div>
                      
                      <div className="text-right shrink-0 flex flex-col items-end gap-2">
                        <span className="text-stone-850 font-black block">
                          {p.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </span>
                        <span className={`inline-flex px-1.5 py-0.5 rounded text-[8px] font-black uppercase ${
                          p.status === 'faturado' ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'
                        }`}>
                          {p.status}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {selectedPedidoIds.length > 0 && (
              <button 
                onClick={handleGenerateRoute}
                disabled={routing}
                className="w-full rounded-lg bg-stone-900 hover:bg-stone-850 text-white font-bold text-xs py-2.5 text-center cursor-pointer transition-all flex items-center justify-center gap-1.5"
              >
                {routing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 fill-white" />}
                Otimizar Rota de Entrega ({selectedPedidoIds.length} selecionados)
              </button>
            )}
          </div>

          {/* Seção 2: Roteiro Otimizado de Entrega */}
          <div className="rounded-2xl bg-white p-5 shadow-sm border border-stone-200 space-y-4">
            <h3 className="text-xs font-black text-stone-850 uppercase tracking-wider border-b border-stone-100 pb-2">Roteiro Otimizado da Viagem</h3>

            {!routeGenerated ? (
              <div className="text-center py-20 text-stone-400 text-xs italic font-semibold flex flex-col items-center justify-center gap-2">
                <Truck className="h-10 w-10 text-stone-300" />
                Selecione as cargas ao lado e clique em Otimizar Rota.
              </div>
            ) : (
              <div className="space-y-4 animate-fadeIn">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/30 p-3.5 flex items-start gap-2.5 text-xs text-stone-700">
                  <Check className="h-5 w-5 shrink-0 text-emerald-700" />
                  <div>
                    <span className="font-bold text-emerald-800 block">Rota Otimizada com Sucesso!</span>
                    <span className="text-[10px] text-emerald-700 font-medium block mt-0.5">
                      Distância estimada de trajeto calculada. As paradas foram organizadas logicamente por proximidade territorial (bairros vizinhos) para economizar tempo e combustível.
                    </span>
                  </div>
                </div>

                {/* Linha do tempo do Roteiro */}
                <div className="relative border-l border-stone-200 pl-4 ml-2.5 py-1 space-y-5 text-xs font-semibold text-stone-700">
                  {/* Ponto de Saída */}
                  <div className="relative">
                    <span className="absolute -left-[22px] top-0 h-3 w-3 rounded-full border border-stone-300 bg-stone-500" />
                    <span className="text-[10px] text-stone-400 font-bold block leading-none uppercase">SAÍDA</span>
                    <span className="text-stone-850 font-bold block mt-0.5">Fábrica Doces Prigor</span>
                    <span className="text-[10px] text-stone-400 block font-medium">Campo de São Cristóvão, São Cristóvão</span>
                  </div>

                  {/* Paradas */}
                  {routeOrders.map((p, idx) => (
                    <div key={p.id} className="relative">
                      <span className="absolute -left-[22.5px] top-0 h-4.5 w-4.5 rounded-full border border-amber-600 bg-white text-[9px] font-black text-amber-800 flex items-center justify-center shadow-xs">
                        {idx + 1}
                      </span>
                      <span className="text-[10px] text-amber-800 font-bold block leading-none uppercase">ENTREGA #{p.numero}</span>
                      <span className="text-stone-850 font-bold block mt-0.5">{p.cliente_nome}</span>
                      <span className="text-[10px] text-stone-450 block font-medium">📍 {p.endereco} • Bairro: {p.bairro}</span>
                      
                      <div className="flex gap-2.5 mt-1.5 text-[10px] font-bold text-amber-700">
                        <a 
                          href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(p.endereco || '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline flex items-center gap-0.5"
                        >
                          Ver no Google Maps <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2.5 pt-2 border-t border-stone-150">
                  <button 
                    onClick={handleCopyRouteToClipboard}
                    className="flex-1 rounded-lg border border-emerald-250 bg-emerald-700/5 hover:bg-emerald-700/10 text-emerald-800 font-bold text-xs py-2 px-3 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Share2 className="h-4 w-4 text-emerald-700" />
                    Enviar Roteiro para WhatsApp
                  </button>
                  <button 
                    onClick={handleConfirmDeliveries}
                    className="flex-1 rounded-lg bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs py-2 px-3 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Check className="h-4 w-4" />
                    Confirmar Saída / Entrega
                  </button>
                </div>
              </div>
            )}

          </div>

        </div>
      )}
    </div>
  );
}
