'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { 
  FileText, 
  Plus, 
  Edit, 
  Trash2, 
  Loader2, 
  RefreshCw, 
  X, 
  Printer, 
  Calendar, 
  AlertTriangle,
  Package
} from 'lucide-react';
import { responseErrorMessage } from '@/lib/errors';

type StatusPedido = 'novo' | 'confirmado' | 'em_producao' | 'entregue' | 'faturado' | 'cancelado';

/** Item de pedido devolvido pela API (OrderItemDTO). */
interface PedidoItem {
  id?: string;
  productId: string;
  productName?: string | null;
  quantity: number;
  unitPrice: number;
  discountItem: number;
  subtotal: number;
}

/** Pedido devolvido por `GET /api/orders` (OrderDTO). */
interface Pedido {
  id: string;
  numero: number;
  customerId: string;
  customerName?: string | null;
  sellerId?: string | null;
  sellerName?: string | null;
  status: StatusPedido;
  paymentMethod?: string;
  orderDate: string;
  deliveryDate?: string | null;
  billingDate?: string | null;
  dueDate?: string | null;
  subtotal: number;
  discount: number;
  shipping: number;
  otherCosts: number;
  total: number;
  notes?: string | null;
  items: PedidoItem[];
}

/** Cliente devolvido por `GET /api/customers` (recorte de CustomerDTO). */
interface Cliente {
  id: string;
  tradeName: string;
  isReseller: boolean;
}

/** Produto de venda devolvido por `GET /api/products` (recorte de ProductDTO). */
interface Produto {
  id: string;
  name: string;
  salePrice: number;
  wholesalePrice: number;
  minWholesaleQty: number;
  commissionPct: number | null;
}

/** Vendedor devolvido por `GET /api/sellers` (`comissao_pct` chega como Decimal serializado). */
interface Vendedor {
  id: string;
  name: string;
  commissionPct: number | string;
}

/** Envelope de paginação usado por todas as listagens da API. */
interface Paginated<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}



/**
 * Formata uma data civil (AAAA-MM-DD) como dd/mm/aaaa.
 * `new Date('2026-01-05')` seria interpretada como meia-noite UTC e voltaria
 * um dia atrás no fuso do Brasil, então a conversão é feita na mão.
 */
function formatarData(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [ano, mes, dia] = iso.slice(0, 10).split('-');
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : '—';
}

