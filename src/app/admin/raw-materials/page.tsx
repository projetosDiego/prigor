'use client';

import React, { useCallback, useEffect, useState } from 'react';
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
  Scale
} from 'lucide-react';
import { responseErrorMessage } from '@/lib/errors';

/** Insumo devolvido por `GET /api/products?type=insumo` (recorte de ProductDTO). */
interface Insumo {
  id: string;
  sku: string | null;
  barCode: string | null;
  name: string;
  category: string | null;
  unit: string;
  cost: number;
  stock: number;
  minStock: number;
  active: boolean;
}

/** Envelope de paginação usado por todas as listagens da API. */
interface Paginated<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}



export default function RawMaterialsPage() {
  const [insumos, setInsumos] = useState<Insumo[]>([]);
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
  const [unidade, setUnidade] = useState('kg');
  const [custo, setCusto] = useState('0');
  const [estoque, setEstoque] = useState('0');
  const [estoqueMinimo, setEstoqueMinimo] = useState('0');

  const fetchInsumos = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      // A listagem é paginada; a tela precisa de todos os insumos de uma vez.
      const res = await fetch('/api/products?type=insumo&pageSize=500');
      if (!res.ok) throw new Error(await responseErrorMessage(res, 'Falha ao carregar insumos.'));
      const json: Paginated<Insumo> = await res.json();
      const lista = json.data;
      setInsumos(lista);

      // Extrai categorias únicas
      const cats: string[] = Array.from(
        new Set(lista.map((i) => i.category).filter((c): c is string => Boolean(c))),
      );
      setCategories(cats);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar insumos.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // A carga roda fora do corpo síncrono do efeito para não encadear renders.
    void (async () => {
      await fetchInsumos();
    })();
  }, [fetchInsumos]);

  const handleOpenCreateModal = () => {
    setModalMode('create');
    setSelectedId(null);
    setNome('');
    setSku('');
    setCodigoBarras('');
    setCategoria('');
    setUnidade('kg');
    setCusto('0');
    setEstoque('0');
    setEstoqueMinimo('0');
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (insumo: Insumo) => {
    setModalMode('edit');
    setSelectedId(insumo.id);
    setNome(insumo.name);
    setSku(insumo.sku || '');
    setCodigoBarras(insumo.barCode || '');
    setCategoria(insumo.category || '');
    setUnidade(insumo.unit);
    setCusto(String(insumo.cost));
    setEstoque(String(insumo.stock));
    setEstoqueMinimo(String(insumo.minStock));
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome) return;

    // Insumo não tem ficha técnica: `recipe` não é enviado (omitir preserva a
    // receita existente no servidor) e o custo informado aqui é o que vale.
    const payload = {
      name: nome,
      sku: sku || undefined,
      barCode: codigoBarras || undefined,
      category: categoria || undefined,
      type: 'insumo',
      unit: unidade,
      cost: parseFloat(custo) || 0,
      stock: parseFloat(estoque) || 0,
      minStock: parseFloat(estoqueMinimo) || 0,
      active: true
    };

    try {
      const url = modalMode === 'create' ? '/api/products' : `/api/products/${selectedId}`;
      const method = modalMode === 'create' ? 'POST' : 'PUT';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error(await responseErrorMessage(res, 'Erro ao salvar insumo.'));

      setIsModalOpen(false);
      fetchInsumos();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao salvar insumo.');
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Tem certeza que deseja arquivar o insumo "${name}"?`)) return;
    try {
      const res = await fetch(`/api/products/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await responseErrorMessage(res, 'Erro ao arquivar insumo.'));
      fetchInsumos();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao arquivar insumo.');
    }
  };

  // Filtros
  const filteredInsumos = insumos.filter(insumo => {
    const matchesSearch = insumo.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (insumo.sku && insumo.sku.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (insumo.barCode && insumo.barCode.includes(searchQuery));
    const matchesCategory = !categoryFilter || insumo.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-stone-900 tracking-tight flex items-center gap-2">
            <Scale className="h-6 w-6 text-amber-700" />
            Matérias-primas e Insumos
          </h2>
          <p className="text-xs text-stone-500 font-medium">Controle de custos, estoque mínimo e rendimento industrial</p>
        </div>
        <button 
          onClick={handleOpenCreateModal}
          className="rounded-lg bg-amber-700 px-4 py-2 text-white font-bold text-xs hover:bg-amber-800 transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
        >
          <Plus className="h-4 w-4" />
          Novo Insumo
        </button>
      </div>

      {/* Barra de Filtros */}
      <div className="rounded-xl bg-white p-4 shadow-sm border border-stone-200 flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative w-full md:max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-stone-400" />
          <input 
            type="text"
            placeholder="Buscar por nome, SKU ou código..."
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
            onClick={fetchInsumos}
            title="Recarregar"
            className="p-2 border border-stone-200 rounded-lg bg-stone-50/50 hover:bg-stone-100 transition-all text-stone-500 cursor-pointer"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Corpo da Tabela */}
      {loading ? (
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2">
          <Loader2 className="h-8 w-8 animate-spin text-amber-700" />
          <p className="text-sm text-stone-500 font-medium">Buscando estoque de insumos...</p>
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-800 max-w-xl mx-auto mt-4">
          <h3 className="font-bold text-base flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Falha de Conexão
          </h3>
          <p className="mt-2 text-sm">{error}</p>
          <button onClick={fetchInsumos} className="mt-4 rounded-lg bg-red-750 px-4 py-2 text-white font-semibold text-xs hover:bg-red-800 transition-all cursor-pointer">
            Tentar novamente
          </button>
        </div>
      ) : filteredInsumos.length === 0 ? (
        <div className="text-center py-12 rounded-xl bg-white border border-stone-200 shadow-sm">
          <Package className="h-12 w-12 text-stone-300 mx-auto mb-3" />
          <p className="text-stone-500 text-sm font-semibold">Nenhum insumo encontrado</p>
          <p className="text-stone-400 text-xs mt-1">Experimente mudar os filtros ou adicione um novo insumo.</p>
        </div>
      ) : (
        <div className="rounded-2xl bg-white shadow-sm border border-stone-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50 text-stone-400 font-bold uppercase tracking-wider">
                  <th className="py-3 px-6">SKU / Insumo</th>
                  <th className="py-3 px-6">Categoria</th>
                  <th className="py-3 px-6 text-center">Unidade</th>
                  <th className="py-3 px-6 text-right">Custo Unitário</th>
                  <th className="py-3 px-6 text-center">Estoque Atual</th>
                  <th className="py-3 px-6 text-center">Mínimo</th>
                  <th className="py-3 px-6 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 font-semibold text-stone-700">
                {filteredInsumos.map((insumo) => {
                  const isLowStock = insumo.minStock > 0 && insumo.stock <= insumo.minStock;
                  return (
                    <tr key={insumo.id} className="hover:bg-stone-50/50">
                      <td className="py-4 px-6">
                        {insumo.sku && <span className="text-[10px] text-stone-400 font-bold block mb-0.5">{insumo.sku}</span>}
                        <span className="text-stone-850 font-bold text-sm block">{insumo.name}</span>
                      </td>
                      <td className="py-4 px-6 text-stone-500">{insumo.category || '—'}</td>
                      <td className="py-4 px-6 text-center font-bold text-stone-500 uppercase">{insumo.unit}</td>
                      <td className="py-4 px-6 text-right text-stone-850">
                        {insumo.cost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-4 px-6 text-center">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black ${
                          isLowStock ? 'bg-red-50 text-red-700 border border-red-100' : 'bg-stone-50 text-stone-800'
                        }`}>
                          {isLowStock && <AlertTriangle className="h-3.5 w-3.5 text-red-650" />}
                          {insumo.stock} {insumo.unit}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-center text-stone-400">{insumo.minStock} {insumo.unit}</td>
                      <td className="py-4 px-6 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button 
                            onClick={() => handleOpenEditModal(insumo)}
                            className="p-1.5 border border-stone-200 rounded-lg hover:bg-stone-50 hover:text-stone-900 text-stone-400 transition-all cursor-pointer"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          <button 
                            onClick={() => handleDelete(insumo.id, insumo.name)}
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
        <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-stone-200 shadow-xl w-full max-w-lg overflow-hidden animate-scaleIn">
            <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100">
              <h3 className="font-extrabold text-stone-900 text-base">
                {modalMode === 'create' ? 'Adicionar Novo Insumo' : 'Editar Insumo'}
              </h3>
              <button 
                onClick={() => setIsModalOpen(false)} 
                className="p-1 hover:bg-stone-50 rounded-lg text-stone-400 hover:text-stone-600 transition-all cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="text-[10px] text-stone-400 font-bold uppercase tracking-wider block mb-1">Nome do Insumo *</label>
                  <input 
                    type="text"
                    required
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    placeholder="Ex: Chocolate Callebaut 70%"
                    className="w-full px-3 py-2 rounded-lg border border-stone-200 text-xs focus:ring-1 focus:ring-amber-500 bg-stone-50/50"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-stone-400 font-bold uppercase tracking-wider block mb-1">Código SKU</label>
                  <input 
                    type="text"
                    value={sku}
                    onChange={(e) => setSku(e.target.value)}
                    placeholder="Ex: INS-CHO-01"
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
                    placeholder="Ex: Chocolates, Açúcares"
                    className="w-full px-3 py-2 rounded-lg border border-stone-200 text-xs focus:ring-1 focus:ring-amber-500 bg-stone-50/50"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-stone-400 font-bold uppercase tracking-wider block mb-1">Unidade de Medida</label>
                  <select 
                    value={unidade}
                    onChange={(e) => setUnidade(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-stone-200 text-xs focus:ring-1 focus:ring-amber-500 bg-stone-50/50"
                  >
                    <option value="un">Unidade (un)</option>
                    <option value="kg">Quilo (kg)</option>
                    <option value="g">Grama (g)</option>
                    <option value="l">Litro (l)</option>
                    <option value="ml">Mililitro (ml)</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] text-stone-400 font-bold uppercase tracking-wider block mb-1">Custo Unitário (R$)</label>
                  <input 
                    type="number"
                    step="0.01"
                    min="0"
                    value={custo}
                    onChange={(e) => setCusto(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-stone-200 text-xs focus:ring-1 focus:ring-amber-500 bg-stone-50/50"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-stone-400 font-bold uppercase tracking-wider block mb-1">Estoque Inicial</label>
                  <input 
                    type="number"
                    step="0.01"
                    min="0"
                    disabled={modalMode === 'edit'} // No modo edição, os ajustes de estoque devem ser manuais
                    value={estoque}
                    onChange={(e) => setEstoque(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-stone-200 text-xs focus:ring-1 focus:ring-amber-500 bg-stone-50/50 disabled:bg-stone-100 disabled:text-stone-400"
                  />
                </div>

                <div className="col-span-2">
                  <label className="text-[10px] text-stone-400 font-bold uppercase tracking-wider block mb-1">Estoque de Segurança (Mínimo)</label>
                  <input 
                    type="number"
                    step="0.01"
                    min="0"
                    value={estoqueMinimo}
                    onChange={(e) => setEstoqueMinimo(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-stone-200 text-xs focus:ring-1 focus:ring-amber-500 bg-stone-50/50"
                  />
                </div>
              </div>

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
                  {modalMode === 'create' ? 'Cadastrar Insumo' : 'Salvar Alterações'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
