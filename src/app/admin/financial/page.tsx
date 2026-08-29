'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { 
  DollarSign, 
  Trash2, 
  Loader2, 
  RefreshCw, 
  X, 
  ArrowUpRight, 
  ArrowDownRight, 
  Check, 
  Undo2,
  AlertTriangle
} from 'lucide-react';
import { responseErrorMessage } from '@/lib/errors';
import type { Paginated, TransactionDTO } from '@/lib/api-types';

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

export default function FinancialPage() {
  const [lancamentos, setLancamentos] = useState<TransactionDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filtros
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Estado do Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'receita' | 'despesa'>('receita');

  // Form Fields
  const [descricao, setDescricao] = useState('');
  const [categoria, setCategoria] = useState('');
  const [valor, setValor] = useState('0');
  const [dataLancamento, setDataLancamento] = useState(new Date().toISOString().split('T')[0]);
  const [dataVencimento, setDataVencimento] = useState('');
  const [observacoes, setObservacoes] = useState('');

  // Recebe os filtros por parâmetro para não depender do estado: assim a
  // função é estável e o efeito de carga inicial não roda de novo a cada
  // mudança de filtro (que só valem ao clicar em "Aplicar Filtros").
  const carregarLancamentos = useCallback(async (tipo: string, status: string) => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (tipo) params.append('type', tipo);
      if (status) params.append('status', status);
      // A listagem é paginada; a tela resume tudo o que existe no filtro.
      params.append('pageSize', '500');

      const res = await fetch(`/api/financial/transactions?${params.toString()}`);
      if (!res.ok) throw new Error(await responseErrorMessage(res, 'Falha ao carregar dados financeiros.'));
      const json: Paginated<TransactionDTO> = await res.json();
      setLancamentos(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar dados financeiros.');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchLancamentos = useCallback(() => {
    void carregarLancamentos(typeFilter, statusFilter);
  }, [carregarLancamentos, typeFilter, statusFilter]);

  useEffect(() => {
    // Na montagem os filtros ainda estão vazios. A carga roda fora do corpo
    // síncrono do efeito para não encadear renders.
    void (async () => {
      await carregarLancamentos('', '');
    })();
  }, [carregarLancamentos]);

  const handleOpenModal = (tipo: 'receita' | 'despesa') => {
    setModalType(tipo);
    setDescricao('');
    setCategoria('');
    setValor('0');
    setDataLancamento(new Date().toISOString().split('T')[0]);
    setDataVencimento('');
    setObservacoes('');
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!descricao || parseFloat(valor) <= 0) return;

    const payload = {
      type: modalType,
      description: descricao,
      category: categoria || undefined,
      value: parseFloat(valor),
      issueDate: dataLancamento,
      dueDate: dataVencimento || undefined,
      status: 'pendente',
      notes: observacoes || undefined
    };

    try {
      const res = await fetch('/api/financial/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error(await responseErrorMessage(res, 'Erro ao criar lançamento.'));

      setIsModalOpen(false);
      fetchLancamentos();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao criar lançamento.');
    }
  };

  const handlePay = async (id: string, desc: string) => {
    if (!confirm(`Confirmar recebimento/pagamento de "${desc}"?`)) return;
    try {
      const res = await fetch(`/api/financial/transactions/${id}/settle`, { method: 'POST' });
      if (!res.ok) throw new Error(await responseErrorMessage(res, 'Erro ao baixar lançamento.'));
      fetchLancamentos();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao baixar lançamento.');
    }
  };

  /**
   * Estorna uma baixa. Necessário porque um lançamento pago trava a alteração
   * do pedido de origem — sem estorno não havia como corrigir uma venda já
   * baixada por engano.
   */
  const handleReverse = async (id: string, desc: string) => {
    if (!confirm(`Estornar a baixa de "${desc}"? O lançamento volta para pendente.`)) return;
    try {
      const res = await fetch(`/api/financial/transactions/${id}/reverse`, { method: 'POST' });
      if (!res.ok) throw new Error(await responseErrorMessage(res, 'Erro ao estornar a baixa.'));
      fetchLancamentos();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao estornar a baixa.');
    }
  };

  const handleDelete = async (id: string, desc: string) => {
    if (!confirm(`Deseja excluir permanentemente o lançamento "${desc}"?`)) return;
    try {
      const res = await fetch(`/api/financial/transactions/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await responseErrorMessage(res, 'Erro ao excluir lançamento.'));
      fetchLancamentos();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao excluir lançamento.');
    }
  };

  // Cálculos de resumo
  const totalReceber = lancamentos
    .filter(l => l.type === 'receita' && l.status !== 'pago')
    .reduce((sum, l) => sum + l.value, 0);

  const totalPagar = lancamentos
    .filter(l => l.type === 'despesa' && l.status !== 'pago')
    .reduce((sum, l) => sum + l.value, 0);

  const totalPagoMes = lancamentos
    .filter(l => l.status === 'pago')
    .reduce((sum, l) => sum + (l.type === 'receita' ? l.value : -l.value), 0);

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-stone-900 tracking-tight flex items-center gap-2">
            <DollarSign className="h-6 w-6 text-amber-700" />
            Movimentação Financeira
          </h2>
          <p className="text-xs text-stone-500 font-medium">Controle de fluxo de caixa, despesas fixas/variáveis e receitas de vendas</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => handleOpenModal('receita')}
            className="rounded-lg border border-emerald-250 bg-emerald-700/5 px-4 py-2 text-emerald-800 font-bold text-xs hover:bg-emerald-700/10 transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowUpRight className="h-4 w-4 text-emerald-750" />
            Nova Receita
          </button>
          <button 
            onClick={() => handleOpenModal('despesa')}
            className="rounded-lg bg-amber-700 px-4 py-2 text-white font-bold text-xs hover:bg-amber-800 transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
          >
            <ArrowDownRight className="h-4 w-4" />
            Nova Despesa
          </button>
        </div>
      </div>

      {/* Caixa de Resumo */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] text-stone-400 font-bold uppercase block mb-1">A Receber (Pendentes)</span>
            <span className="text-xl font-black text-emerald-800">
              {totalReceber.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </span>
          </div>
          <div className="h-10 w-10 rounded-full bg-emerald-50 flex items-center justify-center">
            <ArrowUpRight className="h-5 w-5 text-emerald-700" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] text-stone-400 font-bold uppercase block mb-1">A Pagar (Pendentes)</span>
            <span className="text-xl font-black text-red-750">
              {totalPagar.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </span>
          </div>
          <div className="h-10 w-10 rounded-full bg-red-50 flex items-center justify-center">
            <ArrowDownRight className="h-5 w-5 text-red-700" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] text-stone-400 font-bold uppercase block mb-1">Saldo Realizado (Pago)</span>
            <span className={`text-xl font-black ${totalPagoMes >= 0 ? 'text-emerald-800' : 'text-red-750'}`}>
              {totalPagoMes.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </span>
          </div>
          <div className="h-10 w-10 rounded-full bg-stone-50 flex items-center justify-center">
            <DollarSign className="h-5 w-5 text-stone-500" />
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="rounded-xl bg-white p-4 shadow-sm border border-stone-200 grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
        <div>
          <label className="text-[10px] text-stone-400 font-bold uppercase tracking-wider block mb-1">Tipo</label>
          <select 
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="w-full rounded-lg border border-stone-200 text-xs px-3 py-2 bg-stone-50/50 focus:outline-none"
          >
            <option value="">Todos Lançamentos</option>
            <option value="receita">Receitas</option>
            <option value="despesa">Despesas</option>
          </select>
        </div>

        <div>
          <label className="text-[10px] text-stone-400 font-bold uppercase tracking-wider block mb-1">Status</label>
          <select 
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full rounded-lg border border-stone-200 text-xs px-3 py-2 bg-stone-50/50 focus:outline-none"
          >
            <option value="">Todos Status</option>
            <option value="pendente">Pendente</option>
            <option value="pago">Pago</option>
            <option value="atrasado">Atrasado</option>
          </select>
        </div>

        <div className="flex gap-2">
          <button 
            onClick={fetchLancamentos}
            className="flex-1 rounded-lg bg-stone-900 hover:bg-stone-850 text-white font-bold text-xs py-2 text-center cursor-pointer transition-all flex items-center justify-center gap-1.5"
          >
            <RefreshCw className="h-4 w-4" />
            Aplicar Filtros
          </button>
        </div>
      </div>

      {/* Listagem */}
      {loading ? (
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2">
          <Loader2 className="h-8 w-8 animate-spin text-amber-700" />
          <p className="text-sm text-stone-500 font-medium">Buscando fluxo de caixa...</p>
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-800 max-w-xl mx-auto mt-4">
          <h3 className="font-bold text-base flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Erro na Conexão
          </h3>
          <p className="mt-2 text-sm">{error}</p>
          <button onClick={fetchLancamentos} className="mt-4 rounded-lg bg-red-750 px-4 py-2 text-white font-semibold text-xs hover:bg-red-800 transition-all cursor-pointer">
            Tentar novamente
          </button>
        </div>
      ) : lancamentos.length === 0 ? (
        <div className="text-center py-12 rounded-xl bg-white border border-stone-200 shadow-sm">
          <DollarSign className="h-12 w-12 text-stone-300 mx-auto mb-3" />
          <p className="text-stone-500 text-sm font-semibold">Nenhum lançamento no período</p>
          <p className="text-stone-400 text-xs mt-1">Crie uma nova receita ou despesa manual.</p>
        </div>
      ) : (
        <div className="rounded-2xl bg-white shadow-sm border border-stone-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50 text-stone-400 font-bold uppercase tracking-wider">
                  <th className="py-3 px-6">Tipo</th>
                  <th className="py-3 px-6">Descrição</th>
                  <th className="py-3 px-6">Categoria</th>
                  <th className="py-3 px-6">Vencimento</th>
                  <th className="py-3 px-6 text-center">Status</th>
                  <th className="py-3 px-6 text-right">Valor</th>
                  <th className="py-3 px-6 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 font-semibold text-stone-700">
                {lancamentos.map((l) => (
                  <tr key={l.id} className="hover:bg-stone-50/50">
                    <td className="py-4 px-6">
                      <span className={`inline-flex px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                        l.type === 'receita' ? 'bg-emerald-50 text-emerald-800 border border-emerald-100' : 'bg-red-50 text-red-700 border border-red-100'
                      }`}>
                        {l.type}
                      </span>
                    </td>
                    <td className="py-4 px-6">
                      <span className="text-stone-850 font-bold text-sm block">{l.description}</span>
                      {l.notes && <span className="text-[10px] text-stone-400 block font-medium mt-0.5">{l.notes}</span>}
                    </td>
                    <td className="py-4 px-6 text-stone-500">{l.category || '—'}</td>
                    <td className="py-4 px-6 text-stone-400">
                      {formatarData(l.dueDate)}
                    </td>
                    <td className="py-4 px-6 text-center">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                        l.status === 'pago' ? 'bg-emerald-50 text-emerald-700' :
                        l.status === 'atrasado' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'
                      }`}>
                        {l.status}
                      </span>
                    </td>
                    <td className={`py-4 px-6 text-right font-black text-sm ${l.type === 'receita' ? 'text-stone-850' : 'text-red-750'}`}>
                      {l.type === 'despesa' ? '-' : ''}
                      {l.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </td>
                    <td className="py-4 px-6 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        {l.status !== 'pago' ? (
                          <button 
                            onClick={() => handlePay(l.id, l.description)}
                            className="p-1.5 border border-emerald-200 rounded-lg hover:bg-emerald-50 text-emerald-700 transition-all cursor-pointer"
                            title="Confirmar Liquidação (Baixar)"
                          >
                            <Check className="h-4 w-4" />
                          </button>
                        ) : (
                          <button
                            onClick={() => handleReverse(l.id, l.description)}
                            className="p-1.5 border border-amber-200 rounded-lg hover:bg-amber-50 text-amber-700 transition-all cursor-pointer"
                            title="Estornar baixa (volta para pendente)"
                          >
                            <Undo2 className="h-4 w-4" />
                          </button>
                        )}
                        <button 
                          onClick={() => handleDelete(l.id, l.description)}
                          className="p-1.5 border border-stone-200 rounded-lg hover:bg-red-50 text-stone-400 hover:text-red-700 transition-all cursor-pointer"
                          title="Excluir Lançamento"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Nova Receita / Despesa */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-stone-200 shadow-xl w-full max-w-md overflow-hidden animate-scaleIn">
            <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100">
              <h3 className="font-extrabold text-stone-900 text-base">
                {modalType === 'receita' ? 'Lançar Nova Conta a Receber' : 'Lançar Nova Conta a Pagar'}
              </h3>
              <button 
                onClick={() => setIsModalOpen(false)} 
                className="p-1 hover:bg-stone-50 rounded-lg text-stone-400 hover:text-stone-600 transition-all cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div className="space-y-3.5">
                <div>
                  <label className="text-[10px] text-stone-400 font-bold uppercase tracking-wider block mb-1 font-bold">Descrição do Lançamento *</label>
                  <input 
                    type="text"
                    required
                    value={descricao}
                    onChange={(e) => setDescricao(e.target.value)}
                    placeholder={modalType === 'receita' ? 'Ex: Venda avulsa cliente corporativo' : 'Ex: Compra de embalagens'}
                    className="w-full px-3 py-2 rounded-lg border border-stone-200 text-xs focus:ring-1 focus:ring-amber-500 bg-stone-50/50"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] text-stone-400 font-bold uppercase tracking-wider block mb-1">Categoria</label>
                    <input 
                      type="text"
                      value={categoria}
                      onChange={(e) => setCategoria(e.target.value)}
                      placeholder="Ex: Vendas, Logística, Insumos"
                      className="w-full px-3 py-2 rounded-lg border border-stone-200 text-xs focus:ring-1 focus:ring-amber-500 bg-stone-50/50"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-stone-400 font-bold uppercase tracking-wider block mb-1">Valor (R$) *</label>
                    <input 
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      value={valor}
                      onChange={(e) => setValor(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-stone-200 text-xs focus:ring-1 focus:ring-amber-500 bg-stone-50/50"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-stone-400 font-bold uppercase tracking-wider block mb-1">Data Lançamento</label>
                    <input 
                      type="date"
                      value={dataLancamento}
                      onChange={(e) => setDataLancamento(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-lg border border-stone-200 text-xs focus:ring-1 focus:ring-amber-500 bg-stone-50/50"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-stone-400 font-bold uppercase tracking-wider block mb-1">Data Vencimento</label>
                    <input 
                      type="date"
                      value={dataVencimento}
                      onChange={(e) => setDataVencimento(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-lg border border-stone-200 text-xs focus:ring-1 focus:ring-amber-500 bg-stone-50/50"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] text-stone-400 font-bold uppercase tracking-wider block mb-1">Observações / Notas</label>
                  <textarea 
                    value={observacoes}
                    onChange={(e) => setObservacoes(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-stone-200 text-xs focus:ring-1 focus:ring-amber-500 bg-stone-50/50 h-16 resize-none"
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
                  Confirmar Lançamento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
