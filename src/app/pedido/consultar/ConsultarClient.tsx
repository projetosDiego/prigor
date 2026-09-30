'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  FileText,
  Loader2,
  Package,
  Search,
  ShoppingCart,
  Truck,
  User,
} from 'lucide-react';

interface OrderSearchResult {
  id: string;
  numero: number;
  orderDate: string | null;
  deliveryDate: string | null;
  status: string;
  paymentMethod: string;
  total: number;
  hasNegotiatedPrice: boolean;
  approvedByAdmin: boolean;
  canDownloadPdf: boolean;
  lockReason: string | null;
  customerName: string;
  customerDoc: string | null;
  sellerName: string | null;
  itemsCount: number;
  itemsSummary: string;
}

const STATUS_LABELS: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  novo: {
    label: 'Recebido - Aguardando Confirmação',
    color: 'bg-amber-100 text-amber-800 border-amber-200',
    icon: <Clock className="h-3.5 w-3.5" />,
  },
  confirmado: {
    label: 'Confirmado - Em Preparação',
    color: 'bg-purple-100 text-purple-800 border-purple-200',
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
  },
  em_producao: {
    label: 'Em Produção',
    color: 'bg-orange-100 text-orange-800 border-orange-200',
    icon: <Package className="h-3.5 w-3.5" />,
  },
  entregue: {
    label: 'Entregue com Sucesso',
    color: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    icon: <Truck className="h-3.5 w-3.5" />,
  },
  faturado: {
    label: 'Faturado',
    color: 'bg-sky-100 text-sky-800 border-sky-200',
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
  },
  cancelado: {
    label: 'Cancelado',
    color: 'bg-red-100 text-red-800 border-red-200',
    icon: <AlertCircle className="h-3.5 w-3.5" />,
  },
};

