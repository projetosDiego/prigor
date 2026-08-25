'use client';

import React, { useEffect, useState } from 'react';
import { 
  Package, 
  Plus, 
  Search, 
  Edit, 
  Trash2, 
  AlertTriangle, 
  Loader2,
  RefreshCw,
  X,
  Utensils,
  DollarSign,
  Layers
} from 'lucide-react';

interface IngredienteOut {
  id?: string;
  insumo_id: string;
  insumo_nome: string;
  insumo_unidade: string;
  insumo_custo: number;
  quantidade: number;
  observacao?: string;
}

interface Produto {
  id: string;
  sku?: string;
  codigo_barras?: string;
  nome: string;
  categoria?: string;
  unidade: string;
  preco_venda: number;
  preco_atacado: number;
  qtd_min_atacado: number;
  custo: number;
  estoque: number;
  estoque_minimo: number;
  ativo: boolean;
  ingredientes?: IngredienteOut[];
}

interface Insumo {
  id: string;
  nome: string;
  unidade: string;
  custo: number;
}

export default function ProductsPage() {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [insumosList, setInsumosList] = useState<Insumo[]>([]); // Para montar as fichas técnicas
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [categories, setCategories] = useState<string[]>([]);

  // Estado do Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  
  // Form Fields
  const [nome, setNome] = useState('');
  const [sku, setSku] = useState('');
  const [codigoBarras, setCodigoBarras] = useState('');
  const [categoria, setCategoria] = useState('');
  const [unidade, setUnidade] = useState('un');
  const [precoVenda, setPrecoVenda] = useState('0');
  const [precoAtacado, setPrecoAtacado] = useState('0');
  const [qtdMinAtacado, setQtdMinAtacado] = useState('0');
  const [estoque, setEstoque] = useState('0');
  const [estoqueMinimo, setEstoqueMinimo] = useState('0');
  
  // Ingredientes do Produto (Ficha Técnica)
  const [ingredientes, setIngredientes] = useState<any[]>([]);
  const [selectedInsumoId, setSelectedInsumoId] = useState('');
  const [ingredienteQtd, setIngredienteQtd] = useState('0');
  const [ingredienteObs, setIngredienteObs] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Carrega produtos de venda
      const resProd = await fetch('/api/erp/produtos?tipo=venda');
      if (!resProd.ok) throw new Error('Falha ao carregar produtos.');
      const dataProd = await resProd.json();
      setProdutos(dataProd);
      
      // Carrega insumos disponíveis
      const resInsumo = await fetch('/api/erp/produtos?tipo=insumo');
      if (resInsumo.ok) {
        const dataInsumo = await resInsumo.json();
        setInsumosList(dataInsumo);
        if (dataInsumo.length > 0) {
          setSelectedInsumoId(dataInsumo[0].id);
        }
      }

      // Extrai categorias de produtos
      const cats: string[] = Array.from(new Set(dataProd.map((p: Produto) => p.categoria).filter(Boolean))) as string[];
      setCategories(cats);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreateModal = () => {
    setModalMode('create');
    setSelectedId(null);
    setNome('');
    setSku('');
    setCodigoBarras('');
    setCategoria('');
    setUnidade('un');
    setPrecoVenda('0');
    setPrecoAtacado('0');
    setQtdMinAtacado('0');
    setEstoque('0');
    setEstoqueMinimo('0');
    setIngredientes([]);
    setIngredienteQtd('0');
    setIngredienteObs('');
    setIsModalOpen(true);
  };

  const handleOpenEditModal = async (produto: Produto) => {
    setModalMode('edit');
    setSelectedId(produto.id);
    setNome(produto.nome);
    setSku(produto.sku || '');
    setCodigoBarras(produto.codigo_barras || '');
    setCategoria(produto.categoria || '');
    setUnidade(produto.unidade);
    setPrecoVenda(String(produto.preco_venda));
    setPrecoAtacado(String(produto.preco_atacado));
    setQtdMinAtacado(String(produto.qtd_min_atacado));
    setEstoque(String(produto.estoque));
    setEstoqueMinimo(String(produto.estoque_minimo));
    
    // Carrega ingredientes (receita) do produto completo
    try {
      const res = await fetch(`/api/erp/produtos/${produto.id}`);
      if (res.ok) {
        const fullProd = await res.json();
        setIngredientes(fullProd.ingredientes || []);
      } else {
        setIngredientes(produto.ingredientes || []);
      }
    } catch {
      setIngredientes(produto.ingredientes || []);
    }
    
    setIsModalOpen(true);
  };

  // Funções da Receita / Ficha Técnica
  const handleAddIngrediente = () => {
    if (!selectedInsumoId || parseFloat(ingredienteQtd) <= 0) return;
    const insumo = insumosList.find(i => i.id === selectedInsumoId);
    if (!insumo) return;

    // Evita duplicados na lista visual
    if (ingredientes.some(i => i.insumo_id === selectedInsumoId)) {
      alert('Este insumo já foi adicionado à receita.');
      return;
    }

    const novoIng = {
      insumo_id: insumo.id,
      insumo_nome: insumo.nome,
      insumo_unidade: insumo.unidade,
      insumo_custo: insumo.custo,
      quantidade: parseFloat(ingredienteQtd),
      observacao: ingredienteObs || undefined
    };

    setIngredientes([...ingredientes, novoIng]);
    setIngredienteQtd('0');
    setIngredienteObs('');
  };

  const handleRemoveIngrediente = (insumoId: string) => {
    setIngredientes(ingredientes.filter(i => i.insumo_id !== insumoId));
  };

  // Calcula custo de produção estimado
  const calculatedCost = ingredientes.reduce((sum, ing) => {
    return sum + (ing.quantidade * (ing.insumo_custo || 0));
  }, 0);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome) return;

    // Envia ingredientes simplificados no formato de input (insumo_id, quantidade, observacao)
    const ingsPayload = ingredientes.map(i => ({
      insumo_id: i.insumo_id,
      quantidade: i.quantidade,
      observacao: i.observacao
    }));

    const payload = {
      nome,
      sku: sku || undefined,
      codigo_barras: codigoBarras || undefined,
      categoria: categoria || undefined,
      tipo: 'venda',
      unidade,
      preco_venda: parseFloat(precoVenda) || 0,
      preco_atacado: parseFloat(precoAtacado) || 0,
      qtd_min_atacado: parseFloat(qtdMinAtacado) || 0,
      estoque: parseFloat(estoque) || 0,
      estoque_minimo: parseFloat(estoqueMinimo) || 0,
      ingredientes: ingsPayload,
      ativo: true
    };

    try {
      const url = modalMode === 'create' ? '/api/erp/produtos' : `/api/erp/produtos/${selectedId}`;
      const method = modalMode === 'create' ? 'POST' : 'PUT';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.detail || 'Erro ao salvar produto.');
      }

      setIsModalOpen(false);
      fetchData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Tem certeza que deseja arquivar o produto "${name}"?`)) return;
    try {
      const res = await fetch(`/api/erp/produtos/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Erro ao arquivar produto.');
      fetchData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Filtros
  const filteredProdutos = produtos.filter(prod => {
    const matchesSearch = prod.nome.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (prod.sku && prod.sku.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (prod.codigo_barras && prod.codigo_barras.includes(searchQuery));
    const matchesCategory = !categoryFilter || prod.categoria === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-stone-900 tracking-tight flex items-center gap-2">
            <Package className="h-6 w-6 text-amber-700" />
            Produtos Acabados
          </h2>
          <p className="text-xs text-stone-500 font-medium">Cardápio de revenda, precificação e margem de contribuição</p>
        </div>
        <button 
          onClick={handleOpenCreateModal}
          className="rounded-lg bg-amber-700 px-4 py-2 text-white font-bold text-xs hover:bg-amber-800 transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
        >
          <Plus className="h-4 w-4" />
          Novo Produto
        </button>
      </div>

      {/* Filtros */}
      <div className="rounded-xl bg-white p-4 shadow-sm border border-stone-200 flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative w-full md:max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-stone-400" />
          <input 
            type="text"
            placeholder="Buscar produto por nome, SKU, barras..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-stone-200 text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 bg-stone-50/50"
          />
        </div>

        <div className="flex gap-3 w-full md:w-auto items-center">
          <select 
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded-lg border border-stone-200 text-xs px-3 py-2 bg-stone-50/50 focus:outline-none"
          >
            <option value="">Todas Categorias</option>
            {categories.map((c, idx) => (
              <option key={idx} value={c}>{c}</option>
            ))}
          </select>

          <button 
            onClick={fetchData}
            title="Recarregar"
            className="p-2 border border-stone-200 rounded-lg bg-stone-50/50 hover:bg-stone-100 transition-all text-stone-500 cursor-pointer"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Tabela de Produtos */}
      {loading ? (
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2">
          <Loader2 className="h-8 w-8 animate-spin text-amber-700" />
          <p className="text-sm text-stone-500 font-medium">Compilando catálogo de produtos...</p>
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-800 max-w-xl mx-auto mt-4">
          <h3 className="font-bold text-base flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Falha de Conexão
          </h3>
          <p className="mt-2 text-sm">{error}</p>
          <button onClick={fetchData} className="mt-4 rounded-lg bg-red-750 px-4 py-2 text-white font-semibold text-xs hover:bg-red-800 transition-all cursor-pointer">
            Tentar novamente
          </button>
        </div>
      ) : filteredProdutos.length === 0 ? (
        <div className="text-center py-12 rounded-xl bg-white border border-stone-200 shadow-sm">
          <Package className="h-12 w-12 text-stone-300 mx-auto mb-3" />
          <p className="text-stone-500 text-sm font-semibold">Nenhum produto cadastrado</p>
          <p className="text-stone-400 text-xs mt-1">Crie um novo produto para iniciar as vendas.</p>
        </div>
      ) : (
        <div className="rounded-2xl bg-white shadow-sm border border-stone-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50 text-stone-400 font-bold uppercase tracking-wider">
                  <th className="py-3 px-6">Produto / SKU</th>
                  <th className="py-3 px-6">Categoria</th>
                  <th className="py-3 px-6 text-right">Custo Fab.</th>
                  <th className="py-3 px-6 text-right">Venda Varejo</th>
                  <th className="py-3 px-6 text-right">Atacado</th>
                  <th className="py-3 px-6 text-center">Lucro (Margem)</th>
                  <th className="py-3 px-6 text-center">Estoque</th>
                  <th className="py-3 px-6 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 font-semibold text-stone-700">
                {filteredProdutos.map((prod) => {
                  const markup = prod.preco_venda > 0 ? ((prod.preco_venda - prod.custo) / prod.preco_venda) * 100 : 0;
                  const isLowStock = prod.estoque_minimo > 0 && prod.estoque <= prod.estoque_minimo;
                  
                  return (
                    <tr key={prod.id} className="hover:bg-stone-50/50">
                      <td className="py-4 px-6">
                        {prod.sku && <span className="text-[10px] text-stone-400 font-bold block mb-0.5">{prod.sku}</span>}
                        <span className="text-stone-850 font-bold text-sm block">{prod.nome}</span>
                      </td>
                      <td className="py-4 px-6 text-stone-500">{prod.categoria || '—'}</td>
                      <td className="py-4 px-6 text-right text-stone-500">
                        {prod.custo.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </td>
                      <td className="py-4 px-6 text-right text-stone-850">
                        {prod.preco_venda.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </td>
                      <td className="py-4 px-6 text-right text-stone-850">
                        {prod.preco_atacado > 0 ? (
                          <div>
                            <span>{prod.preco_atacado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                            <span className="text-[9px] text-stone-400 block">Met. {prod.qtd_min_atacado} un</span>
                          </div>
                        ) : '—'}
                      </td>
                      <td className="py-4 px-6 text-center">
                        <span className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-black ${
                          markup >= 50 ? 'bg-emerald-50 text-emerald-700' : markup >= 30 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'
                        }`}>
                          {markup.toFixed(0)}% margem
                        </span>
                      </td>
                      <td className="py-4 px-6 text-center">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black ${
                          isLowStock ? 'bg-red-50 text-red-700 border border-red-100' : 'bg-stone-50 text-stone-800'
                        }`}>
                          {isLowStock && <AlertTriangle className="h-3.5 w-3.5 text-red-650" />}
                          {prod.estoque} un
                        </span>
                      </td>
                      <td className="py-4 px-6 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button 
                            onClick={() => handleOpenEditModal(prod)}
                            className="p-1.5 border border-stone-200 rounded-lg hover:bg-stone-50 hover:text-stone-900 text-stone-400 transition-all cursor-pointer"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          <button 
                            onClick={() => handleDelete(prod.id, prod.nome)}
                            className="p-1.5 border border-stone-200 rounded-lg hover:bg-red-50 hover:text-red-750 text-stone-400 transition-all cursor-pointer"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Criar / Editar */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-stone-200 shadow-xl w-full max-w-2xl overflow-hidden my-8 animate-scaleIn">
            <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100">
              <h3 className="font-extrabold text-stone-900 text-base">
                {modalMode === 'create' ? 'Cadastrar Novo Produto' : 'Editar Produto'}
              </h3>
              <button 
                onClick={() => setIsModalOpen(false)} 
                className="p-1 hover:bg-stone-50 rounded-lg text-stone-400 hover:text-stone-600 transition-all cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <form onSubmit={handleSave} className="p-6 space-y-5">
              {/* Form Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <label className="text-[10px] text-stone-400 font-bold uppercase tracking-wider block mb-1">Nome do Produto *</label>
                  <input 
                    type="text"
                    required
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    placeholder="Ex: Brownie Recheado Doce de Leite 7x5"
                    className="w-full px-3 py-2 rounded-lg border border-stone-200 text-xs focus:ring-1 focus:ring-amber-500 bg-stone-50/50"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-stone-400 font-bold uppercase tracking-wider block mb-1">Código SKU</label>
                  <input 
                    type="text"
                    value={sku}
                    onChange={(e) => setSku(e.target.value)}
                    placeholder="Ex: BRW-DOC-75"
                    className="w-full px-3 py-2 rounded-lg border border-stone-200 text-xs focus:ring-1 focus:ring-amber-500 bg-stone-50/50"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-stone-400 font-bold uppercase tracking-wider block mb-1">Código de Barras</label>
                  <input 
                    type="text"
                    value={codigoBarras}
                    onChange={(e) => setCodigoBarras(e.target.value)}
                    placeholder="EAN-13"
                    className="w-full px-3 py-2 rounded-lg border border-stone-200 text-xs focus:ring-1 focus:ring-amber-500 bg-stone-50/50"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-stone-400 font-bold uppercase tracking-wider block mb-1">Categoria</label>
                  <input 
                    type="text"
                    value={categoria}
                    onChange={(e) => setCategoria(e.target.value)}
                    placeholder="Ex: Brownies, Bolos"
                    className="w-full px-3 py-2 rounded-lg border border-stone-200 text-xs focus:ring-1 focus:ring-amber-500 bg-stone-50/50"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-stone-400 font-bold uppercase tracking-wider block mb-1">Unidade</label>
                  <input 
                    type="text"
                    value={unidade}
                    onChange={(e) => setUnidade(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-stone-200 text-xs focus:ring-1 focus:ring-amber-500 bg-stone-50/50"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-stone-400 font-bold uppercase tracking-wider block mb-1">Preço Venda Varejo (R$) *</label>
                  <input 
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={precoVenda}
                    onChange={(e) => setPrecoVenda(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-stone-200 text-xs focus:ring-1 focus:ring-amber-500 bg-stone-50/50"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-stone-400 font-bold uppercase tracking-wider block mb-1">Preço Venda Atacado (R$)</label>
                  <input 
                    type="number"
                    step="0.01"
                    min="0"
                    value={precoAtacado}
                    onChange={(e) => setPrecoAtacado(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-stone-200 text-xs focus:ring-1 focus:ring-amber-500 bg-stone-50/50"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-stone-400 font-bold uppercase tracking-wider block mb-1">Qtd Mínima Atacado</label>
                  <input 
                    type="number"
                    min="0"
                    value={qtdMinAtacado}
                    onChange={(e) => setQtdMinAtacado(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-stone-200 text-xs focus:ring-1 focus:ring-amber-500 bg-stone-50/50"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-stone-400 font-bold uppercase tracking-wider block mb-1">Estoque Inicial</label>
                  <input 
                    type="number"
                    min="0"
                    disabled={modalMode === 'edit'}
                    value={estoque}
                    onChange={(e) => setEstoque(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-stone-200 text-xs focus:ring-1 focus:ring-amber-500 bg-stone-50/50 disabled:bg-stone-100 disabled:text-stone-400"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-stone-400 font-bold uppercase tracking-wider block mb-1">Estoque de Segurança</label>
                  <input 
                    type="number"
                    min="0"
                    value={estoqueMinimo}
                    onChange={(e) => setEstoqueMinimo(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-stone-200 text-xs focus:ring-1 focus:ring-amber-500 bg-stone-50/50"
                  />
                </div>

                <div className="bg-amber-50/50 rounded-lg p-3 border border-amber-100 flex items-center gap-3">
                  <DollarSign className="h-5 w-5 text-amber-700 shrink-0" />
                  <div className="text-[11px] font-semibold text-stone-700">
                    <span className="block text-[10px] text-amber-800 font-black uppercase">Custo Fabricação Estimado</span>
                    <span className="text-sm font-black text-amber-900">
                      {calculatedCost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>

              {/* Ficha Técnica / Receitas */}
              <div className="rounded-xl border border-stone-200 p-4 space-y-3 bg-stone-50/30">
                <h4 className="text-xs font-black text-stone-850 uppercase tracking-wider flex items-center gap-1">
                  <Utensils className="h-4 w-4 text-amber-700" />
                  Ficha Técnica (Receita)
                </h4>

                {/* Seleção de Insumo */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                  <div className="md:col-span-2">
                    <label className="text-[9px] text-stone-400 font-bold uppercase block mb-1">Escolher Insumo</label>
                    <select 
                      value={selectedInsumoId}
                      onChange={(e) => setSelectedInsumoId(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-stone-200 text-xs bg-white focus:outline-none"
                    >
                      {insumosList.length === 0 ? (
                        <option value="">Nenhum insumo disponível</option>
                      ) : (
                        insumosList.map((insumo) => (
                          <option key={insumo.id} value={insumo.id}>
                            {insumo.nome} ({insumo.unidade}) - Custo: {insumo.custo.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </option>
                        ))
                      )}
                    </select>
                  </div>

                  <div>
                    <label className="text-[9px] text-stone-400 font-bold uppercase block mb-1">Quantidade</label>
                    <input 
                      type="number"
                      step="0.001"
                      min="0"
                      value={ingredienteQtd}
                      onChange={(e) => setIngredienteQtd(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-stone-200 text-xs bg-white focus:outline-none"
                    />
                  </div>

                  <button 
                    type="button"
                    onClick={handleAddIngrediente}
                    className="rounded-lg bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs py-2 px-3 text-center cursor-pointer transition-all shrink-0 h-9 flex items-center justify-center"
                  >
                    Adicionar
                  </button>
                </div>

                {/* Lista de Ingredientes Inseridos */}
                <div className="border border-stone-200 bg-white rounded-xl overflow-hidden max-h-40 overflow-y-auto">
                  {ingredientes.length === 0 ? (
                    <div className="text-center py-6 text-stone-400 text-xs font-semibold">
                      Nenhum ingrediente adicionado à receita.
                    </div>
                  ) : (
                    <table className="w-full text-left text-[11px]">
                      <thead className="bg-stone-50 text-stone-400 font-bold uppercase border-b border-stone-150">
                        <tr>
                          <th className="py-2 px-4">Ingrediente</th>
                          <th className="py-2 px-4 text-center">Quantidade</th>
                          <th className="py-2 px-4 text-right">Custo Relativo</th>
                          <th className="py-2 px-4 text-center">Excluir</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100 font-semibold text-stone-600">
                        {ingredientes.map((ing, idx) => {
                          const costRel = ing.quantidade * (ing.insumo_custo || 0);
                          return (
                            <tr key={idx} className="hover:bg-stone-50/50">
                              <td className="py-2 px-4 text-stone-800 font-bold">{ing.insumo_nome}</td>
                              <td className="py-2 px-4 text-center">{ing.quantidade} {ing.insumo_unidade}</td>
                              <td className="py-2 px-4 text-right">
                                {costRel.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                              </td>
                              <td className="py-2 px-4 text-center">
                                <button 
                                  type="button"
                                  onClick={() => handleRemoveIngrediente(ing.insumo_id)}
                                  className="text-red-600 hover:text-red-800 font-bold cursor-pointer"
                                >
                                  Remover
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
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
                  {modalMode === 'create' ? 'Cadastrar Produto' : 'Salvar Alterações'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
