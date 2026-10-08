'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  AlertCircle,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  FileText,
  Loader2,
  LogIn,
  MapPin,
  Minus,
  Package,
  Plus,
  Printer,
  Search,
  ShoppingCart,
  Sparkles,
  Trash2,
  User,
  UserCheck,
} from 'lucide-react';


interface ProductItem {
  id: string;
  name: string;
  description: string | null;
  salePrice: number;
  unit: string;
  category: string | null;
}

interface CustomerResult {
  id: string;
  tradeName: string;
  legalName: string | null;
  cnpj: string | null;
  cpf: string | null;
  phone?: string | null;
  mobile?: string | null;
  address: string | null;
  number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  sellerId: string | null;
  /** Liberado pela gerência para pagar no boleto. */
  boletoAllowed?: boolean;
  seller?: {
    id: string;
    name: string;
    code: string | null;
  } | null;
}

interface OrderItemState {
  productId: string;
  quantity: number;
  unitPrice: number;
  rawPrice?: string;
  originalPrice: number;
}

export default function PedidoClient() {
  // Estado dos produtos
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);

  // Modo de identificação: 'busca' (já cadastrado) ou 'novo'
  const [clientMode, setClientMode] = useState<'busca' | 'novo'>('busca');

  // Busca de cliente existente
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<CustomerResult[]>([]);
  const [searchingClient, setSearchingClient] = useState(false);
  const [selectedClient, setSelectedClient] = useState<CustomerResult | null>(null);

  // Formulário do novo cliente
  const [docType, setDocType] = useState<'cnpj' | 'cpf'>('cnpj');
  const [docValue, setDocValue] = useState('');
  const [loadingCnpj, setLoadingCnpj] = useState(false);
  const [tradeName, setTradeName] = useState('');
  const [legalName, setLegalName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [number, setNumber] = useState('');
  const [complement, setComplement] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [city, setCity] = useState('Rio de Janeiro');
  const [state, setState] = useState('RJ');
  const [zipCode, setZipCode] = useState('');

  // Endereço personalizado / alternativo de entrega para cliente existente
  const [useCustomAddress, setUseCustomAddress] = useState(false);
  const [customAddress, setCustomAddress] = useState('');
  const [customNumber, setCustomNumber] = useState('');
  const [customComplement, setCustomComplement] = useState('');
  const [customNeighborhood, setCustomNeighborhood] = useState('');
  const [customCity, setCustomCity] = useState('Rio de Janeiro');
  const [customState, setCustomState] = useState('RJ');
  const [customZipCode, setCustomZipCode] = useState('');

  // Vendedor
  const [sellerCode, setSellerCode] = useState('');
  const [sellerInfo, setSellerInfo] = useState<{ id: string; name: string; code: string | null } | null>(null);
  const [sellerStatus, setSellerStatus] = useState<'idle' | 'valid' | 'invalid'>('idle');
  const [directFactory, setDirectFactory] = useState(false);

  // Itens do pedido (map de productId -> OrderItemState)
  const [cart, setCart] = useState<Record<string, OrderItemState>>({});

  // Entrega e pagamento (padrão: data de hoje)
  const [deliveryDate, setDeliveryDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [paymentMethod, setPaymentMethod] = useState('Pix');
  const [notes, setNotes] = useState('');

  // Boleto disponível para qualquer cliente (inclusive novo); a gerência aprova ao faturar.
  const effectivePaymentMethod = paymentMethod;

  // Envio e resultado
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [orderSuccess, setOrderSuccess] = useState<{
    orderNumber: number;
    orderId: string;
    total: number;
    hasNegotiatedPrice: boolean;
    canPrintNow: boolean;
  } | null>(null);

  // Carregar produtos da API pública
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/public/products');
        const data = await res.json();
        if (data.products) {
          setProducts(data.products);
          // Inicializa o carrinho com os preços padrões
          const initialCart: Record<string, OrderItemState> = {};
          for (const p of data.products) {
            initialCart[p.id] = {
              productId: p.id,
              quantity: 0,
              unitPrice: p.salePrice,
              rawPrice: p.salePrice.toFixed(2).replace('.', ','),
              originalPrice: p.salePrice,
            };
          }
          setCart(initialCart);
        }
      } catch (err) {
        console.error('Erro ao carregar produtos:', err);
      } finally {
        setLoadingProducts(false);
      }
    }
    load();
  }, []);

  // Busca de clientes existentes conforme digita
  useEffect(() => {
    if (clientMode !== 'busca') return;
    if (searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setSearchingClient(true);
      try {
        const res = await fetch(`/api/public/customers/search?q=${encodeURIComponent(searchQuery.trim())}`);
        const data = await res.json();
        setSearchResults(data.customers || []);
      } catch {
        setSearchResults([]);
      } finally {
        setSearchingClient(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, clientMode]);

  // Validação do código do vendedor
  useEffect(() => {
    if (directFactory) {
      setSellerCode('');
      setSellerInfo(null);
      setSellerStatus('idle');
      return;
    }

    if (!sellerCode.trim()) {
      setSellerInfo(null);
      setSellerStatus('idle');
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/public/sellers/verify?code=${encodeURIComponent(sellerCode.trim())}`);
        const data = await res.json();
        if (data.valid && data.seller) {
          setSellerInfo(data.seller);
          setSellerStatus('valid');
        } else {
          setSellerInfo(null);
          setSellerStatus('invalid');
        }
      } catch {
        setSellerInfo(null);
        setSellerStatus('invalid');
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [sellerCode, directFactory]);

  // Consulta de CNPJ para novo cadastro
  const handleConsultarCnpj = async () => {
    const clean = docValue.replace(/\D/g, '');
    if (clean.length !== 14) {
      setErrorMsg('Digite um CNPJ válido com 14 números.');
      return;
    }
    setErrorMsg(null);
    setLoadingCnpj(true);
    try {
      const res = await fetch(`/api/public/tools/cnpj?cnpj=${clean}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'CNPJ não encontrado nas bases públicas.');
      }
      setTradeName(data.nome_fantasia || data.razao_social || '');
      setLegalName(data.razao_social || '');
      setAddress(data.logradouro || '');
      setNumber(data.numero || '');
      setComplement(data.complemento || '');
      setNeighborhood(data.bairro || '');
      setCity(data.municipio || 'Rio de Janeiro');
      setState(data.uf || 'RJ');
      setZipCode(data.cep || '');
      // Regra: NÃO preenche o telefone para forçar a inserção do número real
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao consultar CNPJ.');
    } finally {
      setLoadingCnpj(false);
    }
  };

  // Funções de alteração de itens no carrinho
  const handleQuantityChange = (productId: string, delta: number) => {
    setCart((prev) => {
      const prodPrice = products.find((p) => p.id === productId)?.salePrice || 0;
      const current = prev[productId] || {
        productId,
        quantity: 0,
        unitPrice: prodPrice,
        rawPrice: prodPrice.toFixed(2).replace('.', ','),
        originalPrice: prodPrice,
      };
      const newQty = Math.max(0, current.quantity + delta);
      return {
        ...prev,
        [productId]: { ...current, quantity: newQty },
      };
    });
  };

  const handlePriceChange = (productId: string, val: string) => {
    // Permite digitação natural de números, vírgula e ponto:
    const sanitized = val.replace(/[^\d.,]/g, '');
    const normalized = sanitized.replace(',', '.');
    const parsed = parseFloat(normalized);
    const safePrice = !isNaN(parsed) && parsed >= 0 ? parsed : 0;

    setCart((prev) => {
      const prodPrice = products.find((p) => p.id === productId)?.salePrice || 0;
      const current = prev[productId] || {
        productId,
        quantity: 0,
        unitPrice: safePrice,
        rawPrice: sanitized,
        originalPrice: prodPrice,
      };
      return {
        ...prev,
        [productId]: {
          ...current,
          unitPrice: safePrice,
          rawPrice: sanitized,
        },
      };
    });
  };

  const handlePriceBlur = (productId: string) => {
    setCart((prev) => {
      const current = prev[productId];
      if (!current) return prev;
      // Ao sair do campo, formata com duas casas decimais
      const formatted = current.unitPrice > 0
        ? current.unitPrice.toFixed(2).replace('.', ',')
        : (current.rawPrice || '0,00');
      return {
        ...prev,
        [productId]: {
          ...current,
          rawPrice: formatted,
        },
      };
    });
  };

  // Cálculos do resumo do pedido
  const activeItems = Object.values(cart).filter((i) => i.quantity > 0);
  const totalQuantity = activeItems.reduce((acc, i) => acc + i.quantity, 0);
  const totalValue = activeItems.reduce((acc, i) => acc + i.quantity * i.unitPrice, 0);
  const hasCustomPrice = activeItems.some((i) => Math.abs(i.unitPrice - i.originalPrice) > 0.009);

  // Submissão do pedido
  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (activeItems.length === 0) {
      setErrorMsg('Adicione ao menos um produto ao pedido.');
      return;
    }

    if (!phone.trim() || phone.replace(/\D/g, '').length < 8) {
      setErrorMsg('Por favor, informe seu WhatsApp ou telefone para contato.');
      return;
    }

    let customerPayload: Record<string, unknown> = {};
    let deliveryAddressPayload: Record<string, unknown> | undefined = undefined;

    if (clientMode === 'busca') {
      if (!selectedClient) {
        setErrorMsg('Selecione sua empresa na busca ou clique em "Cadastrar Novo".');
        return;
      }

      if (useCustomAddress) {
        if (!customAddress.trim() || !customNeighborhood.trim()) {
          setErrorMsg('Informe o logradouro e bairro para o novo endereço de entrega.');
          return;
        }
        deliveryAddressPayload = {
          address: customAddress.trim(),
          number: customNumber.trim() || undefined,
          complement: customComplement.trim() || undefined,
          neighborhood: customNeighborhood.trim(),
          city: customCity.trim() || 'Rio de Janeiro',
          state: customState.trim() || 'RJ',
          zipCode: customZipCode.replace(/\D/g, '') || undefined,
        };
      }

      customerPayload = {
        id: selectedClient.id,
        tradeName: selectedClient.tradeName,
        legalName: selectedClient.legalName || undefined,
        cnpj: selectedClient.cnpj || undefined,
        cpf: selectedClient.cpf || undefined,
        phone: phone.trim(),
        address: (selectedClient.address || '').trim() || 'A combinar',
        number: (selectedClient.number || '').trim() || undefined,
        complement: (selectedClient.complement || '').trim() || undefined,
        neighborhood: (selectedClient.neighborhood || '').trim() || 'Centro',
        city: (selectedClient.city || '').trim() || 'Rio de Janeiro',
        state: (selectedClient.state || '').trim() || 'RJ',
        zipCode: (selectedClient.zipCode?.replace(/\D/g, '') || '').trim() || undefined,
      };
    } else {
      if (!tradeName.trim()) {
        setErrorMsg('Informe o Nome Fantasia ou Razão Social da empresa.');
        return;
      }
      if (!address.trim() || !neighborhood.trim()) {
        setErrorMsg('Informe o endereço completo e bairro para entrega.');
        return;
      }
      customerPayload = {
        tradeName: tradeName.trim(),
        legalName: legalName.trim() || tradeName.trim(),
        cnpj: docType === 'cnpj' ? (docValue.replace(/\D/g, '') || undefined) : undefined,
        cpf: docType === 'cpf' ? (docValue.replace(/\D/g, '') || undefined) : undefined,
        phone: phone.trim(),
        address: address.trim(),
        number: number.trim() || undefined,
        complement: complement.trim() || undefined,
        neighborhood: neighborhood.trim(),
        city: city.trim() || 'Rio de Janeiro',
        state: state.trim() || 'RJ',
        zipCode: zipCode.replace(/\D/g, '') || undefined,
      };
    }

    setSubmitting(true);
    try {
      const response = await fetch('/api/public/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer: customerPayload,
          deliveryAddress: deliveryAddressPayload,
          sellerCode: directFactory ? undefined : sellerCode.trim() || undefined,
          deliveryDate: deliveryDate || undefined,
          paymentMethod: effectivePaymentMethod,
          notes: notes.trim() || undefined,
          items: activeItems.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
          })),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error?.message || 'Erro ao formular pedido.');
      }

      setOrderSuccess({
        orderNumber: data.orderNumber,
        orderId: data.orderId,
        total: data.total,
        hasNegotiatedPrice: data.hasNegotiatedPrice,
        canPrintNow: data.canPrintNow,
      });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao enviar pedido.');
    } finally {
      setSubmitting(false);
    }
  };

  // Se o pedido foi concluído com sucesso, exibe a tela de confirmação
  if (orderSuccess) {
    return (
      <div className="min-h-screen bg-stone-100 py-10 px-4 sm:px-6 lg:px-8 flex justify-center items-center">
        <div className="w-full max-w-xl bg-white rounded-3xl p-8 shadow-xl border border-stone-200 text-center space-y-6">
          <div className="flex justify-center">
            <div className="h-20 w-20 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 animate-bounce">
              <CheckCircle2 className="h-12 w-12" />
            </div>
          </div>

          <div>
            <span className="text-xs uppercase font-black tracking-widest text-amber-800 bg-amber-100 px-3 py-1 rounded-full">
              Pedido Registrado com Sucesso
            </span>
            <h1 className="mt-3 text-3xl sm:text-4xl font-black text-stone-900">
              Pedido #{orderSuccess.orderNumber}
            </h1>
            <p className="mt-1 text-sm text-stone-500">
              Total do pedido: <strong className="text-stone-900">R$ {orderSuccess.total.toFixed(2)}</strong>
            </p>
          </div>

          {/* Caixa de Ações do Pedido Concluído / Impressão */}
          <div className="bg-stone-50 border border-stone-200 rounded-3xl p-6 text-left space-y-4 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0 mt-0.5">
                <FileText className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-stone-900">
                  Espelho do Pedido para Impressão
                </h3>
                <p className="text-xs text-stone-600 mt-0.5 leading-relaxed">
                  {orderSuccess.hasNegotiatedPrice ? (
                    <>
                      Este pedido contém <strong>valores negociados</strong> e consta no documento como <strong>Aguardando Liberação da Gerência</strong>.
                      Você já pode gerar e imprimir seu pedido abaixo.
                    </>
                  ) : (
                    <>
                      Seu pedido foi registrado no sistema e será confirmado internamente pela equipe para entrar em rota.
                      Você já pode gerar e imprimir sua cópia do pedido abaixo:
                    </>
                  )}
                </p>
              </div>
            </div>

            <a
              href={`/api/public/orders/${orderSuccess.orderId}/pdf`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-700 hover:bg-amber-800 active:bg-amber-900 px-4 py-3.5 text-sm font-black text-white shadow-md hover:shadow-lg transition-all text-center cursor-pointer"
            >
              <Printer className="h-4 w-4" />
              Baixar e Imprimir Pedido (PDF)
            </a>
          </div>

          <div className="pt-4 flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/pedido/consultar"
              className="flex-1 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-800 font-bold px-4 py-3 text-sm transition-all text-center"
            >
              🔍 Consultar Meus Pedidos
            </Link>
            <button
              onClick={() => {
                setOrderSuccess(null);
                setSearchQuery('');
                setSelectedClient(null);
                setCart((prev) => {
                  const reset: Record<string, OrderItemState> = {};
                  for (const [k, v] of Object.entries(prev)) {
                    reset[k] = { ...v, quantity: 0, unitPrice: v.originalPrice };
                  }
                  return reset;
                });
              }}
              className="flex-1 rounded-xl bg-amber-700 hover:bg-amber-800 text-white font-bold px-4 py-3 text-sm transition-all"
            >
              🛒 Fazer Novo Pedido
            </button>
          </div>

          <div className="pt-2 text-center">
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-stone-500 hover:text-amber-800 py-1 transition-colors"
            >
              <LogIn className="h-3.5 w-3.5" />
              Voltar ao Início / Fazer Login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-100 py-8 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Topo / Cabeçalho */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between bg-white rounded-3xl p-6 shadow-sm border border-stone-200 gap-4">
          <div className="flex items-center gap-4">
            <Link href="/" title="Voltar para docesprigor.com.br" className="shrink-0 hover:opacity-85 transition-opacity">
              <Image
                src="/logo.png"
                alt="Doces Prigor Logo"
                width={80}
                height={70}
                priority
                className="h-16 w-auto object-contain cursor-pointer"
              />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-900 px-2.5 py-0.5 rounded-full">
                  Autoatendimento B2B
                </span>
                <span className="text-xs text-stone-500">Doces Prigor</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-stone-900">
                Fazer Pedido Direto
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/pedido/consultar"
              className="flex items-center gap-1.5 text-xs font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-3.5 py-2 rounded-xl transition-all shadow-xs"
            >
              <Search className="h-3.5 w-3.5" />
              Consultar Pedidos
            </Link>
            <Link
              href="/login"
              className="flex items-center gap-1.5 text-xs font-bold text-stone-700 bg-white hover:bg-stone-50 border border-stone-300 px-3.5 py-2 rounded-xl transition-all shadow-xs"
            >
              <LogIn className="h-3.5 w-3.5 text-amber-700" />
              Voltar ao Início / Login
            </Link>
          </div>
        </div>

        {errorMsg && (
          <div className="flex items-center gap-2 rounded-2xl bg-red-50 p-4 text-sm text-red-700 border border-red-200 animate-pulse">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <span className="font-semibold">{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmitOrder} className="space-y-6">
          {/* PASSO 1: IDENTIFICAÇÃO DO CLIENTE */}
          <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-stone-200 space-y-5">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-full bg-amber-100 text-amber-800 font-black flex items-center justify-center text-sm">
                  1
                </div>
                <h2 className="text-base sm:text-lg font-bold text-stone-900">
                  Identificação do Cliente
                </h2>
              </div>

              {/* Alternar modo */}
              <div className="flex bg-stone-100 p-1 rounded-xl text-xs font-bold">
                <button
                  type="button"
                  onClick={() => {
                    setClientMode('busca');
                    setErrorMsg(null);
                  }}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    clientMode === 'busca' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-800'
                  }`}
                >
                  Já sou cliente
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setClientMode('novo');
                    setSelectedClient(null);
                    setErrorMsg(null);
                  }}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    clientMode === 'novo' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-800'
                  }`}
                >
                  Cadastrar Novo
                </button>
              </div>
            </div>

            {clientMode === 'busca' ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-stone-600 uppercase tracking-wider mb-1">
                    Buscar por Razão Social, Nome Fantasia, CNPJ ou CPF
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setSelectedClient(null);
                      }}
                      placeholder="Digite o nome da empresa ou documento..."
                      className="block w-full rounded-xl border border-stone-300 bg-stone-50 py-3 pl-10 pr-4 text-sm text-stone-900 focus:border-amber-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                    />
                    <Search className="absolute left-3 top-3.5 h-4 w-4 text-stone-400" />
                    {searchingClient && (
                      <Loader2 className="absolute right-3 top-3.5 h-4 w-4 animate-spin text-amber-600" />
                    )}
                  </div>
                </div>

                {/* Dropdown de resultados */}
                {searchResults.length > 0 && !selectedClient && (
                  <div className="rounded-2xl border border-stone-200 bg-white p-2 shadow-lg max-h-60 overflow-y-auto divide-y divide-stone-100">
                    {searchResults.map((c) => (
                      <button
                        type="button"
                        key={c.id}
                        onClick={() => {
                          setSelectedClient(c);
                          if (c.seller?.code) {
                            setSellerCode(c.seller.code);
                          }
                          // Regra: para cliente já existente, puxa o telefone do banco de dados
                          setPhone(c.mobile || c.phone || '');
                          setUseCustomAddress(false);
                          setCustomAddress('');
                          setCustomNumber('');
                          setCustomComplement('');
                          setCustomNeighborhood('');
                          setCustomCity(c.city || 'Rio de Janeiro');
                          setCustomState(c.state || 'RJ');
                          setCustomZipCode('');
                        }}
                        className="w-full text-left p-3 hover:bg-amber-50 rounded-xl transition-all cursor-pointer"
                      >
                        <div className="font-bold text-stone-900 text-sm">{c.tradeName}</div>
                        <div className="text-xs text-stone-500 flex flex-wrap gap-x-3">
                          {c.cnpj && <span>CNPJ: {c.cnpj}</span>}
                          {c.cpf && <span>CPF: {c.cpf}</span>}
                          {c.neighborhood && <span>{c.neighborhood} - {c.city || 'RJ'}</span>}
                          {c.seller?.name && <span className="text-amber-700 font-semibold">Vendedor: {c.seller.name}</span>}
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* Cliente Selecionado */}
                {selectedClient && (
                  <div className="space-y-4">
                    <div className="bg-emerald-50/80 border border-emerald-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <UserCheck className="h-4 w-4 text-emerald-600" />
                          <span className="font-bold text-emerald-900 text-sm">{selectedClient.tradeName}</span>
                        </div>
                        <p className="text-xs text-emerald-700 mt-0.5">
                          {selectedClient.cnpj ? `CNPJ: ${selectedClient.cnpj}` : selectedClient.cpf ? `CPF: ${selectedClient.cpf}` : ''}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedClient(null);
                          setUseCustomAddress(false);
                        }}
                        className="text-xs text-stone-500 hover:text-stone-800 underline self-start sm:self-auto cursor-pointer"
                      >
                        Trocar cliente
                      </button>
                    </div>

                    {/* Endereço de Entrega do Cliente Existente */}
                    <div className="bg-stone-50 border border-stone-200 rounded-2xl p-4 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-start gap-2.5">
                          <MapPin className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
                          <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block mb-0.5">
                              Endereço de Entrega Cadastrado
                            </span>
                            <p className="text-xs font-semibold text-stone-800">
                              {selectedClient.address ? (
                                <>
                                  {selectedClient.address}
                                  {selectedClient.number ? `, nº ${selectedClient.number}` : ''}
                                  {selectedClient.complement ? ` (${selectedClient.complement})` : ''} -{' '}
                                  {selectedClient.neighborhood || 'Centro'}, {selectedClient.city || 'Rio de Janeiro'} -{' '}
                                  {selectedClient.state || 'RJ'}
                                </>
                              ) : (
                                'Nenhum endereço principal cadastrado no sistema.'
                              )}
                            </p>
                          </div>
                        </div>

                        <label className="flex items-center gap-2 text-xs font-bold text-amber-900 bg-amber-100/70 hover:bg-amber-100 border border-amber-300 px-3 py-2 rounded-xl cursor-pointer transition-all shrink-0">
                          <input
                            type="checkbox"
                            checked={useCustomAddress}
                            onChange={(e) => setUseCustomAddress(e.target.checked)}
                            className="rounded text-amber-700 focus:ring-amber-500"
                          />
                          Cadastrar novo endereço de entrega
                        </label>
                      </div>

                      {/* Campos para novo endereço de entrega */}
                      {useCustomAddress && (
                        <div className="pt-3 border-t border-stone-200 space-y-3 animate-fadeIn">
                          <div className="text-xs font-bold text-amber-800 flex items-center gap-1.5">
                            <span>📦</span> Novo Local para Entrega deste Pedido:
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div className="sm:col-span-2">
                              <label className="block text-[10px] font-bold text-stone-600 uppercase tracking-wider mb-1">
                                Logradouro / Rua / Avenida <span className="text-red-500">*</span>
                              </label>
                              <input
                                type="text"
                                required={useCustomAddress}
                                value={customAddress}
                                onChange={(e) => setCustomAddress(e.target.value)}
                                placeholder="Ex: Av. Brasil"
                                className="block w-full rounded-xl border border-stone-300 bg-white py-2 px-3 text-xs text-stone-900 focus:border-amber-500 focus:outline-none"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-stone-600 uppercase tracking-wider mb-1">
                                Número
                              </label>
                              <input
                                type="text"
                                value={customNumber}
                                onChange={(e) => setCustomNumber(e.target.value)}
                                placeholder="Ex: 500"
                                className="block w-full rounded-xl border border-stone-300 bg-white py-2 px-3 text-xs text-stone-900 focus:border-amber-500 focus:outline-none"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                              <label className="block text-[10px] font-bold text-stone-600 uppercase tracking-wider mb-1">
                                Bairro <span className="text-red-500">*</span>
                              </label>
                              <input
                                type="text"
                                required={useCustomAddress}
                                value={customNeighborhood}
                                onChange={(e) => setCustomNeighborhood(e.target.value)}
                                placeholder="Ex: Ramos"
                                className="block w-full rounded-xl border border-stone-300 bg-white py-2 px-3 text-xs text-stone-900 focus:border-amber-500 focus:outline-none"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-stone-600 uppercase tracking-wider mb-1">
                                Complemento
                              </label>
                              <input
                                type="text"
                                value={customComplement}
                                onChange={(e) => setCustomComplement(e.target.value)}
                                placeholder="Ex: Galpão 3, Sala 102"
                                className="block w-full rounded-xl border border-stone-300 bg-white py-2 px-3 text-xs text-stone-900 focus:border-amber-500 focus:outline-none"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-stone-600 uppercase tracking-wider mb-1">
                                Cidade / UF
                              </label>
                              <div className="flex gap-1.5">
                                <input
                                  type="text"
                                  value={customCity}
                                  onChange={(e) => setCustomCity(e.target.value)}
                                  className="block w-full rounded-xl border border-stone-300 bg-white py-2 px-3 text-xs text-stone-900 focus:border-amber-500 focus:outline-none"
                                />
                                <input
                                  type="text"
                                  value={customState}
                                  onChange={(e) => setCustomState(e.target.value)}
                                  className="block w-14 text-center rounded-xl border border-stone-300 bg-white py-2 px-2 text-xs text-stone-900 focus:border-amber-500 focus:outline-none"
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Campo de WhatsApp/Telefone */}
                <div>
                  <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1">
                    WhatsApp / Telefone para Contato <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(21) 99999-9999"
                    className="block w-full sm:w-72 rounded-xl border border-stone-300 bg-stone-50 py-2.5 px-3 text-sm text-stone-900 focus:border-amber-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                  />
                  <p className="text-[11px] text-stone-500 mt-1">
                    {selectedClient
                      ? 'Preenchido automaticamente com o contato cadastrado. Atualize se necessário.'
                      : 'Usado para confirmação da entrega e envio do espelho do pedido.'}
                  </p>
                </div>
              </div>
            ) : (
              /* MODO NOVO CADASTRO */
              <div className="space-y-4">
                <div className="flex gap-4 items-center">
                  <label className="flex items-center gap-2 text-xs font-bold text-stone-700 cursor-pointer">
                    <input
                      type="radio"
                      name="docType"
                      checked={docType === 'cnpj'}
                      onChange={() => setDocType('cnpj')}
                      className="text-amber-700 focus:ring-amber-500"
                    />
                    Pessoa Jurídica (CNPJ)
                  </label>
                  <label className="flex items-center gap-2 text-xs font-bold text-stone-700 cursor-pointer">
                    <input
                      type="radio"
                      name="docType"
                      checked={docType === 'cpf'}
                      onChange={() => setDocType('cpf')}
                      className="text-amber-700 focus:ring-amber-500"
                    />
                    Pessoa Física (CPF)
                  </label>
                </div>

                {docType === 'cnpj' ? (
                  <div>
                    <label className="block text-xs font-bold text-stone-600 uppercase tracking-wider mb-1">
                      CNPJ da Empresa
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={docValue}
                        onChange={(e) => setDocValue(e.target.value)}
                        placeholder="00.000.000/0000-00"
                        className="block w-full rounded-xl border border-stone-300 bg-stone-50 py-2.5 px-3 text-sm text-stone-900 focus:border-amber-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                      />
                      <button
                        type="button"
                        disabled={loadingCnpj}
                        onClick={handleConsultarCnpj}
                        className="rounded-xl bg-amber-700 hover:bg-amber-800 text-white font-bold px-4 py-2.5 text-xs shrink-0 flex items-center gap-1.5 transition-all disabled:opacity-50"
                      >
                        {loadingCnpj ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                        Buscar Dados
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-bold text-stone-600 uppercase tracking-wider mb-1">
                      CPF
                    </label>
                    <input
                      type="text"
                      value={docValue}
                      onChange={(e) => setDocValue(e.target.value)}
                      placeholder="000.000.000-00"
                      className="block w-full rounded-xl border border-stone-300 bg-stone-50 py-2.5 px-3 text-sm text-stone-900 focus:border-amber-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                    />
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1">
                      Nome Fantasia / Estabelecimento <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={tradeName}
                      onChange={(e) => setTradeName(e.target.value)}
                      placeholder="Ex: Padaria Bela Vista"
                      className="block w-full rounded-xl border border-stone-300 bg-stone-50 py-2.5 px-3 text-sm text-stone-900 focus:border-amber-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1">
                      Razão Social
                    </label>
                    <input
                      type="text"
                      value={legalName}
                      onChange={(e) => setLegalName(e.target.value)}
                      placeholder="Razão social completa"
                      className="block w-full rounded-xl border border-stone-300 bg-stone-50 py-2.5 px-3 text-sm text-stone-900 focus:border-amber-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1">
                      Endereço de Entrega <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="Rua, Avenida, etc."
                      className="block w-full rounded-xl border border-stone-300 bg-stone-50 py-2.5 px-3 text-sm text-stone-900 focus:border-amber-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1">
                      Número
                    </label>
                    <input
                      type="text"
                      value={number}
                      onChange={(e) => setNumber(e.target.value)}
                      placeholder="123"
                      className="block w-full rounded-xl border border-stone-300 bg-stone-50 py-2.5 px-3 text-sm text-stone-900 focus:border-amber-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1">
                      Bairro <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={neighborhood}
                      onChange={(e) => setNeighborhood(e.target.value)}
                      placeholder="Ex: São Cristóvão"
                      className="block w-full rounded-xl border border-stone-300 bg-stone-50 py-2.5 px-3 text-sm text-stone-900 focus:border-amber-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1">
                      Cidade / UF
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        className="block w-full rounded-xl border border-stone-300 bg-stone-50 py-2.5 px-3 text-sm text-stone-900 focus:border-amber-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                      />
                      <input
                        type="text"
                        value={state}
                        onChange={(e) => setState(e.target.value)}
                        className="block w-16 text-center rounded-xl border border-stone-300 bg-stone-50 py-2.5 px-2 text-sm text-stone-900 focus:border-amber-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1">
                      WhatsApp / Telefone <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="tel"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="(21) 99999-9999"
                      className="block w-full rounded-xl border border-stone-300 bg-stone-50 py-2.5 px-3 text-sm text-stone-900 focus:border-amber-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* PASSO 2: CÓDIGO DO VENDEDOR */}
          <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-stone-200 space-y-4">
            <div className="flex items-center gap-2.5 border-b border-stone-100 pb-3">
              <div className="h-8 w-8 rounded-full bg-amber-100 text-amber-800 font-black flex items-center justify-center text-sm">
                2
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-bold text-stone-900">
                  Vendedor Responsável
                </h2>
                <p className="text-xs text-stone-500">
                  Informe o código do seu vendedor para vincular o atendimento e a comissão dele.
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex-1">
                <input
                  type="text"
                  disabled={directFactory}
                  value={sellerCode}
                  onChange={(e) => setSellerCode(e.target.value)}
                  placeholder="Ex: 101, 102..."
                  className="block w-full sm:w-64 rounded-xl border border-stone-300 bg-stone-50 py-2.5 px-3 text-sm font-bold uppercase text-stone-900 placeholder-stone-400 focus:border-amber-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 disabled:opacity-50"
                />
              </div>

              <label className="flex items-center gap-2 text-xs font-bold text-stone-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={directFactory}
                  onChange={(e) => setDirectFactory(e.target.checked)}
                  className="rounded text-amber-700 focus:ring-amber-500"
                />
                Não tenho código / Atendimento Direto da Fábrica
              </label>
            </div>

            {sellerStatus === 'valid' && sellerInfo && (
              <div className="flex items-center gap-2 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl px-3.5 py-2 text-xs font-bold">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>Vendedor Vinculado: {sellerInfo.name} (Código {sellerInfo.code || sellerCode})</span>
              </div>
            )}

            {sellerStatus === 'invalid' && !directFactory && (
              <div className="text-xs text-red-600 font-semibold">
                Código de vendedor não localizado. Verifique com seu vendedor ou marque atendimento direto.
              </div>
            )}
          </div>

          {/* PASSO 3: PRODUTOS & PREÇOS */}
          <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-stone-200 space-y-4">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-full bg-amber-100 text-amber-800 font-black flex items-center justify-center text-sm">
                  3
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-stone-900">
                    Produtos & Quantidades
                  </h2>
                  <p className="text-xs text-stone-500">
                    Escolha os produtos e confira os valores. O preço unitário pode ser editado se houver negociação prévia.
                  </p>
                </div>
              </div>
            </div>

            {loadingProducts ? (
              <div className="py-10 text-center text-stone-400">
                <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-amber-700" />
                Carregando catálogo de delícias...
              </div>
            ) : products.length === 0 ? (
              <div className="py-8 text-center text-stone-500 bg-stone-50 rounded-2xl border border-stone-200">
                Nenhum produto disponível no portal no momento.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {products.map((prod) => {
                  const item = cart[prod.id] || {
                    productId: prod.id,
                    quantity: 0,
                    unitPrice: prod.salePrice,
                    originalPrice: prod.salePrice,
                  };
                  const isSelected = item.quantity > 0;
                  const isModified = Math.abs(item.unitPrice - item.originalPrice) > 0.009;

                  return (
                    <div
                      key={prod.id}
                      className={`relative rounded-3xl p-6 transition-all border flex flex-col justify-between ${
                        isSelected
                          ? 'border-amber-400 bg-amber-50/40 shadow-md ring-2 ring-amber-400/20'
                          : 'border-stone-200 bg-white hover:border-amber-200 hover:shadow-xs'
                      }`}
                    >
                      {/* Topo do Card */}
                      <div>
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="flex items-center gap-2">
                            <div className={`h-10 w-10 rounded-2xl flex items-center justify-center shrink-0 ${
                              isSelected ? 'bg-amber-600 text-white shadow-xs' : 'bg-amber-100 text-amber-800'
                            }`}>
                              <Sparkles className="h-5 w-5" />
                            </div>
                            <div>
                              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 bg-amber-100 px-2 py-0.5 rounded-md">
                                {prod.category || 'Doces Prigor'} · {prod.unit}
                              </span>
                            </div>
                          </div>

                          {isSelected ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-black text-emerald-800 bg-emerald-100 px-2.5 py-1 rounded-full">
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                              Selecionado
                            </span>
                          ) : (
                            <span className="text-[11px] font-bold text-stone-400">
                              Não selecionado
                            </span>
                          )}
                        </div>

                        <h3 className="font-extrabold text-stone-900 text-base sm:text-lg mt-2">
                          {prod.name}
                        </h3>

                        {prod.description && (
                          <p className="text-xs text-stone-500 mt-1 line-clamp-2">
                            {prod.description}
                          </p>
                        )}

                        <div className="mt-3 flex items-baseline gap-2 pb-3 border-b border-stone-100">
                          <span className="text-xs text-stone-400 font-bold uppercase tracking-wider">
                            Preço de Tabela:
                          </span>
                          <span className="text-xl font-black text-stone-900">
                            R$ {prod.salePrice.toFixed(2)}
                          </span>
                          <span className="text-xs text-stone-400 font-semibold">/ {prod.unit}</span>
                        </div>
                      </div>

                      {/* Controles de Seleção e Quantidade */}
                      <div className="mt-4 pt-1">
                        {!isSelected ? (
                          <button
                            type="button"
                            onClick={() => handleQuantityChange(prod.id, 1)}
                            className="w-full py-3 px-4 rounded-2xl bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-900 font-extrabold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs"
                          >
                            <Plus className="h-4 w-4 text-amber-700" />
                            Selecionar este Produto
                          </button>
                        ) : (
                          <div className="space-y-3 bg-white p-3.5 rounded-2xl border border-amber-200">
                            <div className="grid grid-cols-2 gap-3 items-center">
                              {/* Quantidade */}
                              <div>
                                <label className="text-[10px] font-bold uppercase tracking-wider text-stone-500 block mb-1">
                                  Quantidade ({prod.unit})
                                </label>
                                <div className="flex items-center border border-stone-300 rounded-xl bg-stone-50 overflow-hidden">
                                  <button
                                    type="button"
                                    onClick={() => handleQuantityChange(prod.id, -1)}
                                    className="px-2.5 py-2 hover:bg-stone-200 text-stone-700 transition-all cursor-pointer"
                                  >
                                    <Minus className="h-3.5 w-3.5" />
                                  </button>
                                  <input
                                    type="number"
                                    min="0"
                                    value={item.quantity}
                                    onChange={(e) => {
                                      const val = parseInt(e.target.value) || 0;
                                      setCart((prev) => ({
                                        ...prev,
                                        [prod.id]: { ...item, quantity: Math.max(0, val) },
                                      }));
                                    }}
                                    className="w-full text-center bg-transparent text-xs font-black text-stone-900 focus:outline-none"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleQuantityChange(prod.id, 1)}
                                    className="px-2.5 py-2 hover:bg-stone-200 text-stone-700 transition-all cursor-pointer"
                                  >
                                    <Plus className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>

                              {/* Preço Unitário Editável */}
                              <div>
                                <label className="text-[10px] font-bold uppercase tracking-wider text-stone-500 block mb-1">
                                  Preço Un. Negociado (R$)
                                </label>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={item.rawPrice !== undefined ? item.rawPrice : item.unitPrice.toFixed(2).replace('.', ',')}
                                  onChange={(e) => handlePriceChange(prod.id, e.target.value)}
                                  onBlur={() => handlePriceBlur(prod.id)}
                                  placeholder="0,00"
                                  className={`w-full text-right rounded-xl border py-2 px-2.5 text-xs font-black transition-all ${
                                    isModified
                                      ? 'border-amber-500 bg-amber-50 text-amber-950 ring-1 ring-amber-400'
                                      : 'border-stone-300 bg-stone-50 text-stone-900'
                                  }`}
                                />
                              </div>
                            </div>

                            {/* Subtotal e Remover */}
                            <div className="flex items-center justify-between pt-2 border-t border-stone-100">
                              <button
                                type="button"
                                onClick={() => handleQuantityChange(prod.id, -item.quantity)}
                                className="text-[11px] font-bold text-red-650 hover:text-red-800 flex items-center gap-1 cursor-pointer"
                              >
                                <Trash2 className="h-3 w-3" />
                                Remover
                              </button>

                              <div className="text-right">
                                <span className="text-[10px] font-bold uppercase text-stone-400 mr-1.5">
                                  Subtotal:
                                </span>
                                <span className="text-sm font-black text-amber-900">
                                  R$ {(item.quantity * item.unitPrice).toFixed(2)}
                                </span>
                              </div>
                            </div>

                            {isModified && (
                              <p className="text-[10px] text-amber-800 font-semibold bg-amber-100/70 rounded-lg p-1.5 text-center">
                                Preço unitário ajustado (requer aprovação da gerência)
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Aviso de Preço Negociado */}
            {hasCustomPrice && (
              <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 flex items-start gap-2.5 text-xs text-amber-800">
                <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <strong className="font-bold">Atenção sobre valor negociado:</strong> Um ou mais produtos possuem preço diferente da tabela oficial.
                  O pedido passará por <strong>aprovação da gerência</strong> antes que a impressão do espelho seja liberada.
                </div>
              </div>
            )}
          </div>

          {/* PASSO 4: ENTREGA & FORMA DE PAGAMENTO */}
          <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-stone-200 space-y-4">
            <div className="flex items-center gap-2.5 border-b border-stone-100 pb-3">
              <div className="h-8 w-8 rounded-full bg-amber-100 text-amber-800 font-black flex items-center justify-center text-sm">
                4
              </div>
              <h2 className="text-base sm:text-lg font-bold text-stone-900">
                Entrega & Condições de Pagamento
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1">
                  Data Desejada de Entrega
                </label>
                <div className="relative">
                  <input
                    type="date"
                    value={deliveryDate}
                    onChange={(e) => setDeliveryDate(e.target.value)}
                    className="block w-full rounded-xl border border-stone-300 bg-stone-50 py-2.5 pl-10 pr-3 text-sm text-stone-900 focus:border-amber-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                  />
                  <Calendar className="absolute left-3 top-3 h-4 w-4 text-stone-400" />
                </div>
                <p className="text-[11px] text-stone-500 mt-1">
                  Sujeito à rota de entrega do bairro confirmada pela gerência.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1">
                  Forma de Pagamento Pretendida
                </label>
                <select
                  value={effectivePaymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="block w-full rounded-xl border border-stone-300 bg-stone-50 py-2.5 px-3 text-sm font-semibold text-stone-900 focus:border-amber-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                >
                  <option value="Pix">PIX</option>
                  <option value="Boleto 7 dias">Boleto Bancário (7 dias)</option>
                  <option value="Boleto 14 dias">Boleto Bancário (14 dias)</option>
                  <option value="Cartão de Crédito">Cartão de Crédito</option>
                  <option value="Cartão de Débito">Cartão de Débito</option>
                  <option value="Dinheiro">Dinheiro na entrega</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1">
                Sabores Específicos & Observações do Pedido
              </label>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ex: 10 Tradicionais, 10 Doce de Leite, 5 Nutella... Entregar no período da manhã."
                className="block w-full rounded-xl border border-stone-300 bg-stone-50 py-2.5 px-3 text-sm text-stone-900 focus:border-amber-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20"
              />
              <p className="text-[11px] text-stone-500 mt-1">
                Caso deseje especificar a divisão exata dos sabores para os brownies ou instruções de entrega, informe acima.
              </p>
            </div>
          </div>

          {/* BARRA FIXA / RESUMO FINAL E BOTÃO DE ENVIO */}
          <div className="bg-amber-900 text-white rounded-3xl p-6 sm:p-8 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div>
              <div className="text-xs uppercase font-bold tracking-widest text-amber-300">
                Resumo do Pedido
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-3xl sm:text-4xl font-black">
                  R$ {totalValue.toFixed(2)}
                </span>
                <span className="text-xs text-amber-200 font-medium">
                  ({totalQuantity} {totalQuantity === 1 ? 'item' : 'itens'} selecionados)
                </span>
              </div>
              {hasCustomPrice && (
                <div className="mt-1 text-[11px] text-amber-300 flex items-center gap-1 font-semibold">
                  <span>⚠️</span> Contém preços negociados (aprovação necessária para impressão)
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={submitting || totalQuantity === 0}
              className="flex items-center justify-center gap-2 rounded-2xl bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-amber-950 font-black px-8 py-4 text-base shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Enviando Pedido...
                </>
              ) : (
                <>
                  <ShoppingCart className="h-5 w-5" />
                  Finalizar e Enviar Pedido
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
