'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
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
  Package,
  CheckCircle2,
  Truck,
  DollarSign,
  MessageCircle,
  Copy,
  History,
  Search,
  UserPlus
} from 'lucide-react';
import { responseErrorMessage } from '@/lib/errors';
import { useToast } from '@/components/shared/Toast';

import type {
  CustomerDTO,
  OrderDTO,
  OrderItemDTO,
  Paginated,
  ProductDTO,
  SellerDTO,
} from '@/lib/api-types';

/** Status que o formulário de pedido sabe editar. */
const STATUS_PEDIDO = [
  'novo',
  'confirmado',
  'em_producao',
  'entregue',
  'faturado',
  'cancelado',
] as const;

type StatusPedido = (typeof STATUS_PEDIDO)[number];

const STATUS_LABELS: Record<string, string> = {
  novo: 'Novo',
  confirmado: 'Confirmado',
  em_producao: 'Em Produção',
  entregue: 'Entregue',
  faturado: 'Faturado',
  cancelado: 'Cancelado',
  pago: 'Pago',
  pendente: 'Em aberto',
};

interface OrderEvent {
  id: string;
  action: string;
  from: string | null;
  to: string | null;
  userName: string | null;
  createdAt: string;
}

function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

function statusLabel(v: string | null): string {
  if (!v) return '—';
  return STATUS_LABELS[v] ?? v;
}

function describeEvent(ev: OrderEvent): string {
  switch (ev.action) {
    case 'criado':
      return `Pedido criado (${statusLabel(ev.to)})`;
    case 'status':
      return `Status: ${statusLabel(ev.from)} → ${statusLabel(ev.to)}`;
    case 'pagamento':
      return 'Pagamento recebido (baixa no financeiro)';
    case 'estorno_pagamento':
      return 'Baixa de pagamento estornada';
    case 'cancelado':
      return 'Pedido cancelado';
    default:
      return ev.action;
  }
}

/**
 * O `OrderDTO` tipa `status` como `string`, mas o `select` do formulário só
 * trabalha com os status conhecidos. Um valor fora da lista cai em 'novo' em
 * vez de deixar o campo num estado que o formulário não sabe representar.
 */
function paraStatusPedido(valor: string): StatusPedido {
  return (STATUS_PEDIDO as readonly string[]).includes(valor) ? (valor as StatusPedido) : 'novo';
}

/**
 * Item do pedido enquanto está sendo montado na tela.
 *
 * É o `OrderItemDTO` com uma diferença: o item que o usuário acabou de
 * adicionar ainda não foi gravado, então não tem `id`.
 */
