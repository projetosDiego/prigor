'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { 
  Truck, 
  Play, 
  Check, 
  ExternalLink, 
  Share2, 
  RefreshCw, 
  Loader2,
  Printer,
  ClipboardCheck,
  CheckCircle2,
  Circle,
  AlertTriangle,
  Phone,
  Search,
  Package,
  CheckCheck,
  CheckSquare,
  RotateCcw
} from 'lucide-react';
import { responseErrorMessage } from '@/lib/errors';
import { useToast } from '@/components/shared/Toast';
import type { OrderDTO, Paginated } from '@/lib/api-types';

/** Monta o logradouro completo para exibir e para montar o link do Maps. */
function enderecoDoPedido(p: OrderDTO): string {
  const e = p.deliveryAddress;
  if (!e) return 'Endereço não cadastrado na ficha do cliente';
  const partes = [
    [e.address, e.number].filter(Boolean).join(', '),
    e.complement,
    e.neighborhood,
    e.city,
  ].filter(Boolean);
  return partes.length > 0 ? partes.join(' - ') : 'Endereço não cadastrado na ficha do cliente';
}

/** Bairro do cliente, usado para agrupar as paradas do roteiro. */
function bairroDoPedido(p: OrderDTO): string {
  return p.deliveryAddress?.neighborhood || 'Sem bairro';
}

