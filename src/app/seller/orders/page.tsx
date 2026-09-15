'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FileText,
  Plus,
  Loader2,
  X,
  Package,
  MessageCircle,
  Search
} from 'lucide-react';
import { responseErrorMessage } from '@/lib/errors';
import { useToast } from '@/components/shared/Toast';
import type {
  CustomerDTO,
  OrderDTO,
  OrderItemDTO,
  Paginated,
  ProductDTO,
} from '@/lib/api-types';

const formatPhone = (value: string) => {
  if (!value) return value;
  const phone = value.replace(/\D/g, '');
  const len = phone.length;
  if (len <= 2) {
    return phone.length > 0 ? `(${phone}` : '';
  }
  if (len <= 6) {
    return `(${phone.substring(0, 2)}) ${phone.substring(2)}`;
  }
  if (len <= 10) {
    return `(${phone.substring(0, 2)}) ${phone.substring(2, 6)}-${phone.substring(6)}`;
  }
  return `(${phone.substring(0, 2)}) ${phone.substring(2, 7)}-${phone.substring(7, 11)}`;
};

/**
 * Item do pedido enquanto está sendo montado na tela.
 *
 * É o `OrderItemDTO` com uma diferença: o item que o vendedor acabou de
 * adicionar ainda não foi gravado, então não tem `id`.
 */
type PedidoItem = Omit<OrderItemDTO, 'id'> & { id?: string };


/** Resposta da consulta de CNPJ (BrasilAPI, via `/api/tools/cnpj`). */
interface RespostaCnpj {
  nome_fantasia?: string;
  razao_social?: string;
  ddd_telefone_1?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cep?: string;
}

