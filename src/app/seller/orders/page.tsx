'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  FileText,
  Plus,
  Loader2,
  X,
  Package
} from 'lucide-react';
import { responseErrorMessage } from '@/lib/errors';

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

/** Pedido devolvido por `GET /api/orders` (recorte de OrderDTO). */
interface Pedido {
  id: string;
  numero: number;
  customerName?: string | null;
  sellerName?: string | null;
  status: 'novo' | 'confirmado' | 'em_producao' | 'entregue' | 'faturado' | 'cancelado';
  paymentMethod?: string;
  orderDate: string;
  total: number;
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
}

/** Envelope de paginação usado por todas as listagens da API. */
interface Paginated<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}



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
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  
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

  // Form Fields
  const [clienteId, setClienteId] = useState('');
  const [formaPagamento, setFormaPagamento] = useState('pix');
  const [dataPedido, setDataPedido] = useState(new Date().toISOString().split('T')[0]);
  const [desconto, setDesconto] = useState('0');
  const [frete, setFrete] = useState('0');
  const [observacoes, setObservacoes] = useState('');

  // Itens do Pedido temporários no formulário
  const [itensTemp, setItensTemp] = useState<PedidoItem[]>([]);
  const [selectedProdId, setSelectedProdId] = useState('');
  const [itemQty, setItemQty] = useState('1');
  const [itemDesc, setItemDesc] = useState('0');

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

      const peds: Paginated<Pedido> = await pedsRes.json();
      const clis: Paginated<Cliente> = await clisRes.json();
      const prods: Paginated<Produto> = await prodsRes.json();

      setPedidos(peds.data);
      setClientes(clis.data);
      setProdutos(prods.data);

      if (prods.data.length > 0) {
        setSelectedProdId(prods.data[0].id);
      }
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
  const obterPrecoUnitario = (prod: Produto, quantidade: number, isRevendedor: boolean) => {
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

  // Totais do Formulário
  const subtotal = itensTemp.reduce((sum, item) => sum + item.subtotal, 0);
  const total = Math.max(0, subtotal - parseFloat(desconto) + parseFloat(frete));

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
      setDesconto('0');
      setFrete('0');
      setObservacoes('');
      loadData();
      alert('🎉 Pedido de venda lançado e faturado com sucesso! Baixa de estoque efetuada.');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao emitir pedido.');
    } finally {
      setSaving(false);
    }
  };

  const handleQueryCNPJ = async () => {
    const cleanCnpj = quickClientCnpj.replace(/\D/g, '');
    if (cleanCnpj.length !== 14) {
      alert('Digite um CNPJ válido com 14 dígitos para buscar.');
      return;
    }

    setCnpjLoading(true);
    try {
      const res = await fetch(`/api/tools/cnpj?cnpj=${cleanCnpj}`);
      if (!res.ok) throw new Error('CNPJ não encontrado ou indisponível.');
      const data: RespostaCnpj = await res.json();

      setQuickClientName(data.nome_fantasia || data.razao_social || '');
      setQuickClientPhone(data.ddd_telefone_1 || '');
      
      setQuickClientAddress(data.logradouro || '');
      setQuickClientNumber(data.numero || '');
      setQuickClientComplement(data.complemento || '');
      setQuickClientNeighborhood(data.bairro || '');
      setQuickClientCep(data.cep || '');
      
      alert('Dados do CNPJ preenchidos com sucesso!');
    } catch (err) {
      alert('Erro ao consultar CNPJ: ' + (err instanceof Error ? err.message : 'erro desconhecido.'));
    } finally {
      setCnpjLoading(false);
    }
  };

  const handleQueryCEP = async () => {
    const cleanCep = quickClientCep.replace(/\D/g, '');
    if (cleanCep.length !== 8) {
      alert('Digite um CEP válido com 8 dígitos para buscar.');
      return;
    }

    setCepLoading(true);
    try {
      const res = await fetch(`/api/tools/cep?cep=${cleanCep}`);
      if (!res.ok) throw new Error('CEP não encontrado ou indisponível.');
      const data: RespostaCep = await res.json();

      setQuickClientAddress(data.street || '');
      setQuickClientNeighborhood(data.neighborhood || '');
      alert('Endereço do CEP carregado!');
    } catch (err) {
      alert('Erro ao consultar CEP: ' + (err instanceof Error ? err.message : 'erro desconhecido.'));
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

      const newCli: Cliente = await res.json();

      const updatedClients = [...clientes, { id: newCli.id, tradeName: newCli.tradeName, isReseller: newCli.isReseller }];
      setClientes(updatedClients);

      setClienteId(newCli.id);
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
      
      alert(`🎉 Cliente "${newCli.tradeName}" cadastrado na sua carteira e selecionado!`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao cadastrar cliente.');
    } finally {
      setQuickSaving(false);
    }
  };

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
          onClick={() => setIsModalOpen(true)}
          className="rounded-lg bg-amber-700 px-3.5 py-2 text-white font-bold text-xs hover:bg-amber-800 transition-all flex items-center gap-1 cursor-pointer shadow-xs"
        >
          <Plus className="h-4 w-4" />
          Novo Pedido
        </button>
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
      ) : (
        <div className="space-y-2.5 max-h-[75vh] overflow-y-auto pr-1">
          {pedidos.map((p) => (
            <div key={p.id} className="bg-white p-3.5 rounded-xl border border-stone-200 shadow-xs text-xs font-semibold text-stone-700 flex justify-between items-start">
              <div>
                <span className="text-stone-850 font-bold text-sm block">Pedido #{p.numero}</span>
                <span className="text-stone-500 block mt-0.5">{p.customerName}</span>
                <span className="text-[9px] text-stone-400 block font-medium mt-1">
                  Emitido em: {formatarData(p.orderDate)} • {p.paymentMethod?.toUpperCase()}
                </span>
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
                    <button 
                      type="button" 
                      onClick={() => setIsClientModalOpen(true)}
                      className="text-[9px] text-amber-800 font-bold hover:underline cursor-pointer flex items-center gap-0.5"
                    >
                      ➕ Novo Cliente Rápido
                    </button>
                  </div>
                  <select 
                    required
                    value={clienteId}
                    onChange={(e) => { setClienteId(e.target.value); setItensTemp([]); }}
                    className="w-full px-3 py-2 rounded-lg border border-stone-200 bg-stone-50/50 text-stone-800 focus:outline-none"
                  >
                    <option value="">Selecione o Cliente...</option>
                    {clientes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.tradeName} {c.isReseller ? ' (Revendedor)' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Selecionar e Adicionar Itens */}
                {clienteId && (
                  <div className="rounded-xl border border-stone-200 p-3 bg-stone-50/30 space-y-2.5">
                    <h4 className="text-[9px] font-black text-stone-850 uppercase tracking-wider flex items-center gap-1">
                      <Package className="h-3.5 w-3.5 text-amber-700" />
                      Adicionar Item
                    </h4>

                    <div className="grid grid-cols-3 gap-2 items-end">
                      <div className="col-span-2">
                        <label className="text-[8px] text-stone-450 font-bold uppercase block mb-0.5">Produto</label>
                        <select 
                          value={selectedProdId}
                          onChange={(e) => setSelectedProdId(e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-lg border border-stone-200 bg-white focus:outline-none text-[11px]"
                        >
                          {produtos.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} - R$ {p.salePrice}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="text-[8px] text-stone-450 font-bold uppercase block mb-0.5">Quantidade</label>
                        <input 
                          type="number"
                          min="1"
                          step="1"
                          value={itemQty}
                          onChange={(e) => setItemQty(e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-lg border border-stone-200 bg-white focus:outline-none text-[11px]"
                        />
                      </div>

                      <div className="col-span-2">
                        <label className="text-[8px] text-stone-450 font-bold uppercase block mb-0.5">Desconto Unitário (R$)</label>
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
                      <div className="border border-stone-200 bg-white rounded-lg overflow-hidden max-h-32 overflow-y-auto">
                        <table className="w-full text-left text-[10px] font-semibold text-stone-600">
                          <thead className="bg-stone-50 text-stone-400 font-bold border-b border-stone-150">
                            <tr>
                              <th className="py-1 px-2">Produto</th>
                              <th className="py-1 px-2 text-center">Qtd</th>
                              <th className="py-1 px-2 text-right">Subtotal</th>
                              <th className="py-1 px-2 text-center"></th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-stone-100">
                            {itensTemp.map((it, idx) => (
                              <tr key={idx}>
                                <td className="py-1.5 px-2 truncate max-w-[120px]">{it.productName}</td>
                                <td className="py-1.5 px-2 text-center">{it.quantity}</td>
                                <td className="py-1.5 px-2 text-right">{it.subtotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                                <td className="py-1.5 px-2 text-center">
                                  <button onClick={() => handleRemoveItem(idx)} className="text-red-600 font-bold cursor-pointer">X</button>
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
                      <option value="pix">Pix</option>
                      <option value="dinheiro">Dinheiro</option>
                      <option value="debito">Cartão de Débito</option>
                      <option value="credito">Cartão de Crédito</option>
                      <option value="boleto">Boleto Bancário</option>
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