type PedidoItem = Omit<OrderItemDTO, 'id'> & { id?: string };

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
  const { toast, confirm } = useToast();
  const [pedidos, setPedidos] = useState<OrderDTO[]>([]);
  const [clientes, setClientes] = useState<CustomerDTO[]>([]);
  const [produtos, setProdutos] = useState<ProductDTO[]>([]);
  const [vendedores, setVendedores] = useState<SellerDTO[]>([]);
  const [formasPagamento, setFormasPagamento] = useState<{ id: string; name: string; netDays: number | null }[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Filtros
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Estado do Modal (Formulário)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [selectedPedido, setSelectedPedido] = useState<OrderDTO | null>(null);
  const [historyOrder, setHistoryOrder] = useState<OrderDTO | null>(null);
  const [historyEvents, setHistoryEvents] = useState<OrderEvent[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Campos do Formulário
  const [clienteId, setClienteId] = useState('');
  const [clienteBusca, setClienteBusca] = useState('');
  const [clienteListaAberta, setClienteListaAberta] = useState(false);
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
  const [comissaoPct, setComissaoPct] = useState('');
  const [enderecoEntregaId, setEnderecoEntregaId] = useState('');
  const [enderecosCliente, setEnderecosCliente] = useState<{ id: string; label: string | null; address: string | null; neighborhood: string | null; city: string | null }[]>([]);
  const [novoEndAberto, setNovoEndAberto] = useState(false);
  const [neLabel, setNeLabel] = useState('');
  const [neAddress, setNeAddress] = useState('');
  const [neNumber, setNeNumber] = useState('');
  const [neNeighborhood, setNeNeighborhood] = useState('');
  const [neCity, setNeCity] = useState('Rio de Janeiro');
  const [neState, setNeState] = useState('RJ');
  const [neZip, setNeZip] = useState('');
  const [neSaving, setNeSaving] = useState(false);
  const [credito, setCredito] = useState<{ creditLimit: number; openBalance: number; available: number; exceeded: boolean; hasLimit: boolean } | null>(null);
  
  // Itens do Pedido Temporários
  const [itensTemp, setItensTemp] = useState<PedidoItem[]>([]);
  const [selectedProdId, setSelectedProdId] = useState('');
  const [itemQty, setItemQty] = useState('1');
  const [itemDesc, setItemDesc] = useState('0');
  const [itemPreco, setItemPreco] = useState('');
  const [produtoBusca, setProdutoBusca] = useState('');
  const [produtoListaAberta, setProdutoListaAberta] = useState(false);
  const [highlightedProdIndex, setHighlightedProdIndex] = useState(0);
  const qtyInputRef = useRef<HTMLInputElement>(null);
  // Cadastro rápido de cliente por CNPJ (igual portal do vendedor)
  const [quickOpen, setQuickOpen] = useState(false);
  const [qcCnpj, setQcCnpj] = useState('');
  const [qcName, setQcName] = useState('');
  const [qcPhone, setQcPhone] = useState('');
  const [qcAddress, setQcAddress] = useState('');
  const [qcNumber, setQcNumber] = useState('');
  const [qcNeighborhood, setQcNeighborhood] = useState('');
  const [qcCep, setQcCep] = useState('');
  const [qcIsRev, setQcIsRev] = useState(true);
  const [qcSaving, setQcSaving] = useState(false);
  const [cnpjLoading, setCnpjLoading] = useState(false);

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
        resPeds.json() as Promise<Paginated<OrderDTO>>,
        resClis.json() as Promise<Paginated<CustomerDTO>>,
        resProds.json() as Promise<Paginated<ProductDTO>>,
        // `GET /api/sellers` devolve `{ data }`: esta listagem não é paginada.
        resSells.json() as Promise<{ data: SellerDTO[] }>
      ]);

      setPedidos(peds.data);
      setClientes(clis.data);
      setProdutos(prods.data);
      setVendedores(sells.data ?? []);

      try {
        const resPg = await fetch('/api/payment-methods');
        if (resPg.ok) {
          const pg = (await resPg.json()) as { data?: { id: string; name: string; netDays: number | null }[] };
          setFormasPagamento(pg.data ?? []);
        }
      } catch {
        /* lista de formas é acessório; não bloqueia a tela */
      }

      // Produto agora é escolhido por busca digitável; não pré-seleciona.
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

  // Carrega os endereços de entrega do cliente selecionado.
  useEffect(() => {
    if (!clienteId) {
      setEnderecosCliente([]);
      setCredito(null);
      return;
    }
    let cancel = false;
    void (async () => {
      try {
        const res = await fetch(`/api/customers/${clienteId}/addresses`);
        if (res.ok) {
          const d = (await res.json()) as { data?: { id: string; label: string | null; address: string | null; neighborhood: string | null; city: string | null }[] };
          if (!cancel) setEnderecosCliente(d.data ?? []);
        }
      } catch {
        /* endereços são acessório */
      }
      try {
        const resC = await fetch(`/api/customers/${clienteId}/credit`);
        if (resC.ok) {
          const dc = (await resC.json()) as { data?: { creditLimit: number; openBalance: number; available: number; exceeded: boolean; hasLimit: boolean } };
          if (!cancel) setCredito(dc.data ?? null);
        }
      } catch {
        /* crédito é acessório */
      }
    })();
    return () => {
      cancel = true;
    };
  }, [clienteId]);

  // Vencimento automático: se a forma escolhida tem prazo (ex.: Boleto 7 dias),
  // calcula a partir da previsão de entrega (ou, na falta, da data do pedido).
  useEffect(() => {
    const opt = formasPagamento.find((f) => f.name === formaPagamento);
    if (!opt || opt.netDays == null) return;
    const base = dataEntrega || dataPedido;
    if (!base) return;
    setDataVencimento(addDaysISO(base, opt.netDays));
  }, [formaPagamento, dataEntrega, dataPedido, formasPagamento]);

  const handleOpenCreateModal = () => {
    setModalMode('create');
    setSelectedPedido(null);
    setClienteId('');
    setClienteBusca('');
    setClienteListaAberta(false);
    setVendedorId('');
    setStatus('novo');
    setFormaPagamento(formasPagamento[0]?.name ?? 'Pix');
    setDataPedido(new Date().toISOString().split('T')[0]);
    setDataEntrega('');
    setDataFaturamento('');
    setDataVencimento('');
    setObservacoes('');
    setDescontoGeral('0');
    setFrete('0');
    setOutrosCustos('0');
    setComissaoPct('');
    setEnderecoEntregaId('');
    setItensTemp([]);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = async (pedido: OrderDTO) => {
    setModalMode('edit');
    setSelectedPedido(pedido);
    
    // Busca detalhes do pedido completo
    try {
      const res = await fetch(`/api/orders/${pedido.id}`);
      if (res.ok) {
        const fullPed: OrderDTO = await res.json();
        setClienteId(fullPed.customerId);
        setClienteBusca(clientes.find((c) => c.id === fullPed.customerId)?.tradeName ?? pedido.customerName ?? '');
        setVendedorId(fullPed.sellerId || '');
        setStatus(paraStatusPedido(fullPed.status));
        setFormaPagamento(fullPed.paymentMethod || 'pix');
        setDataPedido(fullPed.orderDate ?? '');
        setDataEntrega(fullPed.deliveryDate || '');
        setDataFaturamento(fullPed.billingDate || '');
        setDataVencimento(fullPed.dueDate || '');
        setObservacoes(fullPed.notes || '');
        setDescontoGeral(String(fullPed.discount));
        setFrete(String(fullPed.shipping));
        setOutrosCustos(String(fullPed.otherCosts));
        setComissaoPct(fullPed.commissionPct != null ? String(fullPed.commissionPct) : '');
        setEnderecoEntregaId(fullPed.deliveryAddressId ?? '');
        setItensTemp(fullPed.items || []);
      }
    } catch {
      // Fallback: usa o que já veio na listagem
      setClienteId(pedido.customerId);
      setClienteBusca(pedido.customerName ?? '');
      setVendedorId(pedido.sellerId || '');
      setStatus(paraStatusPedido(pedido.status));
      setFormaPagamento(pedido.paymentMethod || 'pix');
      setDataPedido(pedido.orderDate ?? '');
      setDataEntrega(pedido.deliveryDate || '');
      setItensTemp(pedido.items || []);
    }

    setIsModalOpen(true);
  };

  // Funções de Cálculo do Pedido (Varejo vs Atacado e Totais)
  const obterPrecoUnitario = (prod: ProductDTO, qty: number, isRev: boolean) => {
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
    const pu = itemPreco.trim() !== '' ? (parseFloat(itemPreco) || 0) : obterPrecoUnitario(prod, qty, isRev);
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
    setItemPreco('');
    setSelectedProdId('');
    setProdutoBusca('');
  };

  const handleRemoveItem = (idx: number) => {
    setItensTemp(itensTemp.filter((_, i) => i !== idx));
  };

  const handleUpdateItem = (idx: number, patch: { quantity?: number; discountItem?: number }) => {
    setItensTemp((prev) =>
      prev.map((item, i) => {
        if (i !== idx) return item;
        const qty = patch.quantity !== undefined ? Math.max(0, patch.quantity) : item.quantity;
        const desc = patch.discountItem !== undefined ? Math.max(0, patch.discountItem) : item.discountItem;
        const subtotal = Math.max(0, qty * item.unitPrice - desc);
        return {
          ...item,
          quantity: qty,
          discountItem: desc,
          subtotal,
        };
      })
    );
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
  const overridePct = comissaoPct.trim() !== '' ? (Number(comissaoPct) || 0) : null;
  const effectivePct = overridePct ?? sellerPct;

  const totalComissao = itensTemp.reduce((sum, item) => {
    // A comissão específica do produto vem em `commissionPct`; antes a tela lia
    // `comissao_pct`, um campo que a API nunca devolveu, e a comissão do
    // produto nunca era aplicada.
    const prod = produtos.find(p => p.id === item.productId);
    const itemPct = (prod && prod.commissionPct != null) ? prod.commissionPct : effectivePct;
    return sum + (item.subtotal * (itemPct / 100));
  }, 0);

  const comissaoFinal = subtotal > 0 ? Math.max(0, totalComissao * (totalGeral / subtotal)) : 0;

  const clientesFiltrados = (clienteBusca.trim()
    ? clientes.filter((c) => {
        const q = clienteBusca.toLowerCase();
        const digitos = q.replace(/\D/g, '');
        return (
          c.tradeName.toLowerCase().includes(q) ||
          (c.legalName ?? '').toLowerCase().includes(q) ||
          (digitos !== '' && ((c.cnpj ?? '').includes(digitos) || (c.cpf ?? '').includes(digitos)))
        );
      })
    : clientes
  ).slice(0, 50);

  const clienteTemPedidos = clienteId
    ? pedidos.some((p) => p.customerId === clienteId && p.id !== selectedPedido?.id && p.status !== 'cancelado')
    : false;
  const primeiroPedido = Boolean(clienteId) && !clienteTemPedidos;
  const pedidosDoCliente = clienteId
    ? pedidos.filter((p) => p.customerId === clienteId && p.id !== selectedPedido?.id && p.status !== 'cancelado').length
    : 0;
  const produtosFiltrados = (produtoBusca.trim()
    ? produtos.filter((p) => p.name.toLowerCase().includes(produtoBusca.toLowerCase()) || (p.sku ?? '').toLowerCase().includes(produtoBusca.toLowerCase()))
    : produtos
  ).slice(0, 50);

  const handleQuickCNPJ = async () => {
    const clean = qcCnpj.replace(/\D/g, '');
    if (clean.length !== 14) { toast('Digite um CNPJ válido com 14 dígitos.', 'error'); return; }
    setCnpjLoading(true);
    try {
      const res = await fetch(`/api/tools/cnpj?cnpj=${clean}`);
      if (!res.ok) throw new Error('CNPJ não encontrado ou indisponível.');
      const d = (await res.json()) as { nome_fantasia?: string; razao_social?: string; ddd_telefone_1?: string; logradouro?: string; numero?: string; complemento?: string; bairro?: string; cep?: string };
      setQcName(d.nome_fantasia || d.razao_social || '');
      setQcPhone(d.ddd_telefone_1 || '');
      setQcAddress(d.logradouro || '');
      setQcNumber(d.numero || '');
      setQcNeighborhood(d.bairro || '');
      setQcCep(d.cep || '');
      toast('Dados do CNPJ preenchidos!', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao consultar CNPJ.', 'error');
    } finally {
      setCnpjLoading(false);
    }
  };

  const abrirCadastroRapido = () => {
    setQcCnpj(''); setQcName(''); setQcPhone(''); setQcAddress(''); setQcNumber(''); setQcNeighborhood(''); setQcCep(''); setQcIsRev(true);
    setQuickOpen(true);
  };

  const handleQuickCep = async (cepValue: string) => {
    setQcCep(cepValue);
    const clean = cepValue.replace(/\D/g, '');
    if (clean.length === 8) {
      try {
        const res = await fetch(`/api/tools/cep?cep=${clean}`);
        if (res.ok) {
          const d = (await res.json()) as { street?: string; neighborhood?: string };
          if (d.street) setQcAddress(d.street);
          if (d.neighborhood) setQcNeighborhood(d.neighborhood);
          toast('Endereço preenchido pelo CEP!', 'success');
        }
      } catch {
        /* ignora */
      }
    }
  };

  const handleSaveQuickClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!qcName.trim()) { toast('Informe ao menos o nome do cliente.', 'error'); return; }
    setQcSaving(true);
    const cleanDoc = qcCnpj.replace(/\D/g, '');
    const isCpf = cleanDoc.length === 11;
    const payload = {
      tradeName: qcName,
      isReseller: qcIsRev,
      phone: qcPhone || undefined,
      cnpj: (!isCpf && cleanDoc.length === 14) ? cleanDoc : undefined,
      cpf: isCpf ? cleanDoc : undefined,
      sellerId: vendedorId || undefined,
      latitude: -22.9068,
      longitude: -43.1729,
      address: qcAddress || 'Cadastrado no lançamento do pedido',
      number: qcNumber || undefined,
      neighborhood: qcNeighborhood || 'Centro',
      zipCode: qcCep.replace(/\D/g, '') || undefined,
      city: 'Rio de Janeiro',
      state: 'RJ',
      active: true,
    };
    try {
      const res = await fetch('/api/customers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error(await responseErrorMessage(res, 'Erro ao cadastrar cliente.'));
      const novo = (await res.json()) as CustomerDTO;
      setClientes((prev) => [...prev, novo]);
      setClienteId(novo.id);
      setClienteBusca(novo.tradeName);
      setClienteListaAberta(false);
      setQuickOpen(false);
      toast(`Cliente "${novo.tradeName}" cadastrado e selecionado!`, 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao cadastrar cliente.', 'error');
    } finally {
      setQcSaving(false);
    }
  };

  const enviarPedido = async (statusForcado?: StatusPedido) => {
    if (!clienteId || itensTemp.length === 0) return;

    const statusFinal = statusForcado ?? status;

    const payload = {
      customerId: clienteId,
      sellerId: vendedorId || null,
      status: statusFinal,
      paymentMethod: formaPagamento,
      orderDate: dataPedido,
      deliveryDate: dataEntrega || null,
      billingDate: dataFaturamento || null,
      dueDate: dataVencimento || null,
      discount: discountTotal,
      shipping: shippingTotal,
      otherCosts: othersTotal,
      commissionPct: comissaoPct.trim() === '' ? null : comissaoPct,
      deliveryAddressId: enderecoEntregaId || null,
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
      toast(modalMode === 'create' ? 'Pedido lançado com sucesso!' : 'Pedido atualizado!', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao processar pedido.', 'error');
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await enviarPedido();
  };

  const handleQuickStatus = async (id: string, novoStatus: StatusPedido, rotulo: string) => {
    try {
      const res = await fetch(`/api/orders/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: novoStatus }),
      });
      if (!res.ok) throw new Error(await responseErrorMessage(res, `Erro ao marcar como ${rotulo}.`));
      fetchBaseData();
      toast(`Pedido marcado como ${rotulo}.`, 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : `Erro ao marcar como ${rotulo}.`, 'error');
    }
  };

  const handleMarcarPago = async (receivableId: string) => {
    try {
      const res = await fetch(`/api/financial/transactions/${receivableId}/settle`, { method: 'POST' });
      if (!res.ok) throw new Error(await responseErrorMessage(res, 'Erro ao marcar como pago.'));
      fetchBaseData();
      toast('Pagamento registrado no financeiro.', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao marcar como pago.', 'error');
    }
  };

  const salvarNovoEndereco = async () => {
    if (!clienteId) return;
    if (!neAddress.trim() || !neNeighborhood.trim()) {
      toast('Preencha ao menos endereço e bairro.', 'error');
      return;
    }
    setNeSaving(true);
    try {
      const res = await fetch(`/api/customers/${clienteId}/addresses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: neLabel || null, address: neAddress, number: neNumber || null, neighborhood: neNeighborhood, city: neCity || null, state: neState || null, zipCode: neZip.replace(/\D/g, '') || null }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(await responseErrorMessage(res, 'Erro ao adicionar endereço.'));
      const novoId = (j?.data?.id ?? j?.id) as string | undefined;
      const lst = await fetch(`/api/customers/${clienteId}/addresses`);
      if (lst.ok) {
        const d = (await lst.json()) as { data?: typeof enderecosCliente };
        setEnderecosCliente(d.data ?? []);
      }
      if (novoId) setEnderecoEntregaId(novoId);
      setNeLabel(''); setNeAddress(''); setNeNumber(''); setNeNeighborhood(''); setNeZip('');
      setNovoEndAberto(false);
      toast('Endereço adicionado e selecionado.', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao adicionar endereço.', 'error');
    } finally {
      setNeSaving(false);
    }
  };

  const handleWhatsApp = (ped: OrderDTO) => {
    const customer = clientes.find((c) => c.id === ped.customerId);
    const phone = customer?.phone || customer?.mobile || '';
    const cleanPhone = phone.replace(/\D/g, '');
    const linhas = (ped.items ?? []).map((i) => `• ${i.quantity}x ${i.productName ?? ''}`).join('\n');
    const msg =
      `*Pedido #${ped.numero} — Doces Prigor* 🍬\n` +
      `Cliente: ${ped.customerName ?? ''}\n` +
      (linhas ? `${linhas}\n` : '') +
      `\n*Total:* ${ped.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}` +
      (ped.deliveryDate ? `\n*Previsão de Entrega:* ${formatarData(ped.deliveryDate)}` : '') +
      `\n\n_Doces Prigor agradece a preferência!_`;

    const url = cleanPhone
      ? `https://api.whatsapp.com/send?phone=55${cleanPhone}&text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  };

  const handleDuplicate = async (pedido: OrderDTO) => {
    setModalMode('create');
    setSelectedPedido(null);
    try {
      const res = await fetch(`/api/orders/${pedido.id}`);
      const fullPed: OrderDTO = res.ok ? await res.json() : pedido;
      setClienteId(fullPed.customerId);
      setClienteBusca(clientes.find((c) => c.id === fullPed.customerId)?.tradeName ?? fullPed.customerName ?? '');
      setVendedorId(fullPed.sellerId || '');
      setStatus('novo');
      setFormaPagamento(fullPed.paymentMethod || 'Pix');
      setDataPedido(new Date().toISOString().split('T')[0]);
      setDataEntrega('');
      setDataFaturamento('');
      setDataVencimento('');
      setObservacoes(fullPed.notes || '');
      setDescontoGeral(String(fullPed.discount));
      setFrete(String(fullPed.shipping));
      setOutrosCustos(String(fullPed.otherCosts));
      setComissaoPct(fullPed.commissionPct != null ? String(fullPed.commissionPct) : '');
      setEnderecoEntregaId(fullPed.deliveryAddressId ?? '');
      setItensTemp(fullPed.items || []);
    } catch {
      /* usa o que veio na listagem */
    }
    setIsModalOpen(true);
  };

  const handleOpenHistory = async (pedido: OrderDTO) => {
    setHistoryOrder(pedido);
    setHistoryEvents([]);
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/orders/${pedido.id}/history`);
      if (res.ok) {
        const d = await res.json();
        setHistoryEvents(d.data ?? []);
      }
    } catch {
      // silencioso — timeline é um extra
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleDelete = async (id: string, num: number) => {
    const okc = await confirm({
      title: 'Cancelar pedido',
      message: `Tem certeza que deseja cancelar o pedido #${num}? O estoque será estornado.`,
      confirmLabel: 'Cancelar pedido',
      cancelLabel: 'Voltar',
      danger: true,
    });
    if (!okc) return;
    try {
      const res = await fetch(`/api/orders/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await responseErrorMessage(res, 'Erro ao cancelar pedido.'));
      fetchBaseData();
      toast(`Pedido #${num} cancelado.`, 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao cancelar pedido.', 'error');
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
      toast(err instanceof Error ? err.message : 'Erro ao gerar PDF do pedido.', 'error');
    }
  };

  // Filtros aplicados localmente
  const filteredPedidos = pedidos.filter(p => {
    const matchesStatus = !statusFilter || p.status === statusFilter;
    const date = p.orderDate?.slice(0, 10) ?? '';
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
                      {ped.paymentStatus !== 'sem_conta' && (
                        <div className="mt-1">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${ped.paymentStatus === 'pago' ? 'bg-emerald-100 text-emerald-700' : ped.paymentStatus === 'atrasado' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>
                            {ped.paymentStatus === 'pago' ? 'Pago' : ped.paymentStatus === 'atrasado' ? 'Vencido' : 'A receber'}
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="py-4 px-6 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        {ped.status === 'novo' && (
                          <button
                            onClick={() => handleQuickStatus(ped.id, 'confirmado', 'confirmado')}
                            className="p-1.5 border border-emerald-200 rounded-lg hover:bg-emerald-50 text-emerald-700 transition-all cursor-pointer"
                            title="Concluir (confirmar pedido)"
                          >
                            <CheckCircle2 className="h-4 w-4" />
                          </button>
                        )}
                        {(ped.status === 'confirmado' || ped.status === 'em_producao') && (
                          <button
                            onClick={() => handleQuickStatus(ped.id, 'entregue', 'entregue')}
                            className="p-1.5 border border-sky-200 rounded-lg hover:bg-sky-50 text-sky-700 transition-all cursor-pointer"
                            title="Marcar como entregue"
                          >
                            <Truck className="h-4 w-4" />
                          </button>
                        )}
                        {(ped.paymentStatus === 'pendente' || ped.paymentStatus === 'atrasado') && ped.receivableId && (
                          <button
                            onClick={() => handleMarcarPago(ped.receivableId!)}
                            className="p-1.5 border border-emerald-200 rounded-lg hover:bg-emerald-50 text-emerald-700 transition-all cursor-pointer"
                            title="Marcar como pago (baixa no financeiro)"
                          >
                            <DollarSign className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          onClick={() => handleWhatsApp(ped)}
                          className="p-1.5 border border-stone-200 rounded-lg hover:bg-emerald-50 text-emerald-700 transition-all cursor-pointer"
                          title="Enviar por WhatsApp"
                        >
                          <MessageCircle className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDuplicate(ped)}
                          className="p-1.5 border border-stone-200 rounded-lg hover:bg-stone-50 text-stone-500 transition-all cursor-pointer"
                          title="Duplicar pedido"
                        >
                          <Copy className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleOpenHistory(ped)}
                          className="p-1.5 border border-stone-200 rounded-lg hover:bg-indigo-50 text-indigo-600 transition-all cursor-pointer"
                          title="Histórico do pedido"
                        >
                          <History className="h-4 w-4" />
                        </button>
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
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] text-stone-400 font-bold uppercase tracking-wider block">Cliente * {primeiroPedido && (<span className="ml-1 inline-block rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-black text-emerald-700 align-middle">1º PEDIDO</span>)}</label>
                    <button type="button" onClick={abrirCadastroRapido} className="text-[10px] font-bold text-amber-800 hover:underline cursor-pointer inline-flex items-center gap-1"><UserPlus className="h-3 w-3" /> Cadastrar novo</button>
                  </div>
                  <div className="relative">
                    <input
                      type="text"
                      value={clienteBusca}
                      onChange={(e) => { setClienteBusca(e.target.value); setClienteListaAberta(true); if (clienteId) setClienteId(''); }}
                      onFocus={() => setClienteListaAberta(true)}
                      onBlur={() => window.setTimeout(() => setClienteListaAberta(false), 150)}
                      placeholder="Digite o nome ou CNPJ do cliente..."
                      className="w-full px-3 py-2 rounded-lg border border-stone-200 text-xs bg-stone-50/50 focus:ring-1 focus:ring-amber-500"
                    />
                    {clienteListaAberta && (
                      <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-stone-200 bg-white shadow-lg">
                        {clientesFiltrados.length === 0 ? (
                          <div className="px-3 py-2 text-xs text-stone-400">Nenhum cliente encontrado</div>
                        ) : (
                          clientesFiltrados.map((c) => (
                            <button
                              type="button"
                              key={c.id}
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => { setClienteId(c.id); setClienteBusca(c.tradeName); setClienteListaAberta(false); }}
                              className={`block w-full text-left px-3 py-2 text-xs hover:bg-amber-50 ${c.id === clienteId ? 'bg-amber-50 font-bold' : ''}`}
                            >
                              {c.tradeName}{c.isReseller ? ' (Atacado)' : ''}
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                  {clienteId && !primeiroPedido && (
                    <p className="mt-1 text-[10px] font-bold text-stone-500">Este cliente já fez {pedidosDoCliente} pedido{pedidosDoCliente === 1 ? '' : 's'}.</p>
                  )}
                </div>

                {credito?.exceeded && (
                  <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
                    <div className="text-xs text-red-700">
                      <span className="font-black">LIMITE DE CRÉDITO EXCEDIDO.</span> Cliente com {credito.openBalance.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} em aberto (limite {credito.creditLimit.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}).
                    </div>
                  </div>
                )}
                {credito?.hasLimit && !credito.exceeded && (
                  <p className="text-[10px] text-stone-400">Crédito: {credito.openBalance.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} em aberto · disponível {credito.available.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} de {credito.creditLimit.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}.</p>
                )}

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
                    {formaPagamento && !formasPagamento.some((f) => f.name === formaPagamento) && (
                      <option value={formaPagamento}>{formaPagamento}</option>
                    )}
                    {formasPagamento.map((f) => (
                      <option key={f.id} value={f.name}>{f.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] text-stone-400 font-bold uppercase tracking-wider block">Endereço de Entrega</label>
                    {clienteId && (
                      <button type="button" onClick={() => setNovoEndAberto((v) => !v)} className="text-[10px] font-bold text-amber-800 hover:underline cursor-pointer">
                        {novoEndAberto ? 'Cancelar' : '➕ Novo endereço'}
                      </button>
                    )}
                  </div>
                  <select
                    value={enderecoEntregaId}
                    onChange={(e) => setEnderecoEntregaId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-stone-200 text-xs bg-stone-50/50 focus:ring-1 focus:ring-amber-500"
                  >
                    <option value="">Mesmo do faturamento (principal)</option>
                    {enderecosCliente.map((a) => (
                      <option key={a.id} value={a.id}>{a.label ? `${a.label} — ` : ''}{a.address ?? ''}{a.neighborhood ? `, ${a.neighborhood}` : ''}</option>
                    ))}
                  </select>
                  {novoEndAberto && (
                    <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50/40 p-3 space-y-2">
                      <input type="text" placeholder="Apelido (ex.: Filial Centro)" value={neLabel} onChange={(e) => setNeLabel(e.target.value)} className="w-full px-2.5 py-1.5 rounded-lg border border-stone-200 text-xs bg-white focus:outline-none" />
                      <div className="grid grid-cols-3 gap-2">
                        <input type="text" placeholder="Endereço *" value={neAddress} onChange={(e) => setNeAddress(e.target.value)} className="col-span-2 px-2.5 py-1.5 rounded-lg border border-stone-200 text-xs bg-white focus:outline-none" />
                        <input type="text" placeholder="Número" value={neNumber} onChange={(e) => setNeNumber(e.target.value)} className="px-2.5 py-1.5 rounded-lg border border-stone-200 text-xs bg-white focus:outline-none" />
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <input type="text" placeholder="Bairro *" value={neNeighborhood} onChange={(e) => setNeNeighborhood(e.target.value)} className="px-2.5 py-1.5 rounded-lg border border-stone-200 text-xs bg-white focus:outline-none" />
                        <input type="text" placeholder="Cidade" value={neCity} onChange={(e) => setNeCity(e.target.value)} className="px-2.5 py-1.5 rounded-lg border border-stone-200 text-xs bg-white focus:outline-none" />
                        <input type="text" placeholder="CEP" value={neZip} onChange={(e) => setNeZip(e.target.value)} className="px-2.5 py-1.5 rounded-lg border border-stone-200 text-xs bg-white focus:outline-none" />
                      </div>
                      <button type="button" onClick={salvarNovoEndereco} disabled={neSaving} className="w-full rounded-lg bg-amber-700 hover:bg-amber-800 text-white text-xs font-bold py-1.5 cursor-pointer disabled:opacity-50">{neSaving ? 'Adicionando...' : 'Adicionar endereço'}</button>
                    </div>
                  )}
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

                <div className="grid grid-cols-2 md:grid-cols-6 gap-3 items-end">
                  <div className="md:col-span-2">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[9px] text-stone-400 font-bold uppercase block">Escolher Produto</label>
                      <span className="text-[9px] text-stone-400 italic">Use as setas ↑↓ e Enter</span>
                    </div>
                    <div className="relative">
                      <input
                        type="text"
                        value={produtoBusca}
                        onChange={(e) => {
                          setProdutoBusca(e.target.value);
                          setProdutoListaAberta(true);
                          setHighlightedProdIndex(0);
                          if (selectedProdId) setSelectedProdId('');
                        }}
                        onFocus={() => {
                          setProdutoListaAberta(true);
                          setHighlightedProdIndex(0);
                        }}
                        onBlur={() => window.setTimeout(() => setProdutoListaAberta(false), 200)}
                        onKeyDown={(e) => {
                          if (!produtoListaAberta || produtosFiltrados.length === 0) return;
                          if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            setHighlightedProdIndex((prev) => Math.min(produtosFiltrados.length - 1, prev + 1));
                          } else if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            setHighlightedProdIndex((prev) => Math.max(0, prev - 1));
                          } else if (e.key === 'Enter') {
                            e.preventDefault();
                            const prod = produtosFiltrados[highlightedProdIndex];
                            if (prod) {
                              setSelectedProdId(prod.id);
                              setProdutoBusca(prod.name);
                              setProdutoListaAberta(false);
                              const cli = clientes.find((c) => c.id === clienteId);
                              setItemPreco(String(obterPrecoUnitario(prod, parseFloat(itemQty) || 1, cli ? !!cli.isReseller : false)));
                              qtyInputRef.current?.focus();
                              qtyInputRef.current?.select();
                            }
                          } else if (e.key === 'Escape') {
                            setProdutoListaAberta(false);
                          }
                        }}
                        placeholder="Digite o nome do produto..."
                        className="w-full px-3 py-2 rounded-lg border border-stone-200 text-xs bg-white focus:outline-none"
                      />
                      {produtoListaAberta && (
                        <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-stone-200 bg-white shadow-lg">
                          {produtosFiltrados.length === 0 ? (
                            <div className="px-3 py-2 text-xs text-stone-400">Nenhum produto encontrado</div>
                          ) : (
                            produtosFiltrados.map((p, idx) => (
                              <button
                                type="button"
                                key={p.id}
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => {
                                  setSelectedProdId(p.id);
                                  setProdutoBusca(p.name);
                                  setProdutoListaAberta(false);
                                  const cli = clientes.find((c) => c.id === clienteId);
                                  setItemPreco(String(obterPrecoUnitario(p, parseFloat(itemQty) || 1, cli ? !!cli.isReseller : false)));
                                  qtyInputRef.current?.focus();
                                  qtyInputRef.current?.select();
                                }}
                                className={`block w-full text-left px-3 py-2 text-xs transition-colors ${
                                  idx === highlightedProdIndex
                                    ? 'bg-amber-100 text-amber-900 font-bold border-l-4 border-amber-600'
                                    : p.id === selectedProdId
                                    ? 'bg-amber-50 font-bold'
                                    : 'hover:bg-amber-50'
                                }`}
                              >
                                {p.name} — {p.salePrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                {p.wholesalePrice ? ` · Atacado ${p.wholesalePrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}` : ''}
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="text-[9px] text-stone-400 font-bold uppercase block mb-1">Quantidade</label>
                    <input 
                      ref={qtyInputRef}
                      type="number"
                      step="1"
                      min="1"
                      value={itemQty}
                      onChange={(e) => setItemQty(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-stone-200 text-xs bg-white focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[9px] text-stone-400 font-bold uppercase block mb-1">Preço Unit. (R$)</label>
                    <input 
                      type="number"
                      step="0.01"
                      min="0"
                      value={itemPreco}
                      onChange={(e) => setItemPreco(e.target.value)}
                      placeholder="auto"
                      className="w-full px-3 py-2 rounded-lg border border-stone-200 text-xs bg-white focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[9px] text-stone-400 font-bold uppercase block mb-1">Desconto (R$)</label>
                    <input 
                      type="number"
                      step="0.01"
                      min="0"
                      value={itemDesc}
                      onChange={(e) => setItemDesc(e.target.value)}
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
                <div className="border border-stone-200 bg-white rounded-xl overflow-hidden max-h-56 overflow-y-auto">
                  {itensTemp.length === 0 ? (
                    <div className="text-center py-8 text-stone-400 text-xs font-semibold">
                      Adicione pelo menos um item para faturar.
                    </div>
                  ) : (
                    <table className="w-full text-left text-[11px]">
                      <thead className="bg-stone-50 text-stone-400 font-bold uppercase border-b border-stone-150">
                        <tr>
                          <th className="py-2 px-4">Produto</th>
                          <th className="py-2 px-3 text-center w-24">Qtd (Editar)</th>
                          <th className="py-2 px-3 text-right">Preço Unit.</th>
                          <th className="py-2 px-3 text-right w-32">Desconto (Editar)</th>
                          <th className="py-2 px-4 text-right">Subtotal</th>
                          <th className="py-2 px-4 text-center">Ação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100 font-semibold text-stone-600">
                        {itensTemp.map((it, idx) => (
                          <tr key={idx} className="hover:bg-stone-50/50">
                            <td className="py-2.5 px-4 text-stone-850 font-bold">
                              {it.productName || produtos.find(p => p.id === it.productId)?.name}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <input
                                type="number"
                                min="1"
                                step="1"
                                value={it.quantity}
                                onChange={(e) => handleUpdateItem(idx, { quantity: parseFloat(e.target.value) || 0 })}
                                className="w-16 px-1.5 py-1 text-center font-bold rounded border border-stone-200 bg-stone-50 focus:bg-white focus:border-amber-500 focus:outline-none text-xs"
                              />
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              {it.unitPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <span className="text-stone-400 text-[10px]">R$</span>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={it.discountItem}
                                  onChange={(e) => handleUpdateItem(idx, { discountItem: parseFloat(e.target.value) || 0 })}
                                  className="w-20 px-1.5 py-1 text-right rounded border border-stone-200 bg-stone-50 focus:bg-white focus:border-amber-500 focus:outline-none text-xs text-red-600 font-semibold"
                                />
                              </div>
                            </td>
                            <td className="py-2.5 px-4 text-right font-black text-stone-850">
                              {it.subtotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </td>
                            <td className="py-2.5 px-4 text-center">
                              <button 
                                type="button" 
                                onClick={() => handleRemoveItem(idx)}
                                className="text-red-600 hover:text-red-800 font-bold cursor-pointer text-xs"
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
                  
                  <div>
                    <label className="text-[10px] text-stone-400 font-bold uppercase tracking-wider block mb-1">Comissão do Vendedor (%)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      placeholder={activeSeller ? `Padrão: ${sellerPct}%` : 'Selecione um vendedor'}
                      value={comissaoPct}
                      onChange={(e) => setComissaoPct(e.target.value)}
                      disabled={!vendedorId}
                      className="w-full px-3 py-1.5 rounded-lg border border-stone-200 text-xs bg-white focus:outline-none disabled:bg-stone-100 disabled:text-stone-400"
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
                  type="button"
                  onClick={() => enviarPedido('confirmado')}
                  className="rounded-lg border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 px-4 py-2 text-emerald-800 font-bold text-xs cursor-pointer transition-all flex items-center gap-1.5"
                >
                  <CheckCircle2 className="h-4 w-4" /> Concluir
                </button>
                <button
                  type="button"
                  onClick={() => enviarPedido('entregue')}
                  className="rounded-lg border border-sky-300 bg-sky-50 hover:bg-sky-100 px-4 py-2 text-sky-800 font-bold text-xs cursor-pointer transition-all flex items-center gap-1.5"
                >
                  <Truck className="h-4 w-4" /> Entregar
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

      {historyOrder && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => setHistoryOrder(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[85vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100">
              <div className="flex items-center gap-2">
                <History className="h-5 w-5 text-indigo-600" />
                <h3 className="font-black text-stone-800">Histórico do Pedido #{historyOrder.numero}</h3>
              </div>
              <button
                onClick={() => setHistoryOrder(null)}
                className="p-1.5 rounded-lg hover:bg-stone-100 text-stone-400 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto">
              {historyLoading ? (
                <div className="flex items-center justify-center py-8 text-stone-400">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : historyEvents.length === 0 ? (
                <p className="text-stone-400 text-sm text-center py-6">
                  Nenhum evento registrado ainda. Pedidos antigos (criados antes desta atualização)
                  passam a registrar eventos a partir da próxima alteração.
                </p>
              ) : (
                <ol className="relative border-l-2 border-stone-100 ml-2 space-y-5">
                  {historyEvents.map((ev) => (
                    <li key={ev.id} className="ml-4">
                      <span className="absolute -left-[7px] mt-1 h-3 w-3 rounded-full bg-indigo-500 border-2 border-white" />
                      <p className="text-sm font-bold text-stone-800">{describeEvent(ev)}</p>
                      <p className="text-xs text-stone-400 mt-0.5">
                        {new Date(ev.createdAt).toLocaleString('pt-BR')}
                        {ev.userName ? ` · ${ev.userName}` : ''}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </div>
      )}

      {quickOpen && (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4" onClick={() => setQuickOpen(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md border border-stone-200 shadow-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
              <h3 className="font-black text-stone-900 text-sm">Cadastrar Cliente</h3>
              <button onClick={() => setQuickOpen(false)} className="p-1 text-stone-400 hover:text-stone-600 cursor-pointer"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={handleSaveQuickClient} className="p-5 space-y-3 text-xs font-semibold text-stone-600">
              <div>
                <label className="block mb-1">CNPJ ou CPF (busca automática para CNPJ)</label>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={qcCnpj} 
                    onChange={(e) => setQcCnpj(e.target.value)} 
                    placeholder="CNPJ (14 dígitos) ou CPF (11 dígitos)" 
                    className="flex-1 rounded-lg border border-stone-300 bg-stone-50 p-2.5 text-stone-900 focus:bg-white" 
                  />
                  <button type="button" onClick={handleQuickCNPJ} disabled={cnpjLoading} className="rounded-lg bg-stone-900 hover:bg-stone-850 text-white px-3 py-2 text-xs font-bold cursor-pointer disabled:opacity-50 inline-flex items-center gap-1">{cnpjLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Buscar</button>
                </div>
              </div>
              <div>
                <label className="block mb-1">Nome / Razão social *</label>
                <input type="text" value={qcName} onChange={(e) => setQcName(e.target.value)} required className="w-full rounded-lg border border-stone-300 bg-stone-50 p-2.5 text-stone-900 focus:bg-white" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="block mb-1">Telefone</label><input type="text" value={qcPhone} onChange={(e) => setQcPhone(e.target.value)} className="w-full rounded-lg border border-stone-300 bg-stone-50 p-2.5 text-stone-900 focus:bg-white" /></div>
                <div><label className="block mb-1">Perfil</label>
                  <select value={qcIsRev ? 'true' : 'false'} onChange={(e) => setQcIsRev(e.target.value === 'true')} className="w-full rounded-lg border border-stone-300 bg-stone-50 p-2.5 text-stone-900 focus:bg-white">
                    <option value="true">Revendedor (Atacado)</option><option value="false">Consumidor (Varejo)</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2"><label className="block mb-1">Endereço</label><input type="text" value={qcAddress} onChange={(e) => setQcAddress(e.target.value)} className="w-full rounded-lg border border-stone-300 bg-stone-50 p-2.5 text-stone-900 focus:bg-white" /></div>
                <div><label className="block mb-1">Número</label><input type="text" value={qcNumber} onChange={(e) => setQcNumber(e.target.value)} className="w-full rounded-lg border border-stone-300 bg-stone-50 p-2.5 text-stone-900 focus:bg-white" /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="block mb-1">Bairro</label><input type="text" value={qcNeighborhood} onChange={(e) => setQcNeighborhood(e.target.value)} className="w-full rounded-lg border border-stone-300 bg-stone-50 p-2.5 text-stone-900 focus:bg-white" /></div>
                <div><label className="block mb-1">CEP (preenche auto)</label><input type="text" value={qcCep} onChange={(e) => handleQuickCep(e.target.value)} placeholder="00000-000" className="w-full rounded-lg border border-stone-300 bg-stone-50 p-2.5 text-stone-900 focus:bg-white" /></div>
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-stone-100">
                <button type="button" onClick={() => setQuickOpen(false)} className="rounded-lg border border-stone-300 px-4 py-2 text-xs font-bold text-stone-600 hover:bg-stone-50 cursor-pointer">Cancelar</button>
                <button type="submit" disabled={qcSaving} className="rounded-lg bg-amber-700 hover:bg-amber-800 px-4 py-2 text-xs font-bold text-white cursor-pointer disabled:opacity-50">{qcSaving ? 'Salvando...' : 'Cadastrar e selecionar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