/** Resposta da consulta de CEP (via `/api/tools/cep`). */
interface RespostaCep {
  street?: string;
  neighborhood?: string;
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

export default function SellerOrdersPage() {
  const { toast } = useToast();
  const [pedidos, setPedidos] = useState<OrderDTO[]>([]);
  const [clientes, setClientes] = useState<CustomerDTO[]>([]);
  const [produtos, setProdutos] = useState<ProductDTO[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // O vendedor do pedido é o da sessão: o servidor resolve sozinho, a tela
  // não envia nem guarda esse id.

  // Estado do Modal de Novo Pedido
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Estado do Modal de Cadastro de Cliente Rápido dentro do Pedido
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [quickClientName, setQuickClientName] = useState('');
  const [quickClientIsRev, setQuickClientIsRev] = useState(true);
  const [quickClientPhone, setQuickClientPhone] = useState('');
  const [quickClientCnpj, setQuickClientCnpj] = useState('');
  const [quickClientAddress, setQuickClientAddress] = useState('');
  const [quickClientNeighborhood, setQuickClientNeighborhood] = useState('');
  const [quickClientCep, setQuickClientCep] = useState('');
  const [quickClientNumber, setQuickClientNumber] = useState('');
  const [quickClientComplement, setQuickClientComplement] = useState('');
  const [quickSaving, setQuickSaving] = useState(false);
  const [cnpjLoading, setCnpjLoading] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);

  // Filtro de listagem
  const [filtroTexto, setFiltroTexto] = useState('');

  // Form Fields
  const [clienteId, setClienteId] = useState('');
  const [clienteBusca, setClienteBusca] = useState('');
  const [clienteListaAberta, setClienteListaAberta] = useState(false);
  const [highlightedClientIndex, setHighlightedClientIndex] = useState(0);
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
  const [formaPagamento, setFormaPagamento] = useState('Pix');
  const [formasPagamento, setFormasPagamento] = useState<{ id: string; name: string; netDays: number | null }[]>([]);
  const [dataPedido, setDataPedido] = useState(new Date().toISOString().split('T')[0]);
  const [desconto, setDesconto] = useState('0');
  const [frete, setFrete] = useState('0');
  const [observacoes, setObservacoes] = useState('');

  // Itens do Pedido temporários no formulário
  const [itensTemp, setItensTemp] = useState<PedidoItem[]>([]);
  const [selectedProdId, setSelectedProdId] = useState('');
  const [itemQty, setItemQty] = useState('1');
  const [itemDesc, setItemDesc] = useState('0');
  const [itemPreco, setItemPreco] = useState('');
  const [produtoBusca, setProdutoBusca] = useState('');
  const [produtoListaAberta, setProdutoListaAberta] = useState(false);
  const [highlightedProdIndex, setHighlightedProdIndex] = useState(0);
  const qtyInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/payment-methods');
        if (res.ok) {
          const d = (await res.json()) as { data?: { id: string; name: string; netDays: number | null }[] };
          setFormasPagamento(d.data ?? []);
        }
      } catch {
        /* acessório */
      }
    })();
  }, []);

  useEffect(() => {
    if (!clienteId) {
      setEnderecosCliente([]);
      setEnderecoEntregaId('');
      setNovoEndAberto(false);
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
    })();
    return () => { cancel = true; };
  }, [clienteId]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Listagens paginadas: pedidos aceitam no máximo 200 por página,
      // clientes e produtos até 500. O servidor já limita os pedidos e a
      // carteira ao vendedor da sessão.
      const [pedsRes, clisRes, prodsRes] = await Promise.all([
        fetch('/api/orders?pageSize=200'),
        fetch('/api/customers?pageSize=500'),
        fetch('/api/products?type=venda&pageSize=500'),
      ]);

      if (!pedsRes.ok || !clisRes.ok || !prodsRes.ok) {
        const naoOk = [pedsRes, clisRes, prodsRes].find((r) => !r.ok)!;
        throw new Error(await responseErrorMessage(naoOk, 'Falha ao obter dados da carteira do vendedor.'));
      }

      const peds: Paginated<OrderDTO> = await pedsRes.json();
      const clis: Paginated<CustomerDTO> = await clisRes.json();
      const prods: Paginated<ProductDTO> = await prodsRes.json();

      setPedidos(peds.data);
      setClientes(clis.data);
      setProdutos(prods.data);

      // Produto agora é escolhido por busca digitável; não pré-seleciona.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao obter dados da carteira do vendedor.');
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

  // Cálculo de Preço Unitário dinâmico do Atacado vs Varejo
  const obterPrecoUnitario = (prod: ProductDTO, quantidade: number, isRevendedor: boolean) => {
    if (isRevendedor && prod.wholesalePrice > 0) {
      return prod.wholesalePrice;
    }
    if (prod.minWholesaleQty > 0 && quantidade >= prod.minWholesaleQty && prod.wholesalePrice > 0) {
      return prod.wholesalePrice;
    }
    return prod.salePrice;
  };

  const handleAddItem = () => {
    if (!selectedProdId || parseFloat(itemQty) <= 0) return;
    const prod = produtos.find(p => p.id === selectedProdId);
    if (!prod) return;

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
        const qty = patch.quantity !== undefined ? Math.max(0.001, patch.quantity) : item.quantity;
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

  // Totais do Formulário
  const subtotal = itensTemp.reduce((sum, item) => sum + item.subtotal, 0);
  const total = Math.max(0, subtotal - parseFloat(desconto) + parseFloat(frete));

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

  const handleSavePedido = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clienteId || itensTemp.length === 0) return;

    setSaving(true);
    // `sellerId` não vai no corpo: o servidor usa o vendedor da sessão.
    const payload = {
      customerId: clienteId,
      status: 'confirmado', // Pedido já é lançado confirmado do celular para baixa automática de estoque!
      paymentMethod: formaPagamento,
      orderDate: dataPedido,
      deliveryDate: dataPedido, // Assume entrega para o mesmo dia em campo
      deliveryAddressId: enderecoEntregaId || null,
      dueDate: (() => {
        const opt = formasPagamento.find((f) => f.name === formaPagamento);
        if (!opt || opt.netDays == null) return null;
        const [y, m, dd] = dataPedido.slice(0, 10).split('-').map(Number);
        const base = new Date(Date.UTC(y, m - 1, dd));
        base.setUTCDate(base.getUTCDate() + opt.netDays);
        return base.toISOString().slice(0, 10);
      })(),
      discount: parseFloat(desconto) || 0,
      shipping: parseFloat(frete) || 0,
      notes: observacoes || undefined,
      items: itensTemp.map(i => ({
        productId: i.productId,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        discountItem: i.discountItem
      }))
    };

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error(await responseErrorMessage(res, 'Erro ao emitir pedido.'));

      setIsModalOpen(false);
      setItensTemp([]);
      setClienteId('');
      setClienteBusca('');
      setClienteListaAberta(false);
      setEnderecoEntregaId('');
      setNovoEndAberto(false);
      setDesconto('0');
      setFrete('0');
      setObservacoes('');
      loadData();
      toast('Pedido lançado e faturado! Baixa de estoque efetuada.', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao emitir pedido.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleQueryCNPJ = async () => {
    const cleanCnpj = quickClientCnpj.replace(/\D/g, '');
    if (cleanCnpj.length !== 14) {
      toast('Digite um CNPJ válido com 14 dígitos para buscar.', 'error');
      return;
    }

    setCnpjLoading(true);
    try {
      const res = await fetch(`/api/tools/cnpj?cnpj=${cleanCnpj}`);
      if (!res.ok) throw new Error('CNPJ não encontrado ou indisponível.');
      const data: RespostaCnpj = await res.json();

      setQuickClientName(data.nome_fantasia || data.razao_social || '');
      setQuickClientPhone(formatPhone(data.ddd_telefone_1 || ''));
      
      setQuickClientAddress(data.logradouro || '');
      setQuickClientNumber(data.numero || '');
      setQuickClientComplement(data.complemento || '');
      setQuickClientNeighborhood(data.bairro || '');
      setQuickClientCep(data.cep || '');
      
      toast('Dados do CNPJ preenchidos!', 'success');
    } catch (err) {
      toast('Erro ao consultar CNPJ: ' + (err instanceof Error ? err.message : 'erro desconhecido.'), 'error');
    } finally {
      setCnpjLoading(false);
    }
  };

  const handleQueryCEP = async () => {
    const cleanCep = quickClientCep.replace(/\D/g, '');
    if (cleanCep.length !== 8) {
      toast('Digite um CEP válido com 8 dígitos para buscar.', 'error');
      return;
    }

    setCepLoading(true);
    try {
      const res = await fetch(`/api/tools/cep?cep=${cleanCep}`);
      if (!res.ok) throw new Error('CEP não encontrado ou indisponível.');
      const data: RespostaCep = await res.json();

      setQuickClientAddress(data.street || '');
      setQuickClientNeighborhood(data.neighborhood || '');
      toast('Endereço do CEP carregado!', 'success');
    } catch (err) {
      toast('Erro ao consultar CEP: ' + (err instanceof Error ? err.message : 'erro desconhecido.'), 'error');
    } finally {
      setCepLoading(false);
    }
  };

  const handleSaveQuickClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickClientName) return;

    setQuickSaving(true);
    // `phone` agora é gravado de verdade pelo servidor (antes era ignorado).
    const payload = {
      tradeName: quickClientName,
      isReseller: quickClientIsRev,
      phone: quickClientPhone || undefined,
      cnpj: quickClientCnpj || undefined,
      latitude: -22.9068,
      longitude: -43.1729,
      address: quickClientAddress || 'Cadastrado via atalho rápido de pedidos',
      number: quickClientNumber || undefined,
      complement: quickClientComplement || undefined,
      neighborhood: quickClientNeighborhood || 'Centro',
      zipCode: quickClientCep || undefined,
      city: 'Rio de Janeiro',
      state: 'RJ',
      active: true
    };

    try {
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error(await responseErrorMessage(res, 'Erro ao cadastrar cliente.'));

      // `POST /api/customers` devolve o cliente completo (CustomerDTO).
      const newCli: CustomerDTO = await res.json();

      const updatedClients = [...clientes, newCli];
      setClientes(updatedClients);

      setClienteId(newCli.id);
      setClienteBusca(newCli.tradeName);
      setClienteListaAberta(false);
      setItensTemp([]);

      setQuickClientName('');
      setQuickClientPhone('');
      setQuickClientCnpj('');
      setQuickClientAddress('');
      setQuickClientNumber('');
      setQuickClientComplement('');
      setQuickClientNeighborhood('');
      setQuickClientCep('');
      setIsClientModalOpen(false);
      
      toast(`Cliente "${newCli.tradeName}" cadastrado e selecionado!`, 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao cadastrar cliente.', 'error');
    } finally {
      setQuickSaving(false);
    }
  };

  const clientesFiltrados = (clienteBusca.trim()
    ? clientes.filter((c) => c.tradeName.toLowerCase().includes(clienteBusca.toLowerCase()) || (c.cnpj ?? '').includes(clienteBusca.replace(/\D/g, '')))
    : clientes
  ).slice(0, 50);

  const produtosFiltrados = (produtoBusca.trim()
    ? produtos.filter((p) => p.name.toLowerCase().includes(produtoBusca.toLowerCase()) || (p.sku ?? '').toLowerCase().includes(produtoBusca.toLowerCase()))
    : produtos
  ).slice(0, 50);

  const handleWhatsApp = (p: OrderDTO) => {
    const customer = clientes.find((c) => c.id === p.customerId);
    const rawPhone = p.deliveryAddress?.phone || customer?.phone || customer?.mobile || '';
    const cleanPhone = rawPhone.replace(/\D/g, '');
    const linhas = (p.items ?? []).map((i) => `• ${i.quantity}x ${i.productName ?? ''}`).join('\n');
    const msg =
      `*Pedido #${p.numero} — Doces Prigor* 🍬\n` +
      `Cliente: ${p.customerName ?? ''}\n` +
      (linhas ? `${linhas}\n` : '') +
      `\n*Total:* ${p.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}\n` +
      `*Pagamento:* ${p.paymentMethod?.toUpperCase() ?? 'A combinar'}` +
      (p.deliveryDate ? `\n*Previsão de Entrega:* ${formatarData(p.deliveryDate)}` : '') +
      `\n\n_Obrigado pela preferência e parceria!_`;

    const url = cleanPhone
      ? `https://api.whatsapp.com/send?phone=55${cleanPhone}&text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  };

  const pedidosFiltrados = pedidos.filter((p) => {
    if (!filtroTexto.trim()) return true;
    const q = filtroTexto.trim().toLowerCase().replace('#', '');
    const numMatch = String(p.numero).includes(q);
    const cliMatch = (p.customerName || '').toLowerCase().includes(q);
    return numMatch || cliMatch;
  });

  return (
    <div className="space-y-4 max-w-md mx-auto">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-stone-900 flex items-center gap-2">
            <FileText className="h-5.5 w-5.5 text-amber-700" />
            Meus Pedidos
          </h2>
          <p className="text-[10px] text-stone-500 font-semibold">Consulte e lance novas vendas em campo</p>
        </div>
        <button 
          onClick={() => {
            setIsModalOpen(true);
            setClienteId('');
            setClienteBusca('');
            setClienteListaAberta(false);
            setHighlightedClientIndex(0);
            setItensTemp([]);
          }}
          className="rounded-lg bg-amber-700 px-3.5 py-2 text-white font-bold text-xs hover:bg-amber-800 transition-all flex items-center gap-1 cursor-pointer shadow-xs"
        >
          <Plus className="h-4 w-4" />
          Novo Pedido
        </button>
      </div>

      {/* Busca de Pedidos */}
      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-stone-400" />
        <input
          type="text"
          value={filtroTexto}
          onChange={(e) => setFiltroTexto(e.target.value)}
          placeholder="Buscar por cliente ou nº do pedido..."
          className="w-full pl-9 pr-3 py-2 rounded-xl border border-stone-200 text-xs bg-white focus:outline-none shadow-xs"
        />
      </div>

      {/* Listagem */}
      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-amber-700" /></div>
      ) : error ? (
        <div className="p-4 bg-red-50 text-red-750 text-xs border border-red-200 rounded-xl text-center">{error}</div>
      ) : pedidos.length === 0 ? (
        <div className="text-center py-12 rounded-xl bg-white border border-stone-200 p-4">
          <FileText className="h-10 w-10 text-stone-300 mx-auto mb-2" />
          <p className="text-stone-500 text-xs font-bold">Nenhum pedido lançado ainda</p>
        </div>
      ) : pedidosFiltrados.length === 0 ? (
        <div className="text-center py-12 rounded-xl bg-white border border-stone-200 p-4">
          <Search className="h-10 w-10 text-stone-300 mx-auto mb-2" />
          <p className="text-stone-500 text-xs font-bold">Nenhum pedido encontrado para a busca</p>
        </div>
      ) : (
        <div className="space-y-2.5 max-h-[75vh] overflow-y-auto pr-1">
          {pedidosFiltrados.map((p) => (
            <div key={p.id} className="bg-white p-3.5 rounded-xl border border-stone-200 shadow-xs text-xs font-semibold text-stone-700 flex justify-between items-start">
              <div>
                <span className="text-stone-850 font-bold text-sm block">Pedido #{p.numero}</span>
                <span className="text-stone-500 block mt-0.5">{p.customerName}</span>
                <span className="text-[9px] text-stone-400 block font-medium mt-1">
                  Emitido em: {formatarData(p.orderDate)} • {p.paymentMethod?.toUpperCase()}
                </span>
                <button
                  type="button"
                  onClick={() => handleWhatsApp(p)}
                  className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-[10px] font-bold border border-emerald-200 transition-all cursor-pointer"
                  title="Enviar confirmação e itens do pedido por WhatsApp"
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                  Enviar WhatsApp
                </button>
              </div>
              <div className="text-right flex flex-col items-end gap-1.5 shrink-0">
                <span className="text-stone-850 font-black text-sm block">
                  {p.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </span>
                <span className={`inline-flex px-1.5 py-0.5 rounded text-[8px] font-black uppercase ${
                  p.status === 'faturado' || p.status === 'entregue' ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'
                }`}>
                  {p.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Novo Pedido */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-3 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-stone-200 shadow-xl w-full max-w-md max-h-[92vh] overflow-hidden flex flex-col animate-scaleIn">
            <div className="flex items-center justify-between px-4.5 py-3.5 border-b border-stone-100 shrink-0">
              <h3 className="font-extrabold text-stone-900 text-sm">Emitir Venda em Campo</h3>
              <button onClick={() => setIsModalOpen(false)} className="p-1 hover:bg-stone-50 rounded-lg text-stone-400 cursor-pointer">
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <form onSubmit={handleSavePedido} className="p-4.5 space-y-4 overflow-y-auto flex-1 text-xs">
              <div className="space-y-3.5">
                
                {/* Seleção do Cliente */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[9px] text-stone-400 font-bold uppercase block">Cliente *</label>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[8px] text-stone-400 italic">Setas ↑↓ e Enter</span>
                      <button 
                        type="button" 
                        onClick={() => setIsClientModalOpen(true)}
                        className="text-[9px] text-amber-800 font-bold hover:underline cursor-pointer flex items-center gap-0.5"
                      >
                        ➕ Novo Cliente Rápido
                      </button>
                    </div>
                  </div>
                  <div className="relative">
                    <input
                      type="text"
                      value={clienteBusca}
                      onFocus={() => {
                        setClienteListaAberta(true);
                        setHighlightedClientIndex(0);
                      }}
                      onBlur={() => window.setTimeout(() => setClienteListaAberta(false), 200)}
                      onChange={(e) => { 
                        setClienteBusca(e.target.value); 
                        setClienteListaAberta(true); 
                        setHighlightedClientIndex(0);
                        if (clienteId) { setClienteId(''); setItensTemp([]); } 
                      }}
                      onKeyDown={(e) => {
                        if (!clienteListaAberta || clientesFiltrados.length === 0) return;
                        if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          setHighlightedClientIndex((prev) => Math.min(clientesFiltrados.length - 1, prev + 1));
                        } else if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          setHighlightedClientIndex((prev) => Math.max(0, prev - 1));
                        } else if (e.key === 'Enter') {
                          e.preventDefault();
                          const cli = clientesFiltrados[highlightedClientIndex];
                          if (cli) {
                            setClienteId(cli.id);
                            setClienteBusca(cli.tradeName);
                            setClienteListaAberta(false);
                            setItensTemp([]);
                          }
                        } else if (e.key === 'Escape') {
                          setClienteListaAberta(false);
                        }
                      }}
                      placeholder="Digite o nome do cliente..."
                      className="w-full px-3 py-2 rounded-lg border border-stone-200 bg-stone-50/50 text-stone-800 focus:outline-none"
                    />
                    {clienteListaAberta && (
                      <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-stone-200 bg-white shadow-lg">
                        {clientesFiltrados.length === 0 ? (
                          <div className="px-3 py-2 text-xs text-stone-400">Nenhum cliente encontrado</div>
                        ) : (
                          clientesFiltrados.map((c, idx) => (
                            <button
                              type="button"
                              key={c.id}
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => { setClienteId(c.id); setClienteBusca(c.tradeName); setClienteListaAberta(false); setItensTemp([]); }}
                              className={`block w-full text-left px-3 py-2 text-xs transition-colors ${
                                idx === highlightedClientIndex
                                  ? 'bg-amber-100 text-amber-900 font-bold border-l-4 border-amber-600'
                                  : c.id === clienteId
                                  ? 'bg-amber-50 font-bold'
                                  : 'hover:bg-amber-50'
                              }`}
                            >
                              {c.tradeName}{c.isReseller ? ' (Revendedor)' : ''}
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {clienteId && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[9px] text-stone-400 font-bold uppercase block">Endereço de Entrega</label>
                      <button type="button" onClick={() => setNovoEndAberto((v) => !v)} className="text-[9px] font-bold text-amber-800 hover:underline cursor-pointer">
                        {novoEndAberto ? 'Cancelar' : '➕ Novo endereço'}
                      </button>
                    </div>
                    <select
                      value={enderecoEntregaId}
                      onChange={(e) => setEnderecoEntregaId(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-stone-200 bg-stone-50/50 text-stone-800 focus:outline-none text-xs"
                    >
                      <option value="">Mesmo do cadastro (principal)</option>
                      {enderecosCliente.map((a) => (
                        <option key={a.id} value={a.id}>{a.label ? `${a.label} — ` : ''}{a.address ?? ''}{a.neighborhood ? `, ${a.neighborhood}` : ''}</option>
                      ))}
                    </select>
                    {novoEndAberto && (
                      <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50/40 p-2.5 space-y-2">
                        <input type="text" placeholder="Apelido (ex.: Filial)" value={neLabel} onChange={(e) => setNeLabel(e.target.value)} className="w-full px-2.5 py-1.5 rounded-lg border border-stone-200 text-xs bg-white focus:outline-none" />
                        <div className="grid grid-cols-3 gap-2">
                          <input type="text" placeholder="Endereço *" value={neAddress} onChange={(e) => setNeAddress(e.target.value)} className="col-span-2 px-2.5 py-1.5 rounded-lg border border-stone-200 text-xs bg-white focus:outline-none" />
                          <input type="text" placeholder="Nº" value={neNumber} onChange={(e) => setNeNumber(e.target.value)} className="px-2.5 py-1.5 rounded-lg border border-stone-200 text-xs bg-white focus:outline-none" />
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
                )}

                {/* Selecionar e Adicionar Itens */}
                {clienteId && (
                  <div className="rounded-xl border border-stone-200 p-3 bg-stone-50/30 space-y-2.5">
                    <h4 className="text-[9px] font-black text-stone-850 uppercase tracking-wider flex items-center gap-1">
                      <Package className="h-3.5 w-3.5 text-amber-700" />
                      Adicionar Item
                    </h4>

                    <div className="grid grid-cols-3 gap-2 items-end">
                      <div className="col-span-2">
                        <div className="flex items-center justify-between mb-0.5">
                          <label className="text-[8px] text-stone-450 font-bold uppercase block">Produto</label>
                          <span className="text-[8px] text-stone-400 italic">Use setas ↑↓ e Enter</span>
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
                            placeholder="Digite o produto..."
                            className="w-full px-2.5 py-1.5 rounded-lg border border-stone-200 bg-white focus:outline-none text-[11px]"
                          />
                          {produtoListaAberta && (
                            <div className="absolute z-30 mt-1 w-full max-h-52 overflow-y-auto rounded-lg border border-stone-200 bg-white shadow-lg">
                              {produtosFiltrados.length === 0 ? (
                                <div className="px-2.5 py-2 text-[11px] text-stone-400">Nenhum produto encontrado</div>
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
                                    className={`block w-full text-left px-2.5 py-1.5 text-[11px] transition-colors ${
                                      idx === highlightedProdIndex
                                        ? 'bg-amber-100 text-amber-900 font-bold border-l-4 border-amber-600'
                                        : p.id === selectedProdId
                                        ? 'bg-amber-50 font-bold'
                                        : 'hover:bg-amber-50'
                                    }`}
                                  >
                                    {p.name} — R$ {p.salePrice}
                                  </button>
                                ))
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      <div>
                        <label className="text-[8px] text-stone-450 font-bold uppercase block mb-0.5">Quantidade</label>
                        <input 
                          ref={qtyInputRef}
                          type="number"
                          min="1"
                          step="1"
                          value={itemQty}
                          onChange={(e) => setItemQty(e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-lg border border-stone-200 bg-white focus:outline-none text-[11px]"
                        />
                      </div>

                      <div>
                        <label className="text-[8px] text-stone-450 font-bold uppercase block mb-0.5">Preço Unit. (R$)</label>
                        <input 
                          type="number"
                          step="0.01"
                          min="0"
                          value={itemPreco}
                          onChange={(e) => setItemPreco(e.target.value)}
                          placeholder="auto"
                          className="w-full px-2.5 py-1.5 rounded-lg border border-stone-200 bg-white focus:outline-none text-[11px]"
                        />
                      </div>

                      <div>
                        <label className="text-[8px] text-stone-450 font-bold uppercase block mb-0.5">Desconto Unit. (R$)</label>
                        <input 
                          type="number"
                          step="0.01"
                          min="0"
                          value={itemDesc}
                          onChange={(e) => setItemDesc(e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-lg border border-stone-200 bg-white focus:outline-none text-[11px]"
                        />
                      </div>

                      <button 
                        type="button" 
                        onClick={handleAddItem}
                        className="rounded-lg bg-stone-900 hover:bg-stone-800 text-white font-bold py-1.5 px-2 text-center cursor-pointer transition-all text-[10px]"
                      >
                        Inserir
                      </button>
                    </div>

                    {/* Lista de Itens Adicionados */}
                    {itensTemp.length > 0 && (
                      <div className="border border-stone-200 bg-white rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                        <table className="w-full text-left text-[10px] font-semibold text-stone-600">
                          <thead className="bg-stone-50 text-stone-400 font-bold border-b border-stone-150">
                            <tr>
                              <th className="py-1.5 px-2">Produto</th>
                              <th className="py-1.5 px-2 text-center w-16">Qtd</th>
                              <th className="py-1.5 px-2 text-right">Preço Unit.</th>
                              <th className="py-1.5 px-2 text-right w-24">Desc. Unit.</th>
                              <th className="py-1.5 px-2 text-right">Subtotal</th>
                              <th className="py-1.5 px-2 text-center"></th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-stone-100">
                            {itensTemp.map((it, idx) => (
                              <tr key={idx} className="hover:bg-stone-50/50">
                                <td className="py-1.5 px-2 truncate max-w-[120px] font-bold text-stone-800">{it.productName}</td>
                                <td className="py-1.5 px-2 text-center">
                                  <input
                                    type="number"
                                    min="1"
                                    step="1"
                                    value={it.quantity}
                                    onChange={(e) => handleUpdateItem(idx, { quantity: parseFloat(e.target.value) || 0 })}
                                    className="w-14 px-1 py-0.5 text-center font-bold rounded border border-stone-200 bg-stone-50 focus:bg-white focus:border-amber-500 focus:outline-none text-[10px]"
                                  />
                                </td>
                                <td className="py-1.5 px-2 text-right text-stone-600">
                                  {it.unitPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                </td>
                                <td className="py-1.5 px-2 text-right">
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={it.discountItem}
                                    onChange={(e) => handleUpdateItem(idx, { discountItem: parseFloat(e.target.value) || 0 })}
                                    className="w-16 px-1 py-0.5 text-right font-bold rounded border border-stone-200 bg-stone-50 focus:bg-white focus:border-amber-500 focus:outline-none text-[10px] text-red-600"
                                  />
                                </td>
                                <td className="py-1.5 px-2 text-right font-black text-stone-900">
                                  {it.subtotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                </td>
                                <td className="py-1.5 px-2 text-center">
                                  <button onClick={() => handleRemoveItem(idx)} className="text-red-600 hover:text-red-800 font-bold cursor-pointer">X</button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* Pagamento e Entrega */}
                <div className="grid grid-cols-2 gap-3.5">
                  <div>
                    <label className="text-[9px] text-stone-400 font-bold uppercase block mb-1 font-bold">Forma de Pagamento</label>
                    <select
                      value={formaPagamento}
                      onChange={(e) => setFormaPagamento(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-stone-200 bg-stone-50/50 focus:outline-none"
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
                    <label className="text-[9px] text-stone-400 font-bold uppercase block mb-1 font-bold">Data Emissão</label>
                    <input 
                      type="date"
                      value={dataPedido}
                      onChange={(e) => setDataPedido(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-lg border border-stone-200 bg-stone-50/50 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[9px] text-stone-400 font-bold uppercase block mb-1">Desconto Geral (R$)</label>
                    <input 
                      type="number"
                      step="0.01"
                      min="0"
                      value={desconto}
                      onChange={(e) => setDesconto(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-stone-200 bg-stone-50/50 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[9px] text-stone-400 font-bold uppercase block mb-1">Frete (R$)</label>
                    <input 
                      type="number"
                      step="0.01"
                      min="0"
                      value={frete}
                      onChange={(e) => setFrete(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-stone-200 bg-stone-50/50 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[9px] text-stone-400 font-bold uppercase block mb-1">Observações do Pedido</label>
                  <textarea 
                    value={observacoes}
                    onChange={(e) => setObservacoes(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-stone-200 bg-stone-50/50 h-14 resize-none focus:outline-none"
                  />
                </div>
              </div>

              {/* Box de Totalização */}
              <div className="p-3 bg-stone-50 border border-stone-150 rounded-xl space-y-1.5 text-stone-600 font-semibold shrink-0">
                <div className="flex justify-between">
                  <span>Subtotal Itens:</span>
                  <span>{subtotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                </div>
                <div className="flex justify-between text-red-650">
                  <span>Desconto Geral:</span>
                  <span>- {parseFloat(desconto).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                </div>
                <div className="flex justify-between">
                  <span>Frete / Entrega:</span>
                  <span>+ {parseFloat(frete).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                </div>
                <div className="flex justify-between text-stone-850 font-black text-sm border-t border-stone-200 pt-1.5 mt-1.5">
                  <span>Total Pedido:</span>
                  <span>{total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                </div>
              </div>

              {/* Botões do Rodapé */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-stone-100 shrink-0">
                <button 
                  type="button" 
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-lg border border-stone-250 hover:bg-stone-50 px-4 py-2 font-bold cursor-pointer transition-all text-xs"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  disabled={saving || itensTemp.length === 0}
                  className="rounded-lg bg-amber-700 hover:bg-amber-800 px-4 py-2 text-white font-bold cursor-pointer transition-all shadow-xs disabled:opacity-50 text-xs"
                >
                  {saving ? 'Emitindo...' : 'Faturar Pedido'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Cadastro de Cliente Rápido */}
      {isClientModalOpen && (
        <div className="fixed inset-0 z-55 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-3 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-stone-200 shadow-xl w-full max-w-sm p-5 space-y-4 animate-scaleIn">
            <div className="flex items-center justify-between border-b border-stone-100 pb-2">
              <h3 className="font-extrabold text-stone-900 text-sm">Cadastrar Cliente Rápido</h3>
              <button 
                type="button" 
                onClick={() => setIsClientModalOpen(false)} 
                className="text-stone-400 hover:text-stone-600 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveQuickClient} className="space-y-4 text-xs font-semibold text-stone-700">
              {/* Campo CNPJ com Busca */}
              <div className="grid grid-cols-3 gap-2 items-end">
                <div className="col-span-2">
                  <label className="text-[9px] text-stone-400 font-bold uppercase block mb-1">CNPJ (Opcional)</label>
                  <input 
                    type="text"
                    placeholder="Sem pontuação"
                    value={quickClientCnpj}
                    onChange={(e) => setQuickClientCnpj(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-stone-200 bg-stone-50/50 focus:outline-none"
                  />
                </div>
                <button 
                  type="button"
                  onClick={handleQueryCNPJ}
                  disabled={cnpjLoading}
                  className="rounded-lg bg-stone-900 hover:bg-stone-850 text-white font-bold py-2 text-center cursor-pointer transition-all h-9 flex items-center justify-center text-[10px]"
                >
                  {cnpjLoading ? <Loader2 className="h-4 w-4 animate-spin text-white" /> : 'Buscar'}
                </button>
              </div>

              {/* Nome Fantasia */}
              <div>
                <label className="text-[9px] text-stone-400 font-bold uppercase block mb-1">Nome Fantasia *</label>
                <input 
                  type="text"
                  required
                  placeholder="Ex: Padaria do Bairro"
                  value={quickClientName}
                  onChange={(e) => setQuickClientName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-stone-200 bg-stone-50/50 focus:outline-none"
                />
              </div>

              {/* Telefone */}
              <div>
                <label className="text-[9px] text-stone-400 font-bold uppercase block mb-1">Telefone / Whats</label>
                <input 
                  type="text"
                  placeholder="(21) 99999-9999"
                  value={quickClientPhone}
                  onChange={(e) => setQuickClientPhone(formatPhone(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg border border-stone-200 bg-stone-50/50 focus:outline-none"
                />
              </div>

              {/* CEP com Busca */}
              <div className="grid grid-cols-3 gap-2 items-end">
                <div className="col-span-2">
                  <label className="text-[9px] text-stone-400 font-bold uppercase block mb-1">CEP</label>
                  <input 
                    type="text"
                    placeholder="Sem traço"
                    value={quickClientCep}
                    onChange={(e) => setQuickClientCep(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-stone-200 bg-stone-50/50 focus:outline-none"
                  />
                </div>
                <button 
                  type="button"
                  onClick={handleQueryCEP}
                  disabled={cepLoading}
                  className="rounded-lg border border-amber-250 bg-amber-700/5 hover:bg-amber-700/10 text-amber-800 font-bold py-2 text-center cursor-pointer transition-all h-9 flex items-center justify-center text-[10px]"
                >
                  {cepLoading ? <Loader2 className="h-4 w-4 animate-spin text-amber-700" /> : 'Buscar'}
                </button>
              </div>

              {/* Endereço de Entrega & Número */}
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="text-[9px] text-stone-400 font-bold uppercase block mb-1">Endereço de Entrega</label>
                  <input 
                    type="text"
                    placeholder="Rua, Av, etc."
                    value={quickClientAddress}
                    onChange={(e) => setQuickClientAddress(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-stone-200 bg-stone-50/50 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[9px] text-stone-400 font-bold uppercase block mb-1">Número</label>
                  <input 
                    type="text"
                    placeholder="Ex: 123"
                    value={quickClientNumber}
                    onChange={(e) => setQuickClientNumber(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-stone-200 bg-stone-50/50 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] text-stone-400 font-bold uppercase block mb-1">Bairro</label>
                  <input 
                    type="text"
                    placeholder="Ex: São Cristóvão"
                    value={quickClientNeighborhood}
                    onChange={(e) => setQuickClientNeighborhood(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-stone-200 bg-stone-50/50 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[9px] text-stone-400 font-bold uppercase block mb-1">Perfil Comercial</label>
                  <select 
                    value={quickClientIsRev ? 'true' : 'false'}
                    onChange={(e) => setQuickClientIsRev(e.target.value === 'true')}
                    className="w-full px-3 py-2 rounded-lg border border-stone-200 bg-stone-50/50 focus:outline-none text-stone-850"
                  >
                    <option value="true">Revendedor (Atacado)</option>
                    <option value="false">Consumidor (Varejo)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[9px] text-stone-400 font-bold uppercase block mb-1">Ponto de Referência / Compl.</label>
                <input 
                  type="text"
                  placeholder="Ex: Próximo ao metrô / Bloco 2"
                  value={quickClientComplement}
                  onChange={(e) => setQuickClientComplement(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-stone-200 bg-stone-50/50 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-stone-100">
                <button 
                  type="button" 
                  onClick={() => setIsClientModalOpen(false)}
                  className="rounded-lg border border-stone-250 hover:bg-stone-50 px-4 py-2 font-bold cursor-pointer text-xs"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  disabled={quickSaving || !quickClientName}
                  className="rounded-lg bg-amber-700 hover:bg-amber-800 px-4 py-2 text-white font-bold cursor-pointer shadow-xs disabled:opacity-50 text-xs"
                >
                  {quickSaving ? 'Salvando...' : 'Salvar Cliente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