export default function ConsultarClient() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [orders, setOrders] = useState<OrderSearchResult[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = query.trim();
    if (clean.length < 2) {
      setErrorMsg('Digite pelo menos 2 caracteres para pesquisar.');
      return;
    }

    setErrorMsg(null);
    setLoading(true);
    setSearched(true);

    try {
      const res = await fetch(`/api/public/orders/search?q=${encodeURIComponent(clean)}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Erro ao pesquisar pedidos.');
      }
      setOrders(data.orders || []);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao buscar pedidos.');
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'A combinar';
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
  };

  return (
    <div className="min-h-screen bg-stone-100 py-8 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Topo / Cabeçalho */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between bg-white rounded-3xl p-6 shadow-sm border border-stone-200 gap-4">
          <div className="flex items-center gap-4">
            <Image
              src="/logo.png"
              alt="Doces Prigor Logo"
              width={80}
              height={70}
              priority
              className="h-16 w-auto object-contain"
            />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-900 px-2.5 py-0.5 rounded-full">
                  Autoatendimento
                </span>
                <span className="text-xs text-stone-500">Doces Prigor</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-stone-900">
                Consultar Meus Pedidos
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/pedido"
              className="flex items-center gap-1.5 text-xs font-bold text-white bg-amber-700 hover:bg-amber-800 px-3.5 py-2 rounded-xl transition-all shadow-sm"
            >
              <ShoppingCart className="h-3.5 w-3.5" />
              Fazer Novo Pedido
            </Link>
            <Link
              href="/login"
              className="text-xs font-bold text-stone-600 hover:text-stone-900 px-3 py-2 rounded-xl transition-all"
            >
              Área da Equipe
            </Link>
          </div>
        </div>

        {/* Caixa de Busca */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-stone-200 space-y-4">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-stone-900">
              Localizar Pedido
            </h2>
            <p className="text-xs text-stone-500 mt-0.5">
              Busque pelo <strong>Nome da Empresa / Razão Social</strong>, <strong>CNPJ</strong>, <strong>CPF</strong> ou pelo <strong>Número do Pedido</strong>.
            </p>
          </div>

          <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ex: Padaria Bela Vista, 00.000.000/0000-00 ou 11048..."
                className="block w-full rounded-2xl border border-stone-300 bg-stone-50 py-3.5 pl-11 pr-4 text-sm text-stone-900 placeholder-stone-400 focus:border-amber-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20"
              />
              <Search className="absolute left-4 top-4 h-4 w-4 text-stone-400" />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="rounded-2xl bg-amber-700 hover:bg-amber-800 active:bg-amber-900 text-white font-bold px-6 py-3.5 text-sm flex items-center justify-center gap-2 shadow transition-all disabled:opacity-50 shrink-0"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Buscando...
                </>
              ) : (
                <>
                  <Search className="h-4 w-4" />
                  Consultar Pedidos
                </>
              )}
            </button>
          </form>

          {errorMsg && (
            <div className="flex items-center gap-2 rounded-2xl bg-red-50 p-3.5 text-xs text-red-700 border border-red-200">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        {/* Resultados */}
        {searched && (
          <div className="space-y-4">
            <div className="flex items-center justify-between px-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500">
                {orders.length === 0
                  ? 'Nenhum pedido localizado'
                  : `${orders.length} ${orders.length === 1 ? 'pedido encontrado' : 'pedidos encontrados'}`}
              </h3>
            </div>

            {orders.length === 0 ? (
              <div className="bg-white rounded-3xl p-10 text-center border border-stone-200 shadow-sm space-y-3">
                <div className="h-12 w-12 rounded-full bg-stone-100 flex items-center justify-center mx-auto text-stone-400">
                  <Search className="h-6 w-6" />
                </div>
                <h4 className="font-bold text-stone-800 text-base">
                  Nenhum pedido encontrado
                </h4>
                <p className="text-xs text-stone-500 max-w-sm mx-auto">
                  Não localizamos pedidos para o termo informado. Verifique se o nome ou CNPJ/CPF foram digitados corretamente.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {orders.map((ord) => {
                  const statusConfig = STATUS_LABELS[ord.status] || {
                    label: ord.status,
                    color: 'bg-stone-100 text-stone-700 border-stone-200',
                    icon: null,
                  };

                  return (
                    <div
                      key={ord.id}
                      className="bg-white rounded-3xl p-6 shadow-sm border border-stone-200 space-y-4 hover:border-amber-300 transition-all"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-100 pb-4">
                        <div>
                          <div className="flex items-center gap-3">
                            <span className="text-lg font-black text-stone-900">
                              Pedido #{ord.numero}
                            </span>
                            <span
                              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${statusConfig.color}`}
                            >
                              {statusConfig.icon}
                              {statusConfig.label}
                            </span>
                          </div>
                          <p className="text-xs text-stone-500 mt-1">
                            <strong className="text-stone-800">{ord.customerName}</strong>
                            {ord.customerDoc ? ` · Doc: ${ord.customerDoc}` : ''}
                            {ord.sellerName ? ` · Atendido por: ${ord.sellerName}` : ''}
                          </p>
                        </div>

                        <div className="text-right sm:text-right">
                          <span className="text-xs text-stone-400 block">Valor Total</span>
                          <span className="text-xl font-black text-stone-900">
                            R$ {ord.total.toFixed(2)}
                          </span>
                        </div>
                      </div>

                      {/* Detalhes do Pedido */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                        <div className="bg-stone-50 p-3 rounded-2xl border border-stone-100">
                          <span className="text-stone-400 block font-semibold mb-0.5">Data do Pedido</span>
                          <span className="font-bold text-stone-800">{formatDate(ord.orderDate)}</span>
                        </div>
                        <div className="bg-stone-50 p-3 rounded-2xl border border-stone-100">
                          <span className="text-stone-400 block font-semibold mb-0.5">Previsão de Entrega</span>
                          <span className="font-bold text-stone-800">{formatDate(ord.deliveryDate)}</span>
                        </div>
                        <div className="bg-stone-50 p-3 rounded-2xl border border-stone-100">
                          <span className="text-stone-400 block font-semibold mb-0.5">Condição de Pagamento</span>
                          <span className="font-bold text-stone-800">{ord.paymentMethod}</span>
                        </div>
                      </div>

                      {/* Resumo de itens */}
                      {ord.itemsSummary && (
                        <div className="text-xs text-stone-600 bg-stone-50/70 p-3 rounded-2xl border border-stone-100">
                          <span className="font-bold text-stone-700">Itens: </span>
                          <span>{ord.itemsSummary}</span>
                        </div>
                      )}

                      {/* Botão de Download e Liberação */}
                      <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex-1 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          {ord.approvedByAdmin ? (
                            <span className="text-xs text-emerald-700 font-semibold flex items-center gap-1.5">
                              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                              Pedido aprovado e liberado
                            </span>
                          ) : (
                            <span className="text-xs text-amber-800 font-semibold flex items-center gap-1.5">
                              <AlertCircle className="h-4 w-4 text-amber-600" />
                              Aguardando confirmação/liberação interna da gerência
                            </span>
                          )}

                          <a
                            href={`/api/public/orders/${ord.id}/pdf`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-700 hover:bg-amber-800 text-white font-bold px-4 py-2.5 text-xs shadow-sm transition-all cursor-pointer"
                          >
                            <FileText className="h-4 w-4" />
                            Baixar Espelho (PDF)
                          </a>
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
    </div>
  );
}