/** Formata telefone com máscara brasileira. */
function formatPhone(v: string | null | undefined): string {
  if (!v) return '';
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** Calcula a quantidade total de itens / volumes do pedido. */
function totalVolumes(p: OrderDTO): number {
  if (!p.items || p.items.length === 0) return 0;
  return p.items.reduce((acc, item) => acc + (Number(item.quantity) || 0), 0);
}

/** Formata uma data civil (AAAA-MM-DD) como dd/mm/aaaa. */
function formatarData(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [ano, mes, dia] = iso.slice(0, 10).split('-');
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : '—';
}

/** Status que valem como carga do dia (inclui entregue para manter o histórico visível). */
const STATUS_DE_CARGA = ['confirmado', 'em_producao', 'faturado', 'entregue'];

export default function LogisticsPage() {
  const { toast, confirm } = useToast();

  const [pedidos, setPedidos] = useState<OrderDTO[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Modo de visualização: 'roteiro' ou 'checklist'
  const [activeTab, setActiveTab] = useState<'roteiro' | 'checklist'>('roteiro');

  // Pedidos selecionados para a rota de entrega
  const [selectedPedidoIds, setSelectedPedidoIds] = useState<string[]>([]);
  const [routeOrders, setRouteOrders] = useState<OrderDTO[]>([]);
  const [routing, setRouting] = useState(false);
  const [routeGenerated, setRouteGenerated] = useState(false);

  // Checklist de Conferência de Expedição (IDs dos pedidos já conferidos e embarcados)
  const [checkedOrderIds, setCheckedOrderIds] = useState<string[]>([]);
  const [checklistSearch, setChecklistSearch] = useState('');
  const [checklistFilter, setChecklistFilter] = useState<'todos' | 'pendentes' | 'conferidos'>('todos');

  // Carrega marcações de conferência salvas localmente para a data
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`prigor_logistics_checked_${selectedDate}`);
      if (saved) {
        setCheckedOrderIds(JSON.parse(saved));
      } else {
        setCheckedOrderIds([]);
      }
    } catch {
      setCheckedOrderIds([]);
    }
  }, [selectedDate]);

  const toggleCheckOrder = (id: string) => {
    setCheckedOrderIds((prev) => {
      const next = prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id];
      try {
        localStorage.setItem(`prigor_logistics_checked_${selectedDate}`, JSON.stringify(next));
      } catch {
        /* ignora */
      }
      return next;
    });
  };

  const handleCheckAll = (check: boolean) => {
    const listToAffect = pedidosChecklist;
    const next = check ? listToAffect.map((p) => p.id) : [];
    setCheckedOrderIds(next);
    try {
      localStorage.setItem(`prigor_logistics_checked_${selectedDate}`, JSON.stringify(next));
    } catch {
      /* ignora */
    }
  };

  const fetchPedidos = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const params = new URLSearchParams({
        deliveryFrom: selectedDate,
        deliveryTo: selectedDate,
        pageSize: '200',
      });

      const res = await fetch(`/api/orders?${params.toString()}`);
      if (!res.ok) throw new Error(await responseErrorMessage(res, 'Falha ao carregar a lista de pedidos.'));

      const json: Paginated<OrderDTO> = await res.json();
      const daCarga = json.data.filter((p) => STATUS_DE_CARGA.includes(p.status));

      setPedidos(daCarga);
      setSelectedPedidoIds([]);
      setRouteOrders([]);
      setRouteGenerated(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar a lista de pedidos.');
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    void (async () => {
      await fetchPedidos();
    })();
  }, [fetchPedidos]);

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
    setTimeout(() => {
      const selected = pedidos.filter(p => selectedPedidoIds.includes(p.id));
      const sorted = [...selected].sort((a, b) =>
        bairroDoPedido(a).localeCompare(bairroDoPedido(b)),
      );

      setRouteOrders(sorted);
      setRouteGenerated(true);
      setRouting(false);
    }, 1200);
  };

  /** Atualiza o status de um pedido individual diretamente (marcar como entregue ou reverter) */
  const handleMarkAsDelivered = async (orderId: string, novoStatus: 'entregue' | 'confirmado' = 'entregue') => {
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: novoStatus }),
      });
      if (!res.ok) throw new Error(await responseErrorMessage(res, 'Falha ao atualizar pedido.'));

      setPedidos((prev) =>
        prev.map((p) => (p.id === orderId ? { ...p, status: novoStatus } : p))
      );
      setRouteOrders((prev) =>
        prev.map((p) => (p.id === orderId ? { ...p, status: novoStatus } : p))
      );
      toast(novoStatus === 'entregue' ? 'Pedido marcado como ENTREGUE com sucesso!' : 'Status revertido para confirmado.', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao atualizar pedido.', 'error');
    }
  };

  /** Marca múltiplos pedidos selecionados como entregues */
  const handleMarkMultipleAsDelivered = async (orderIds: string[]) => {
    if (orderIds.length === 0) {
      toast('Nenhum pedido selecionado para marcar como entregue.', 'error');
      return;
    }
    const qtd = orderIds.length;
    const ok = await confirm({
      title: 'Confirmar Entregas',
      message: `Deseja marcar ${qtd} pedido(s) como ENTREGUE(S)? Isso atualizará o status dos pedidos para entregue e registrará a baixa no estoque.`,
      confirmLabel: 'Confirmar Entregas',
      cancelLabel: 'Voltar',
    });
    if (!ok) return;

    try {
      setLoading(true);
      const resultados = await Promise.all(
        orderIds.map(async (id) => {
          try {
            const res = await fetch(`/api/orders/${id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ status: 'entregue' })
            });
            if (res.ok) return null;
            return `Pedido: ${await responseErrorMessage(res, 'falha ao atualizar.')}`;
          } catch (err) {
            return `Pedido: ${err instanceof Error ? err.message : 'falha de conexão.'}`;
          }
        })
      );

      const falhas = resultados.filter((r): r is string => r !== null);

      if (falhas.length === 0) {
        toast(`${qtd} pedido(s) marcado(s) como entregue com sucesso!`, 'success');
      } else {
        toast(`${qtd - falhas.length} de ${qtd} pedidos atualizados com sucesso.`, 'error');
      }

      await fetchPedidos();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao confirmar entregas.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyRouteToClipboard = () => {
    if (routeOrders.length === 0) return;

    const header = `🚚 *ROTEIRO DE ENTREGA DOCES PRIGOR*\n*Data*: ${formatarData(selectedDate)}\n*Total Cargas*: ${routeOrders.length} pedidos\n\n📍 *Saída*: Fábrica Doces Prigor (Campo de São Cristóvão)\n\n`;

    const text = routeOrders.map((p, idx) => {
      const endereco = enderecoDoPedido(p);
      const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(endereco)}`;
      const tel = p.deliveryAddress?.phone || p.billingAddress?.phone;
      const volumes = totalVolumes(p);
      return `*Parada ${idx + 1}: Pedido #${p.numero}*\n` +
             `   • Cliente: ${p.customerName ?? '—'}${tel ? ` (${formatPhone(tel)})` : ''}\n` +
             `   • Bairro: ${bairroDoPedido(p)}\n` +
             `   • Endereço: ${endereco}\n` +
             `   • Carga: ${volumes} volume(s)\n` +
             `   • Valor: ${p.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} (${p.paymentMethod})\n` +
             `   • Rota: ${mapsUrl}`;
    }).join('\n\n');

    const footer = '\n\n🍫 *Doces Prigor - Boa viagem e dirija com segurança!*';

    navigator.clipboard.writeText(header + text + footer);
    toast('Roteiro copiado para o WhatsApp do motorista!', 'success');
  };

  // Base do checklist: se o usuário selecionou pedidos específicos para a rota, usa eles; senão, usa todos os pedidos do dia
  const pedidosChecklist = selectedPedidoIds.length > 0
    ? pedidos.filter((p) => selectedPedidoIds.includes(p.id))
    : pedidos;

  const totalPedidosChecklist = pedidosChecklist.length;
  const totalVolumesChecklist = pedidosChecklist.reduce((acc, p) => acc + totalVolumes(p), 0);
  const valorTotalChecklist = pedidosChecklist.reduce((acc, p) => acc + (Number(p.total) || 0), 0);

  const pendentes = pedidosChecklist.filter((p) => !checkedOrderIds.includes(p.id));
  const conferidos = pedidosChecklist.filter((p) => checkedOrderIds.includes(p.id));
  const percentConferido = totalPedidosChecklist > 0 ? Math.round((conferidos.length / totalPedidosChecklist) * 100) : 0;

  // Pedidos que ainda não estão com status entregue
  const naoEntreguesChecklist = pedidosChecklist.filter((p) => p.status !== 'entregue');
  const conferidosNaoEntregues = conferidos.filter((p) => p.status !== 'entregue');

  // Filtro de exibição na lista do checklist
  const pedidosExibidosChecklist = pedidosChecklist.filter((p) => {
    const isChecked = checkedOrderIds.includes(p.id);
    if (checklistFilter === 'pendentes' && isChecked) return false;
    if (checklistFilter === 'conferidos' && !isChecked) return false;

    if (checklistSearch.trim()) {
      const q = checklistSearch.toLowerCase().trim().replace('#', '');
      const numMatch = String(p.numero).includes(q);
      const cliMatch = (p.customerName || '').toLowerCase().includes(q);
      const bairroMatch = bairroDoPedido(p).toLowerCase().includes(q);
      return numMatch || cliMatch || bairroMatch;
    }
    return true;
  });

  return (
    <>
      {/* ─────────────────────────────────────────────────────────────
          INTERFACE INTERATIVA (Oculta ao imprimir via print:hidden)
         ───────────────────────────────────────────────────────────── */}
      <div className="space-y-6 animate-fadeIn print:hidden">
        {/* Cabeçalho */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black text-stone-900 tracking-tight flex items-center gap-2.5">
              <Truck className="h-6 w-6 text-amber-700" />
              Roteiros & Logística
            </h2>
            <p className="text-xs text-stone-500 font-medium">
              Gestão de entregas diárias, conferência de carga, romaneio e baixa de pedidos entregues
            </p>
          </div>

          {/* Seletor de Abas de Visão */}
          <div className="flex items-center p-1 bg-stone-100 border border-stone-200 rounded-xl">
            <button
              type="button"
              onClick={() => setActiveTab('roteiro')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'roteiro'
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-500 hover:text-stone-800'
              }`}
            >
              <Truck className="h-3.5 w-3.5" />
              Roteiro & Paradas
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('checklist')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'checklist'
                  ? 'bg-amber-700 text-white shadow-xs'
                  : 'text-stone-500 hover:text-stone-800'
              }`}
            >
              <ClipboardCheck className="h-3.5 w-3.5" />
              Checklist de Carga ({conferidos.length}/{totalPedidosChecklist})
            </button>
          </div>
        </div>

        {/* Barra de Seleção de Data e Ações Globais */}
        <div className="rounded-2xl bg-white p-4 shadow-sm border border-stone-200 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3.5 items-end">
          <div className="sm:col-span-1 md:col-span-2">
            <label className="text-[10px] text-stone-400 font-bold uppercase tracking-wider block mb-1">
              Data de Entrega da Carga
            </label>
            <div className="relative">
              <input 
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full rounded-lg border border-stone-200 text-xs px-3 py-2 bg-stone-50/50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500 font-semibold text-stone-900"
              />
            </div>
          </div>

          <button 
            type="button"
            onClick={fetchPedidos}
            disabled={loading}
            className="rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-xs py-2 px-3 text-center cursor-pointer transition-all flex items-center justify-center gap-1.5 h-9"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Atualizar Carga
          </button>

          <button 
            type="button"
            onClick={() => window.print()}
            disabled={pedidosChecklist.length === 0}
            className="rounded-lg bg-stone-900 hover:bg-stone-850 text-white font-bold text-xs py-2 px-3 text-center cursor-pointer transition-all flex items-center justify-center gap-1.5 h-9 shadow-xs disabled:opacity-40"
            title="Imprimir Checklist e Romaneio de Carga para Prancheta"
          >
            <Printer className="h-4 w-4" />
            Imprimir Romaneio
          </button>
        </div>

        {/* Corpo Principal */}
        {loading ? (
          <div className="flex min-h-[30vh] flex-col items-center justify-center gap-2">
            <Loader2 className="h-6 w-6 animate-spin text-amber-700" />
            <p className="text-xs text-stone-500 font-semibold">Consultando pedidos agendados...</p>
          </div>
        ) : error ? (
          <div className="p-4 bg-red-50 border border-red-200 text-red-750 rounded-xl text-center text-xs font-semibold">
            {error}
          </div>
        ) : activeTab === 'roteiro' ? (
          /* ─────────────────────────────────────────────────────────────
              ABA 1: ROTEIRIZAÇÃO & TRAJETOS
             ───────────────────────────────────────────────────────────── */
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Seleção de Pedidos na Carga */}
            <div className="rounded-2xl bg-white p-5 shadow-sm border border-stone-200 space-y-4">
              <div className="flex flex-wrap justify-between items-center border-b border-stone-100 pb-2 gap-2">
                <div>
                  <h3 className="text-xs font-black text-stone-850 uppercase tracking-wider">
                    Carga Agendada ({pedidos.length})
                  </h3>
                  <span className="text-[10px] text-stone-400 font-medium">
                    Selecione os pedidos que entrarão nesta rota
                  </span>
                </div>
                {pedidos.length > 0 && (
                  <div className="flex items-center gap-2">
                    <button 
                      type="button"
                      onClick={() => setSelectedPedidoIds(pedidos.map(p => p.id))}
                      className="text-[10px] text-amber-800 font-bold hover:underline cursor-pointer"
                    >
                      Marcar Todos
                    </button>
                    {selectedPedidoIds.length > 0 && (
                      <button 
                        type="button"
                        onClick={() => setSelectedPedidoIds([])}
                        className="text-[10px] text-stone-400 font-bold hover:underline cursor-pointer"
                      >
                        Limpar
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Botão de baixa em lote dos pedidos do dia */}
              {naoEntreguesChecklist.length > 0 && (
                <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between gap-2 text-xs">
                  <span className="text-[11px] font-bold text-amber-950">
                    {selectedPedidoIds.length > 0
                      ? `${selectedPedidoIds.filter(id => pedidos.find(p => p.id === id)?.status !== 'entregue').length} selecionados pendentes de entrega`
                      : `${naoEntreguesChecklist.length} entrega(s) pendente(s) hoje`}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const idsToMark = selectedPedidoIds.length > 0 
                        ? selectedPedidoIds.filter(id => pedidos.find(p => p.id === id)?.status !== 'entregue')
                        : naoEntreguesChecklist.map(p => p.id);
                      handleMarkMultipleAsDelivered(idsToMark);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-black text-[11px] flex items-center gap-1 shadow-2xs cursor-pointer"
                  >
                    <Check className="h-3 w-3" />
                    Marcar como Entregues
                  </button>
                </div>
              )}

              {pedidos.length === 0 ? (
                <div className="text-center py-12 text-stone-400 text-xs italic font-semibold">
                  Nenhum pedido agendado para entrega em {formatarData(selectedDate)}.
                </div>
              ) : (
                <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                  {pedidos.map((p) => {
                    const isSelected = selectedPedidoIds.includes(p.id);
                    const isChecked = checkedOrderIds.includes(p.id);
                    const isEntregue = p.status === 'entregue';
                    const volumes = totalVolumes(p);
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
                        <div className="min-w-0 pr-3 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-stone-850 font-bold text-sm">Pedido #{p.numero}</span>
                            {isChecked && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-black bg-stone-100 text-stone-700">
                                <Check className="h-3 w-3 text-emerald-600" /> Conferido
                              </span>
                            )}
                            {isEntregue && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-black bg-emerald-600 text-white">
                                ✓ Entregue
                              </span>
                            )}
                          </div>
                          <span className="text-stone-600 block mt-0.5 font-medium">{p.customerName}</span>
                          <span className="text-[10px] text-stone-400 block font-medium mt-1">
                            📍 {enderecoDoPedido(p)} • Bairro: <strong className="text-stone-700">{bairroDoPedido(p)}</strong>
                          </span>
                          <div className="mt-1 text-[10px] text-amber-850 font-bold">
                            📦 {volumes} volume(s) / itens
                          </div>
                        </div>
                        
                        <div className="text-right shrink-0 flex flex-col items-end gap-1.5">
                          <span className="text-stone-850 font-black block">
                            {p.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </span>
                          
                          {/* Botão de marcar entregue direto no card */}
                          {isEntregue ? (
                            <div className="flex items-center gap-1">
                              <span className="inline-flex px-1.5 py-0.5 rounded text-[8px] font-black uppercase bg-emerald-100 text-emerald-800">
                                Entregue
                              </span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleMarkAsDelivered(p.id, 'confirmado');
                                }}
                                className="text-[9px] text-stone-400 hover:text-stone-600 underline cursor-pointer"
                                title="Reverter para confirmado"
                              >
                                Desfazer
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleMarkAsDelivered(p.id, 'entregue');
                              }}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold bg-stone-900 hover:bg-stone-850 text-white shadow-2xs cursor-pointer transition-all"
                            >
                              <Check className="h-3 w-3 text-emerald-400" />
                              Marcar Entregue
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {selectedPedidoIds.length > 0 && (
                <div className="pt-2 border-t border-stone-100 flex flex-col gap-2">
                  <button 
                    type="button"
                    onClick={handleGenerateRoute}
                    disabled={routing}
                    className="w-full rounded-lg bg-stone-900 hover:bg-stone-850 text-white font-bold text-xs py-2.5 text-center cursor-pointer transition-all flex items-center justify-center gap-1.5 shadow-xs"
                  >
                    {routing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 fill-white" />}
                    Otimizar Rota por Bairro ({selectedPedidoIds.length} selecionados)
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('checklist')}
                    className="w-full rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 font-bold text-xs py-2 text-center cursor-pointer transition-all flex items-center justify-center gap-1.5"
                  >
                    <ClipboardCheck className="h-4 w-4" />
                    Abrir Checklist de Conferência ({selectedPedidoIds.length})
                  </button>
                </div>
              )}
            </div>

            {/* Roteiro Otimizado de Entrega */}
            <div className="rounded-2xl bg-white p-5 shadow-sm border border-stone-200 space-y-4">
              <div className="flex items-center justify-between border-b border-stone-100 pb-2">
                <h3 className="text-xs font-black text-stone-850 uppercase tracking-wider">
                  Roteiro Otimizado da Viagem
                </h3>
                {routeGenerated && (
                  <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-full">
                    {routeOrders.length} paradas
                  </span>
                )}
              </div>

              {!routeGenerated ? (
                <div className="text-center py-20 text-stone-400 text-xs italic font-semibold flex flex-col items-center justify-center gap-2">
                  <Truck className="h-10 w-10 text-stone-300" />
                  Selecione as cargas ao lado e clique em &quot;Otimizar Rota por Bairro&quot;.
                </div>
              ) : (
                <div className="space-y-4 animate-fadeIn">
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/30 p-3.5 flex items-start gap-2.5 text-xs text-stone-700">
                    <Check className="h-5 w-5 shrink-0 text-emerald-700" />
                    <div>
                      <span className="font-bold text-emerald-800 block">Rota Otimizada por Bairro!</span>
                      <span className="text-[10px] text-emerald-700 font-medium block mt-0.5">
                        As paradas foram agrupadas territorialmente para reduzir tempo e consumo de combustível.
                      </span>
                    </div>
                  </div>

                  {/* Linha do tempo do Roteiro */}
                  <div className="relative border-l border-stone-200 pl-4 ml-2.5 py-1 space-y-5 text-xs font-semibold text-stone-700 max-h-[360px] overflow-y-auto pr-1">
                    {/* Ponto de Saída */}
                    <div className="relative">
                      <span className="absolute -left-[22px] top-0 h-3 w-3 rounded-full border border-stone-300 bg-stone-500" />
                      <span className="text-[10px] text-stone-400 font-bold block leading-none uppercase">SAÍDA</span>
                      <span className="text-stone-850 font-bold block mt-0.5">Fábrica Doces Prigor</span>
                      <span className="text-[10px] text-stone-400 block font-medium">Campo de São Cristóvão, São Cristóvão</span>
                    </div>

                    {/* Paradas */}
                    {routeOrders.map((p, idx) => {
                      const isEntregue = p.status === 'entregue';
                      return (
                        <div key={p.id} className="relative">
                          <span className={`absolute -left-[22.5px] top-0 h-4.5 w-4.5 rounded-full border text-[9px] font-black flex items-center justify-center shadow-xs ${
                            isEntregue ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-amber-600 bg-white text-amber-800'
                          }`}>
                            {isEntregue ? '✓' : idx + 1}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-amber-800 font-bold block leading-none uppercase">
                              PARADA {idx + 1} • PEDIDO #{p.numero}
                            </span>
                            {isEntregue ? (
                              <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[8px] font-black bg-emerald-100 text-emerald-800">
                                ✓ Entregue
                              </span>
                            ) : checkedOrderIds.includes(p.id) ? (
                              <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[8px] font-black bg-stone-100 text-stone-700">
                                ✓ Conferido
                              </span>
                            ) : null}
                          </div>
                          <span className="text-stone-850 font-bold block mt-0.5">{p.customerName}</span>
                          <span className="text-[10px] text-stone-500 block font-medium">
                            📍 {enderecoDoPedido(p)} • Bairro: <strong className="text-stone-800">{bairroDoPedido(p)}</strong>
                          </span>
                          <span className="text-[10px] text-amber-900 block font-semibold mt-0.5">
                            📦 {totalVolumes(p)} volume(s) • Valor: {p.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} ({p.paymentMethod})
                          </span>

                          <div className="flex flex-wrap items-center gap-2 mt-1.5 text-[10px]">
                            <a
                              href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(enderecoDoPedido(p))}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-bold text-amber-700 hover:underline flex items-center gap-0.5"
                            >
                              Ver no Maps <ExternalLink className="h-3 w-3" />
                            </a>

                            <span className="text-stone-300">|</span>

                            {isEntregue ? (
                              <button
                                type="button"
                                onClick={() => handleMarkAsDelivered(p.id, 'confirmado')}
                                className="font-bold text-stone-400 hover:text-stone-600 underline cursor-pointer"
                              >
                                Desfazer entrega
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleMarkAsDelivered(p.id, 'entregue')}
                                className="font-bold text-emerald-700 hover:text-emerald-900 flex items-center gap-0.5 cursor-pointer bg-emerald-50 hover:bg-emerald-100 px-2 py-0.5 rounded border border-emerald-200"
                              >
                                <Check className="h-3 w-3" />
                                Marcar Entrega Concluída
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex flex-wrap gap-2 pt-2 border-t border-stone-150">
                    <button 
                      type="button"
                      onClick={handleCopyRouteToClipboard}
                      className="flex-1 rounded-lg border border-emerald-250 bg-emerald-700/5 hover:bg-emerald-700/10 text-emerald-800 font-bold text-xs py-2 px-3 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Share2 className="h-4 w-4 text-emerald-700" />
                      Enviar Roteiro para WhatsApp
                    </button>
                    <button 
                      type="button"
                      onClick={() => handleMarkMultipleAsDelivered(routeOrders.map(p => p.id))}
                      className="flex-1 rounded-lg bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs py-2 px-3 transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      <Check className="h-4 w-4 text-emerald-400" />
                      Marcar Toda a Rota como Entregue
                    </button>
                  </div>
                </div>
              )}
            </div>

          </div>
        ) : (
          /* ─────────────────────────────────────────────────────────────
              ABA 2: CHECKLIST DE CONFERÊNCIA DE EXPEDIÇÃO & CARGA
             ───────────────────────────────────────────────────────────── */
          <div className="space-y-5 animate-fadeIn">
            
            {/* Grade de Indicadores da Carga */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
              <div className="rounded-2xl bg-white p-4 border border-stone-200 shadow-xs">
                <span className="text-[10px] text-stone-400 font-bold uppercase tracking-wider block">Total de Pedidos</span>
                <span className="text-2xl font-black text-stone-900 mt-1 block">{totalPedidosChecklist}</span>
                <span className="text-[10px] text-stone-500 font-medium">
                  {pedidosChecklist.filter(p => p.status === 'entregue').length} já entregues
                </span>
              </div>

              <div className="rounded-2xl bg-white p-4 border border-stone-200 shadow-xs">
                <span className="text-[10px] text-stone-400 font-bold uppercase tracking-wider block">Volumes / Itens</span>
                <span className="text-2xl font-black text-amber-850 mt-1 block flex items-center gap-1.5">
                  <Package className="h-5 w-5 text-amber-700" />
                  {totalVolumesChecklist}
                </span>
                <span className="text-[10px] text-stone-500 font-medium">unidades totais na carga</span>
              </div>

              <div className="rounded-2xl bg-white p-4 border border-stone-200 shadow-xs">
                <span className="text-[10px] text-stone-400 font-bold uppercase tracking-wider block">Valor da Carga</span>
                <span className="text-xl font-black text-stone-900 mt-1 block">
                  {valorTotalChecklist.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </span>
                <span className="text-[10px] text-stone-500 font-medium">a ser entregue / faturado</span>
              </div>

              <div className="rounded-2xl bg-white p-4 border border-stone-200 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-stone-400 font-bold uppercase tracking-wider block">Conferência</span>
                  <span className="text-xs font-black text-amber-800">{percentConferido}%</span>
                </div>
                <div className="w-full bg-stone-100 rounded-full h-2.5 mt-2 overflow-hidden">
                  <div 
                    className={`h-full transition-all duration-300 ${percentConferido === 100 ? 'bg-emerald-600' : 'bg-amber-600'}`} 
                    style={{ width: `${percentConferido}%` }} 
                  />
                </div>
                <span className="text-[10px] font-bold text-stone-600 mt-1.5 block">
                  {conferidos.length} de {totalPedidosChecklist} conferidos
                </span>
              </div>
            </div>

            {/* Banner de Alerta de Faltantes / Sucesso */}
            {totalPedidosChecklist > 0 && (
              pendentes.length > 0 ? (
                <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shadow-xs">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-amber-100 text-amber-900 rounded-xl shrink-0 mt-0.5">
                      <AlertTriangle className="h-5 w-5 text-amber-700" />
                    </div>
                    <div>
                      <span className="font-black text-amber-950 text-sm block">
                        Atenção: Faltando conferir {pendentes.length} {pendentes.length === 1 ? 'pedido' : 'pedidos'} para ir pra rua!
                      </span>
                      <p className="text-xs text-amber-850 mt-0.5">
                        Verifique se todos os pacotes foram colocados no veículo antes da saída.
                      </p>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {pendentes.map((p) => (
                          <button
                            type="button"
                            key={p.id}
                            onClick={() => toggleCheckOrder(p.id)}
                            className="inline-flex items-center gap-1 bg-white hover:bg-amber-100 border border-amber-300 text-amber-950 rounded-lg px-2 py-0.5 text-xs font-bold transition-colors cursor-pointer shadow-2xs"
                            title="Clique para marcar como conferido"
                          >
                            #{p.numero} · {p.customerName} ({bairroDoPedido(p)})
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setChecklistFilter('pendentes')}
                    className="shrink-0 px-3 py-1.5 rounded-lg bg-amber-700 hover:bg-amber-800 text-white text-xs font-bold cursor-pointer transition-all shadow-2xs"
                  >
                    Ver somente pendentes
                  </button>
                </div>
              ) : (
                <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-emerald-100 text-emerald-900 rounded-xl shrink-0">
                      <CheckCircle2 className="h-6 w-6 text-emerald-700" />
                    </div>
                    <div>
                      <span className="font-black text-emerald-950 text-sm block">
                        🎉 Carga 100% Conferida e Pronta para Ir pra Rua!
                      </span>
                      <p className="text-xs text-emerald-800 mt-0.5">
                        Todos os {totalPedidosChecklist} pedidos foram checados no checklist. O veículo pode ser liberado.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {naoEntreguesChecklist.length > 0 && (
                      <button
                        type="button"
                        onClick={() => handleMarkMultipleAsDelivered(naoEntreguesChecklist.map(p => p.id))}
                        className="px-3.5 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-black cursor-pointer transition-all flex items-center gap-1.5 shadow-2xs"
                      >
                        <Check className="h-4 w-4" />
                        Marcar Carga como Entregue ({naoEntreguesChecklist.length})
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => window.print()}
                      className="px-3.5 py-2 rounded-lg bg-stone-900 hover:bg-stone-850 text-white text-xs font-black cursor-pointer transition-all flex items-center gap-1.5 shadow-2xs"
                    >
                      <Printer className="h-4 w-4" />
                      Imprimir Romaneio
                    </button>
                  </div>
                </div>
              )
            )}

            {/* Barra de Ferramentas do Checklist */}
            <div className="rounded-2xl bg-white p-3.5 border border-stone-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
              {/* Filtro de Abas Rápidas */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setChecklistFilter('todos')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    checklistFilter === 'todos'
                      ? 'bg-stone-900 text-white'
                      : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                  }`}
                >
                  Todos ({totalPedidosChecklist})
                </button>
                <button
                  type="button"
                  onClick={() => setChecklistFilter('pendentes')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    checklistFilter === 'pendentes'
                      ? 'bg-amber-600 text-white'
                      : 'bg-amber-50 text-amber-900 hover:bg-amber-100'
                  }`}
                >
                  ⚠️ Pendentes ({pendentes.length})
                </button>
                <button
                  type="button"
                  onClick={() => setChecklistFilter('conferidos')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    checklistFilter === 'conferidos'
                      ? 'bg-emerald-700 text-white'
                      : 'bg-emerald-50 text-emerald-900 hover:bg-emerald-100'
                  }`}
                >
                  ✓ Conferidos ({conferidos.length})
                </button>
              </div>

              {/* Campo de Busca Rápida */}
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-stone-400" />
                <input
                  type="text"
                  placeholder="Buscar nº pedido, cliente ou bairro..."
                  value={checklistSearch}
                  onChange={(e) => setChecklistSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-stone-200 text-xs bg-stone-50/50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500 font-medium"
                />
              </div>

              {/* Ações em Lote */}
              <div className="flex flex-wrap items-center gap-2">
                {conferidosNaoEntregues.length > 0 && (
                  <button
                    type="button"
                    onClick={() => handleMarkMultipleAsDelivered(conferidosNaoEntregues.map(p => p.id))}
                    className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs"
                    title="Marca todos os pedidos que já foram conferidos no checklist como Entregues"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Entregar Conferidos ({conferidosNaoEntregues.length})
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleCheckAll(true)}
                  className="px-3 py-1.5 rounded-lg border border-stone-200 bg-white hover:bg-stone-50 text-stone-700 text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
                >
                  <CheckCheck className="h-3.5 w-3.5 text-emerald-600" />
                  Conferir Todos
                </button>
                <button
                  type="button"
                  onClick={() => handleCheckAll(false)}
                  className="px-3 py-1.5 rounded-lg border border-stone-200 bg-white hover:bg-stone-50 text-stone-500 text-xs font-bold transition-all cursor-pointer"
                >
                  Desmarcar
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3.5 py-1.5 rounded-lg bg-stone-900 hover:bg-stone-850 text-white text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs"
                >
                  <Printer className="h-3.5 w-3.5" />
                  Imprimir Folha A4
                </button>
              </div>
            </div>

            {/* Listagem de Pedidos do Checklist */}
            {pedidosExibidosChecklist.length === 0 ? (
              <div className="rounded-2xl bg-white p-12 border border-stone-200 text-center text-stone-400 text-xs font-semibold">
                Nenhum pedido encontrado para o filtro selecionado.
              </div>
            ) : (
              <div className="space-y-3">
                {pedidosExibidosChecklist.map((p) => {
                  const isChecked = checkedOrderIds.includes(p.id);
                  const isEntregue = p.status === 'entregue';
                  const tel = p.deliveryAddress?.phone || p.billingAddress?.phone;
                  const volumes = totalVolumes(p);
                  const isPago = p.paymentStatus === 'pago';

                  return (
                    <div
                      key={p.id}
                      className={`rounded-2xl border transition-all p-4 ${
                        isChecked 
                          ? 'bg-emerald-50/20 border-emerald-300 shadow-2xs' 
                          : 'bg-white border-stone-200 hover:border-amber-300 shadow-xs'
                      }`}
                    >
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-stone-100 pb-3">
                        <div className="flex items-start gap-3">
                          {/* Botão de Checkbox Interativo Grande */}
                          <button
                            type="button"
                            onClick={() => toggleCheckOrder(p.id)}
                            className={`px-3 py-2 rounded-xl text-xs font-black flex items-center gap-2 cursor-pointer transition-all shrink-0 ${
                              isChecked
                                ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
                                : 'bg-stone-100 hover:bg-amber-100 text-stone-700 border border-stone-300'
                            }`}
                          >
                            {isChecked ? (
                              <>
                                <CheckCircle2 className="h-5 w-5 text-white" />
                                <span>CONFERIDO</span>
                              </>
                            ) : (
                              <>
                                <Circle className="h-5 w-5 text-stone-400" />
                                <span>CONFERIR</span>
                              </>
                            )}
                          </button>

                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-base font-black text-stone-900">
                                Pedido #{p.numero}
                              </span>
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black bg-stone-100 text-stone-700 uppercase">
                                {p.status}
                              </span>
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-900 uppercase">
                                📍 {bairroDoPedido(p)}
                              </span>
                            </div>
                            <span className="text-sm font-bold text-stone-850 block mt-0.5">
                              {p.customerName}
                            </span>
                          </div>
                        </div>

                        {/* Informações de Contato, Financeiro e Botão de Marcar como Entregue */}
                        <div className="flex flex-wrap items-center gap-3">
                          {tel && (
                            <a
                              href={`https://wa.me/55${tel.replace(/\D/g, '')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs font-bold hover:bg-emerald-100 transition-colors"
                            >
                              <Phone className="h-3.5 w-3.5 text-emerald-600" />
                              {formatPhone(tel)}
                            </a>
                          )}

                          <div className="text-right">
                            <span className="text-sm font-black text-stone-900 block">
                              {p.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </span>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                              isPago ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                            }`}>
                              {isPago ? '✓ Pago' : `⚠️ RECEBER NA ENTREGA (${p.paymentMethod})`}
                            </span>
                          </div>

                          {/* Ação de status de entrega individual no checklist */}
                          <div className="shrink-0">
                            {isEntregue ? (
                              <div className="flex items-center gap-1.5">
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-black bg-emerald-600 text-white shadow-2xs">
                                  <Check className="h-3.5 w-3.5" />
                                  ENTREGUE
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleMarkAsDelivered(p.id, 'confirmado')}
                                  className="text-[10px] text-stone-400 hover:text-stone-600 underline cursor-pointer"
                                  title="Reverter status de entrega"
                                >
                                  Desfazer
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleMarkAsDelivered(p.id, 'entregue')}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-stone-900 hover:bg-stone-850 text-white shadow-xs cursor-pointer transition-all"
                              >
                                <Truck className="h-3.5 w-3.5 text-amber-400" />
                                Marcar Entregue
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Endereço e Lista Discriminada de Itens */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-3 text-xs">
                        {/* Endereço Completo */}
                        <div className="md:col-span-1">
                          <span className="text-[10px] text-stone-400 font-bold uppercase tracking-wider block mb-0.5">
                            Endereço de Entrega
                          </span>
                          <span className="text-stone-700 font-medium leading-relaxed block">
                            {enderecoDoPedido(p)}
                          </span>
                          {p.notes && (
                            <div className="mt-1.5 p-2 bg-amber-50/70 border border-amber-200/80 rounded-lg text-amber-950 text-[11px] font-semibold">
                              <strong>Obs:</strong> {p.notes}
                            </div>
                          )}
                        </div>

                        {/* Itens e Quantidades Discriminadas */}
                        <div className="md:col-span-2 bg-stone-50/70 rounded-xl p-3 border border-stone-150">
                          <div className="flex items-center justify-between mb-1.5 border-b border-stone-200 pb-1">
                            <span className="text-[10px] text-stone-500 font-bold uppercase tracking-wider flex items-center gap-1">
                              <Package className="h-3.5 w-3.5 text-amber-700" />
                              Itens da Carga ({volumes} volumes no total)
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-32 overflow-y-auto pr-1">
                            {(p.items ?? []).map((item) => (
                              <div key={item.id} className="flex items-center justify-between text-xs bg-white px-2 py-1 rounded border border-stone-200">
                                <span className="font-semibold text-stone-800 truncate pr-2">
                                  {item.productName ?? 'Produto'}
                                </span>
                                <span className="font-black text-amber-850 shrink-0 bg-amber-50 px-1.5 py-0.5 rounded text-[11px]">
                                  {item.quantity}x
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

          </div>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────
          VISUALIZAÇÃO DE IMPRESSÃO (A4 / ROMANEIO DE EXPEDIÇÃO & CARGA)
          Ativada automaticamente ao clicar em Imprimir via window.print()
         ───────────────────────────────────────────────────────────── */}
      <div className="hidden print:block font-sans text-stone-900 p-4 max-w-4xl mx-auto bg-white">
        {/* Cabeçalho do Romaneio */}
        <div className="border-b-2 border-black pb-3 mb-3">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-black tracking-tight text-black uppercase">
                Doces Prigor — Romaneio de Carga & Expedição
              </h1>
              <p className="text-xs text-stone-600 font-bold">
                Checklist de Conferência de Saída e Manifesto de Entrega
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs font-bold block text-stone-600">Data de Saída / Entrega:</span>
              <span className="text-base font-black block text-black">{formatarData(selectedDate)}</span>
            </div>
          </div>

          {/* Resumo da Carga */}
          <div className="grid grid-cols-4 gap-2 mt-3 p-2 bg-stone-100 border border-stone-300 text-xs font-bold text-center">
            <div>
              <span className="text-[10px] text-stone-500 uppercase block">Total Pedidos</span>
              <span className="text-sm font-black text-black">{totalPedidosChecklist}</span>
            </div>
            <div>
              <span className="text-[10px] text-stone-500 uppercase block">Volumes / Caixas</span>
              <span className="text-sm font-black text-black">{totalVolumesChecklist}</span>
            </div>
            <div>
              <span className="text-[10px] text-stone-500 uppercase block">Valor Total da Carga</span>
              <span className="text-sm font-black text-black">
                {valorTotalChecklist.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-stone-500 uppercase block">Conferência</span>
              <span className="text-sm font-black text-black">{conferidos.length} de {totalPedidosChecklist} ({percentConferido}%)</span>
            </div>
          </div>
        </div>

        {/* Tabela de Romaneio para Prancheta */}
        <table className="w-full text-left text-[10px] border-collapse border border-stone-300">
          <thead>
            <tr className="bg-stone-200 text-black font-black uppercase border-b border-stone-400">
              <th className="p-1.5 text-center border-r border-stone-300 w-8">Conf.</th>
              <th className="p-1.5 border-r border-stone-300 w-14">Pedido</th>
              <th className="p-1.5 border-r border-stone-300 w-36">Cliente / Contato</th>
              <th className="p-1.5 border-r border-stone-300">Bairro & Endereço</th>
              <th className="p-1.5 border-r border-stone-300 w-44">Itens / Quantidades</th>
              <th className="p-1.5 border-r border-stone-300 w-28 text-right">Valor & Cobrança</th>
              <th className="p-1.5 text-center w-24">Visto / Assinatura</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-200 font-medium">
            {pedidosChecklist.map((p) => {
              const tel = p.deliveryAddress?.phone || p.billingAddress?.phone;
              const isChecked = checkedOrderIds.includes(p.id);
              const isPago = p.paymentStatus === 'pago';
              const volumes = totalVolumes(p);

              return (
                <tr key={p.id} className="border-b border-stone-200 break-inside-avoid">
                  {/* Caixinha para ticar a caneta */}
                  <td className="p-1.5 text-center border-r border-stone-300 align-top font-bold text-xs">
                    {isChecked ? '✓' : '[   ]'}
                  </td>
                  <td className="p-1.5 border-r border-stone-300 align-top font-black text-black">
                    #{p.numero}
                  </td>
                  <td className="p-1.5 border-r border-stone-300 align-top">
                    <strong className="block text-black">{p.customerName}</strong>
                    {tel && <span className="text-stone-600 block">{formatPhone(tel)}</span>}
                  </td>
                  <td className="p-1.5 border-r border-stone-300 align-top">
                    <strong className="block text-black">{bairroDoPedido(p)}</strong>
                    <span className="text-stone-600 block text-[9px]">{enderecoDoPedido(p)}</span>
                    {p.notes && <span className="block text-stone-800 italic mt-0.5">Obs: {p.notes}</span>}
                  </td>
                  <td className="p-1.5 border-r border-stone-300 align-top">
                    <span className="font-bold block text-black">Total: {volumes} volume(s)</span>
                    <div className="text-[9px] text-stone-700 leading-tight mt-0.5">
                      {(p.items ?? []).map((i) => `${i.quantity}x ${i.productName ?? 'Item'}`).join('; ')}
                    </div>
                  </td>
                  <td className="p-1.5 border-r border-stone-300 align-top text-right">
                    <strong className="block text-black">
                      {p.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </strong>
                    <span className="text-[9px] block uppercase font-bold text-stone-700">
                      {p.paymentMethod}
                    </span>
                    <span className={`text-[8px] font-black uppercase block ${isPago ? 'text-stone-600' : 'text-black underline'}`}>
                      {isPago ? 'PAGO' : 'A RECEBER'}
                    </span>
                  </td>
                  <td className="p-1.5 align-bottom text-center">
                    <div className="border-b border-stone-400 mt-5 w-full" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Rodapé com Assinaturas e Vistos */}
        <div className="mt-8 pt-4 border-t border-stone-300 grid grid-cols-3 gap-6 text-xs text-stone-700">
          <div>
            <div className="border-b border-black mb-1 h-8" />
            <span className="font-bold block text-black">Conferente / Expedição</span>
            <span className="text-[9px] text-stone-500">Nome e Visto</span>
          </div>

          <div>
            <div className="border-b border-black mb-1 h-8" />
            <span className="font-bold block text-black">Motorista / Entregador</span>
            <span className="text-[9px] text-stone-500">Nome e Assinatura</span>
          </div>

          <div className="space-y-1 text-right">
            <div>
              <span className="font-bold text-black">Placa do Veículo: </span>
              <span className="border-b border-black inline-block w-24">&nbsp;</span>
            </div>
            <div>
              <span className="font-bold text-black">Hora de Saída: </span>
              <span className="border-b border-black inline-block w-20">&nbsp;</span>
            </div>
            <p className="text-[8px] text-stone-400 italic mt-2">
              Documento interno de conferência e controle de expedição — Doces Prigor.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