export default function OrdersPage() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Filtros
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Estado do Modal (Formulário)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [selectedPedido, setSelectedPedido] = useState<Pedido | null>(null);

  // Campos do Formulário
  const [clienteId, setClienteId] = useState('');
  const [vendedorId, setVendedorId] = useState('');
  const [status, setStatus] = useState<StatusPedido>('novo');
  const [formaPagamento, setFormaPagamento] = useState('pix');
  const [dataPedido, setDataPedido] = useState(new Date().toISOString().split('T')[0]);
  const [dataEntrega, setDataEntrega] = useState('');
  const [dataFaturamento, setDataFaturamento] = useState('');
  const [dataVencimento, setDataVencimento] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [descontoGeral, setDescontoGeral] = useState('0');
  const [frete, setFrete] = useState('0');
  const [outrosCustos, setOutrosCustos] = useState('0');
  
  // Itens do Pedido Temporários
  const [itensTemp, setItensTemp] = useState<PedidoItem[]>([]);
  const [selectedProdId, setSelectedProdId] = useState('');
  const [itemQty, setItemQty] = useState('1');
  const [itemDesc, setItemDesc] = useState('0');

  const fetchBaseData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Listagens paginadas: pedidos aceitam no máximo 200 por página,
      // produtos e clientes até 500.
      const [resPeds, resClis, resProds, resSells] = await Promise.all([
        fetch('/api/orders?pageSize=200'),
        fetch('/api/customers?pageSize=500'),
        fetch('/api/products?type=venda&pageSize=500'),
        fetch('/api/sellers')
      ]);

      if (!resPeds.ok || !resClis.ok || !resProds.ok || !resSells.ok) {
        const naoOk = [resPeds, resClis, resProds, resSells].find((r) => !r.ok)!;
        throw new Error(await responseErrorMessage(naoOk, 'Erro ao carregar os dados.'));
      }

      const [peds, clis, prods, sells] = await Promise.all([
        resPeds.json() as Promise<Paginated<Pedido>>,
        resClis.json() as Promise<Paginated<Cliente>>,
        resProds.json() as Promise<Paginated<Produto>>,
        resSells.json() as Promise<{ data: Vendedor[] }>
      ]);

      setPedidos(peds.data);
      setClientes(clis.data);
      setProdutos(prods.data);
      setVendedores(sells.data ?? []);

      if (prods.data.length > 0) {
        setSelectedProdId(prods.data[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar os dados.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // A carga roda fora do corpo síncrono do efeito para não encadear renders.
    void (async () => {
      await fetchBaseData();
    })();
  }, [fetchBaseData]);

  const handleOpenCreateModal = () => {
    setModalMode('create');
    setSelectedPedido(null);
    setClienteId(clientes[0]?.id || '');
    setVendedorId('');
    setStatus('novo');
    setFormaPagamento('pix');
    setDataPedido(new Date().toISOString().split('T')[0]);
    setDataEntrega('');
    setDataFaturamento('');
    setDataVencimento('');
    setObservacoes('');
    setDescontoGeral('0');
    setFrete('0');
    setOutrosCustos('0');
    setItensTemp([]);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = async (pedido: Pedido) => {
    setModalMode('edit');
    setSelectedPedido(pedido);
    
    // Busca detalhes do pedido completo
    try {
      const res = await fetch(`/api/orders/${pedido.id}`);
      if (res.ok) {
        const fullPed: Pedido = await res.json();
        setClienteId(fullPed.customerId);
        setVendedorId(fullPed.sellerId || '');
        setStatus(fullPed.status);
        setFormaPagamento(fullPed.paymentMethod || 'pix');
        setDataPedido(fullPed.orderDate);
        setDataEntrega(fullPed.deliveryDate || '');
        setDataFaturamento(fullPed.billingDate || '');
        setDataVencimento(fullPed.dueDate || '');
        setObservacoes(fullPed.notes || '');
        setDescontoGeral(String(fullPed.discount));
        setFrete(String(fullPed.shipping));
        setOutrosCustos(String(fullPed.otherCosts));
        setItensTemp(fullPed.items || []);
      }
    } catch {
      // Fallback: usa o que já veio na listagem
      setClienteId(pedido.customerId);
      setVendedorId(pedido.sellerId || '');
      setStatus(pedido.status);
      setFormaPagamento(pedido.paymentMethod || 'pix');
      setDataPedido(pedido.orderDate);
      setDataEntrega(pedido.deliveryDate || '');
      setItensTemp(pedido.items || []);
    }

    setIsModalOpen(true);
  };

  // Funções de Cálculo do Pedido (Varejo vs Atacado e Totais)
  const obterPrecoUnitario = (prod: Produto, qty: number, isRev: boolean) => {
    if (!prod) return 0;
    if (isRev && prod.wholesalePrice > 0) return prod.wholesalePrice;
    if (prod.minWholesaleQty > 0 && qty >= prod.minWholesaleQty && prod.wholesalePrice > 0) {
      return prod.wholesalePrice;
    }
    return prod.salePrice;
  };

  const handleAddItem = () => {
    if (!selectedProdId || parseFloat(itemQty) <= 0) return;
    const prod = produtos.find(p => p.id === selectedProdId);
    if (!prod) return;

    // Verifica se o cliente selecionado é revendedor
    const client = clientes.find(c => c.id === clienteId);
    const isRev = client ? !!client.isReseller : false;

    const qty = parseFloat(itemQty);
    const pu = obterPrecoUnitario(prod, qty, isRev);
    const desc = parseFloat(itemDesc) || 0;
    const sub = Math.max(0, qty * pu - desc);

    const novoItem: PedidoItem = {
      productId: prod.id,
      productName: prod.name,
      quantity: qty,
      unitPrice: pu,
      discountItem: desc,
      subtotal: sub
    };

    setItensTemp([...itensTemp, novoItem]);
    setItemQty('1');
    setItemDesc('0');
  };

  const handleRemoveItem = (idx: number) => {
    setItensTemp(itensTemp.filter((_, i) => i !== idx));
  };

  // Recalculo Geral
  const subtotal = itensTemp.reduce((sum, item) => sum + item.subtotal, 0);
  const discountTotal = parseFloat(descontoGeral) || 0;
  const shippingTotal = parseFloat(frete) || 0;
  const othersTotal = parseFloat(outrosCustos) || 0;
  const totalGeral = Math.max(0, subtotal - discountTotal + shippingTotal + othersTotal);

  // Calcula comissão estimada
  const activeSeller = vendedores.find(v => v.id === vendedorId);
  const sellerPct = activeSeller ? Number(activeSeller.commissionPct) || 0 : 0;

  const totalComissao = itensTemp.reduce((sum, item) => {
    // A comissão específica do produto vem em `commissionPct`; antes a tela lia
    // `comissao_pct`, um campo que a API nunca devolveu, e a comissão do
    // produto nunca era aplicada.
    const prod = produtos.find(p => p.id === item.productId);
    const itemPct = (prod && prod.commissionPct != null) ? prod.commissionPct : sellerPct;
    return sum + (item.subtotal * (itemPct / 100));
  }, 0);

  const comissaoFinal = subtotal > 0 ? Math.max(0, totalComissao * (totalGeral / subtotal)) : 0;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clienteId || itensTemp.length === 0) return;

    const payload = {
      customerId: clienteId,
      sellerId: vendedorId || null,
      status,
      paymentMethod: formaPagamento,
      orderDate: dataPedido,
      deliveryDate: dataEntrega || null,
      billingDate: dataFaturamento || null,
      dueDate: dataVencimento || null,
      discount: discountTotal,
      shipping: shippingTotal,
      otherCosts: othersTotal,
      notes: observacoes || null,
      items: itensTemp.map(i => ({
        productId: i.productId,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        discountItem: i.discountItem
      }))
    };

    try {
      const url = modalMode === 'create' ? '/api/orders' : `/api/orders/${selectedPedido?.id}`;
      // A atualização de pedido é parcial e usa PATCH.
      const method = modalMode === 'create' ? 'POST' : 'PATCH';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error(await responseErrorMessage(res, 'Erro ao processar pedido.'));

      setIsModalOpen(false);
      fetchBaseData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao processar pedido.');
    }
  };

  const handleDelete = async (id: string, num: number) => {
    if (!confirm(`Tem certeza que deseja cancelar o pedido #${num}?`)) return;
    try {
      const res = await fetch(`/api/orders/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await responseErrorMessage(res, 'Erro ao cancelar pedido.'));
      fetchBaseData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao cancelar pedido.');
    }
  };

  const handleDownloadPdf = async (id: string) => {
    try {
      const res = await fetch(`/api/orders/${id}/pdf`);
      if (!res.ok) throw new Error(await responseErrorMessage(res, 'Erro ao gerar PDF do pedido.'));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao gerar PDF do pedido.');
    }
  };

  // Filtros aplicados localmente
  const filteredPedidos = pedidos.filter(p => {
    const matchesStatus = !statusFilter || p.status === statusFilter;
    const date = p.orderDate.slice(0, 10);
    const matchesFrom = !dateFrom || date >= dateFrom;
    const matchesTo = !dateTo || date <= dateTo;
    return matchesStatus && matchesFrom && matchesTo;
  });

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-stone-900 tracking-tight flex items-center gap-2">
            <FileText className="h-6 w-6 text-amber-700" />
            Pedidos e Vendas
          </h2>
          <p className="text-xs text-stone-500 font-medium">Controle de faturamento, faturamento futuro e rotas de comissão</p>
        </div>
        <button 
          onClick={handleOpenCreateModal}
          className="rounded-lg bg-amber-700 px-4 py-2 text-white font-bold text-xs hover:bg-amber-800 transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
        >
          <Plus className="h-4 w-4" />
          Novo Pedido
        </button>
      </div>

      {/* Barra de Filtros */}
      <div className="rounded-xl bg-white p-4 shadow-sm border border-stone-200 grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
        <div>
          <label className="text-[10px] text-stone-400 font-bold uppercase tracking-wider block mb-1">Filtrar por Status</label>
          <select 
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full rounded-lg border border-stone-200 text-xs px-3 py-2 bg-stone-50/50 focus:outline-none"
          >
            <option value="">Todos Status</option>
            <option value="novo">Novo</option>
            <option value="confirmado">Confirmado</option>
            <option value="em_producao">Em Produção</option>
            <option value="entregue">Entregue</option>
            <option value="faturado">Faturado</option>
            <option value="cancelado">Cancelado</option>
          </select>
        </div>

        <div>
          <label className="text-[10px] text-stone-400 font-bold uppercase tracking-wider block mb-1">A partir de</label>
          <div className="relative">
            <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-stone-400" />
            <input 
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 rounded-lg border border-stone-200 text-xs focus:outline-none bg-stone-50/50"
            />
          </div>
        </div>

        <div>
          <label className="text-[10px] text-stone-400 font-bold uppercase tracking-wider block mb-1">Até data</label>
          <div className="relative">
            <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-stone-400" />
            <input 
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 rounded-lg border border-stone-200 text-xs focus:outline-none bg-stone-50/50"
            />
          </div>
        </div>

        <div className="flex gap-2">
          <button 
            onClick={fetchBaseData}
            className="flex-1 rounded-lg border border-stone-200 hover:bg-stone-100 transition-all font-bold text-xs py-2 text-stone-500 cursor-pointer flex items-center justify-center gap-1.5"
          >
            <RefreshCw className="h-4 w-4" />
            Recarregar
          </button>
        </div>
      </div>

      {/* Tabela de Pedidos */}
      {loading ? (
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2">
          <Loader2 className="h-8 w-8 animate-spin text-amber-700" />
          <p className="text-sm text-stone-500 font-medium">Buscando histórico de faturamento...</p>
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-800 max-w-xl mx-auto mt-4">
          <h3 className="font-bold text-base flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Erro na Conexão
          </h3>
          <p className="mt-2 text-sm">{error}</p>
          <button onClick={fetchBaseData} className="mt-4 rounded-lg bg-red-750 px-4 py-2 text-white font-semibold text-xs hover:bg-red-800 transition-all cursor-pointer">
            Tentar novamente
          </button>
        </div>
      ) : filteredPedidos.length === 0 ? (
        <div className="text-center py-12 rounded-xl bg-white border border-stone-200 shadow-sm">
          <FileText className="h-12 w-12 text-stone-300 mx-auto mb-3" />
          <p className="text-stone-500 text-sm font-semibold">Nenhum pedido encontrado</p>
          <p className="text-stone-400 text-xs mt-1">Clique em &quot;Novo Pedido&quot; para realizar uma venda.</p>
        </div>
      ) : (
        <div className="rounded-2xl bg-white shadow-sm border border-stone-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50 text-stone-400 font-bold uppercase tracking-wider">
                  <th className="py-3 px-6">Nº Pedido</th>
                  <th className="py-3 px-6">Cliente</th>
                  <th className="py-3 px-6">Vendedor</th>
                  <th className="py-3 px-6">Data Pedido</th>
                  <th className="py-3 px-6">Previsão Entrega</th>
                  <th className="py-3 px-6 text-right">Valor Total</th>
                  <th className="py-3 px-6 text-center">Status</th>
                  <th className="py-3 px-6 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 font-semibold text-stone-700">
                {filteredPedidos.map((ped) => (
                  <tr key={ped.id} className="hover:bg-stone-50/50">
                    <td className="py-4 px-6 font-bold text-amber-900">#{ped.numero}</td>
                    <td className="py-4 px-6 text-stone-850 font-bold text-sm">{ped.customerName}</td>
                    <td className="py-4 px-6 text-stone-500">{ped.sellerName || '—'}</td>
                    <td className="py-4 px-6 text-stone-400">{formatarData(ped.orderDate)}</td>
                    <td className="py-4 px-6 text-stone-400">
                      {formatarData(ped.deliveryDate)}
                    </td>
                    <td className="py-4 px-6 text-right font-black text-stone-850">
                      {ped.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </td>
                    <td className="py-4 px-6 text-center">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                        ped.status === 'faturado' ? 'bg-emerald-50 text-emerald-700' :
                        ped.status === 'entregue' ? 'bg-sky-50 text-sky-700' :
                        ped.status === 'em_producao' ? 'bg-amber-50 text-amber-700' :
                        ped.status === 'confirmado' ? 'bg-purple-50 text-purple-700' :
                        ped.status === 'cancelado' ? 'bg-red-50 text-red-700' : 'bg-stone-100 text-stone-600'
                      }`}>
                        {ped.status}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button 
                          onClick={() => handleOpenEditModal(ped)}
                          className="p-1.5 border border-stone-200 rounded-lg hover:bg-stone-50 text-stone-500 transition-all cursor-pointer"
                          title="Visualizar/Editar"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button 
                          onClick={() => handleDownloadPdf(ped.id)}
                          className="p-1.5 border border-stone-200 rounded-lg hover:bg-amber-55 text-amber-750 transition-all cursor-pointer"
                          title="Baixar PDF"
                        >
                          <Printer className="h-4 w-4" />
                        </button>
                        {ped.status !== 'cancelado' && (
                          <button 
                            onClick={() => handleDelete(ped.id, ped.numero)}
                            className="p-1.5 border border-stone-200 rounded-lg hover:bg-red-50 text-red-700 transition-all cursor-pointer"
                            title="Cancelar Pedido"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Novo / Editar Pedido */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-stone-200 shadow-xl w-full max-w-3xl overflow-hidden my-8 animate-scaleIn">
            <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100">
              <h3 className="font-extrabold text-stone-900 text-base">
                {modalMode === 'create' ? 'Lançar Novo Pedido de Venda' : `Pedido #${selectedPedido?.numero}`}
              </h3>
              <button 
                onClick={() => setIsModalOpen(false)} 
                className="p-1 hover:bg-stone-50 rounded-lg text-stone-400 hover:text-stone-600 transition-all cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <form onSubmit={handleSave} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              {/* Form Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-[10px] text-stone-400 font-bold uppercase tracking-wider block mb-1">Cliente *</label>
                  <select 
                    value={clienteId}
                    onChange={(e) => setClienteId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-stone-200 text-xs bg-stone-50/50 focus:ring-1 focus:ring-amber-500"
                  >
                    {clientes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.tradeName} {c.isReseller ? '(Revendedor Atacado)' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] text-stone-400 font-bold uppercase tracking-wider block mb-1">Vendedor</label>
                  <select 
                    value={vendedorId}
                    onChange={(e) => setVendedorId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-stone-200 text-xs bg-stone-50/50 focus:ring-1 focus:ring-amber-500"
                  >
                    <option value="">Sem Vendedor (Venda Direta)</option>
                    {vendedores.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name} ({Number(v.commissionPct) || 0}%)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] text-stone-400 font-bold uppercase tracking-wider block mb-1">Status da Produção</label>
                  <select 
                    value={status}
                    onChange={(e) => setStatus(e.target.value as StatusPedido)}
                    className="w-full px-3 py-2 rounded-lg border border-stone-200 text-xs bg-stone-50/50 focus:ring-1 focus:ring-amber-500"
                  >
                    <option value="novo">Novo</option>
                    <option value="confirmado">Confirmado</option>
                    <option value="em_producao">Em Produção</option>
                    <option value="entregue">Entregue</option>
                    <option value="faturado">Faturado</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] text-stone-400 font-bold uppercase tracking-wider block mb-1">Forma Pagamento</label>
                  <select 
                    value={formaPagamento}
                    onChange={(e) => setFormaPagamento(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-stone-200 text-xs bg-stone-50/50 focus:ring-1 focus:ring-amber-500"
                  >
                    <option value="pix">Pix</option>
                    <option value="dinheiro">Dinheiro</option>
                    <option value="boleto">Boleto Bancário</option>
                    <option value="credito">Cartão de Crédito</option>
                    <option value="debito">Cartão de Débito</option>
                    <option value="transferencia">Transferência/TED</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] text-stone-400 font-bold uppercase tracking-wider block mb-1">Data Emissão *</label>
                  <input 
                    type="date"
                    required
                    value={dataPedido}
                    onChange={(e) => setDataPedido(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg border border-stone-200 text-xs bg-stone-50/50 focus:ring-1 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-stone-400 font-bold uppercase tracking-wider block mb-1">Previsão Entrega</label>
                  <input 
                    type="date"
                    value={dataEntrega}
                    onChange={(e) => setDataEntrega(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg border border-stone-200 text-xs bg-stone-50/50 focus:ring-1 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-stone-400 font-bold uppercase tracking-wider block mb-1">Data Vencimento (A Receber)</label>
                  <input 
                    type="date"
                    value={dataVencimento}
                    onChange={(e) => setDataVencimento(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg border border-stone-200 text-xs bg-stone-50/50 focus:ring-1 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-stone-400 font-bold uppercase tracking-wider block mb-1">Data Faturamento</label>
                  <input 
                    type="date"
                    value={dataFaturamento}
                    onChange={(e) => setDataFaturamento(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg border border-stone-200 text-xs bg-stone-50/50 focus:ring-1 focus:ring-amber-500"
                  />
                </div>

                <div className="md:col-span-3">
                  <label className="text-[10px] text-stone-400 font-bold uppercase tracking-wider block mb-1">Observações do Pedido</label>
                  <textarea 
                    value={observacoes}
                    onChange={(e) => setObservacoes(e.target.value)}
                    placeholder="Ex: Entrega prioritária, cliente prefere doces de leite bem cremosos..."
                    className="w-full px-3 py-2 rounded-lg border border-stone-200 text-xs bg-stone-50/50 focus:ring-1 focus:ring-amber-500 h-16"
                  />
                </div>
              </div>

              {/* Grid de Adicionar Itens */}
              <div className="rounded-xl border border-stone-200 p-4 space-y-3 bg-stone-50/30">
                <h4 className="text-xs font-black text-stone-850 uppercase tracking-wider flex items-center gap-1.5">
                  <Package className="h-4 w-4 text-amber-700" />
                  Itens do Pedido
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                  <div className="md:col-span-2">
                    <label className="text-[9px] text-stone-400 font-bold uppercase block mb-1">Escolher Produto</label>
                    <select 
                      value={selectedProdId}
                      onChange={(e) => setSelectedProdId(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-stone-200 text-xs bg-white focus:outline-none"
                    >
                      {produtos.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} - Varejo: {p.salePrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          {p.wholesalePrice ? ` (Atacado: ${p.wholesalePrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[9px] text-stone-400 font-bold uppercase block mb-1">Quantidade</label>
                    <input 
                      type="number"
                      step="1"
                      min="1"
                      value={itemQty}
                      onChange={(e) => setItemQty(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-stone-200 text-xs bg-white focus:outline-none"
                    />
                  </div>

                  <button 
                    type="button"
                    onClick={handleAddItem}
                    className="rounded-lg bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs py-2 px-3 text-center cursor-pointer transition-all h-9 flex items-center justify-center shrink-0"
                  >
                    Inserir Item
                  </button>
                </div>

                {/* Tabela de Itens Temporários */}
                <div className="border border-stone-200 bg-white rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                  {itensTemp.length === 0 ? (
                    <div className="text-center py-8 text-stone-400 text-xs font-semibold">
                      Adicione pelo menos um item para faturar.
                    </div>
                  ) : (
                    <table className="w-full text-left text-[11px]">
                      <thead className="bg-stone-50 text-stone-400 font-bold uppercase border-b border-stone-150">
                        <tr>
                          <th className="py-2 px-4">Produto</th>
                          <th className="py-2 px-4 text-center">Qtd</th>
                          <th className="py-2 px-4 text-right">Preço Unit.</th>
                          <th className="py-2 px-4 text-right">Desconto (Item)</th>
                          <th className="py-2 px-4 text-right">Subtotal</th>
                          <th className="py-2 px-4 text-center">Ação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100 font-semibold text-stone-600">
                        {itensTemp.map((it, idx) => (
                          <tr key={idx} className="hover:bg-stone-50/50">
                            <td className="py-2.5 px-4 text-stone-850 font-bold">{it.productName || produtos.find(p => p.id === it.productId)?.name}</td>
                            <td className="py-2.5 px-4 text-center font-bold text-stone-800">{it.quantity}</td>
                            <td className="py-2.5 px-4 text-right">{it.unitPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                            <td className="py-2.5 px-4 text-right text-red-650">-{it.discountItem.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                            <td className="py-2.5 px-4 text-right font-black text-stone-850">{it.subtotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                            <td className="py-2.5 px-4 text-center">
                              <button 
                                type="button"
                                onClick={() => handleRemoveItem(idx)}
                                className="text-red-600 hover:text-red-800 font-bold cursor-pointer"
                              >
                                Excluir
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              {/* Caixa de Totais do Pedido */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-stone-50 p-4 rounded-xl border border-stone-200">
                <div className="space-y-3">
                  <div>
                    <label className="text-[10px] text-stone-400 font-bold uppercase tracking-wider block mb-1">Desconto Geral (R$)</label>
                    <input 
                      type="number"
                      step="0.01"
                      min="0"
                      value={descontoGeral}
                      onChange={(e) => setDescontoGeral(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-lg border border-stone-200 text-xs bg-white focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-stone-400 font-bold uppercase tracking-wider block mb-1">Frete (R$)</label>
                    <input 
                      type="number"
                      step="0.01"
                      min="0"
                      value={frete}
                      onChange={(e) => setFrete(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-lg border border-stone-200 text-xs bg-white focus:outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="text-[10px] text-stone-400 font-bold uppercase tracking-wider block mb-1">Outros Custos (R$)</label>
                    <input 
                      type="number"
                      step="0.01"
                      min="0"
                      value={outrosCustos}
                      onChange={(e) => setOutrosCustos(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-lg border border-stone-200 text-xs bg-white focus:outline-none"
                    />
                  </div>
                  
                  <div className="border border-stone-250 bg-white rounded-lg p-2.5 flex items-center justify-between">
                    <span className="text-[9px] text-stone-450 font-bold uppercase">Comissão Estimada</span>
                    <span className="text-xs font-black text-amber-900">
                      {comissaoFinal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </span>
                  </div>
                </div>

                <div className="bg-amber-700/5 text-amber-950 p-4 rounded-xl border border-amber-800/10 flex flex-col justify-between">
                  <div className="flex justify-between items-center text-xs font-bold border-b border-amber-800/10 pb-2">
                    <span>Subtotal Itens:</span>
                    <span>{subtotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                  </div>
                  <div className="flex justify-between items-center pt-2">
                    <span className="text-xs font-extrabold uppercase tracking-wide text-amber-850">Total Geral:</span>
                    <span className="text-lg font-black text-amber-950">
                      {totalGeral.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </span>
                  </div>
                </div>
              </div>

              {/* Botões do Modal */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-stone-100">
                <button 
                  type="button" 
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-lg border border-stone-200 hover:bg-stone-50 px-4 py-2 text-stone-600 font-bold text-xs cursor-pointer transition-all"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="rounded-lg bg-amber-700 hover:bg-amber-800 px-4 py-2 text-white font-bold text-xs cursor-pointer transition-all shadow-xs"
                >
                  {modalMode === 'create' ? 'Lançar Venda' : 'Salvar Alterações'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
