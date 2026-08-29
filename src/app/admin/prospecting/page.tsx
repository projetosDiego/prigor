'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Play,
  Loader2,
  History,
  CheckCircle2,
  Clock,
  Sparkles
} from 'lucide-react';

import { errorMessage, apiErrorMessage } from '@/lib/errors';

interface Neighborhood {
  id: string;
  name: string;
  region: { name: string };
  seller?: { name: string } | null;
}

/**
 * Execução devolvida por `GET /api/prospecting/runs`.
 *
 * `estimatedCost` é uma coluna Decimal que a rota devolve crua, sem passar
 * por `num()`: no JSON ela chega como string. Chamar `.toFixed()` direto
 * quebrava a tela, então o valor é convertido na hora de exibir.
 */
interface ProspectingRun {
  id: string;
  startedAt: string;
  finishedAt?: string | null;
  category?: string | null;
  resultsFound: number;
  newLeads: number;
  duplicates: number;
  existingCust: number;
  errors?: string | null;
  estimatedCost: number | string;
  status: string;
}

/** Resumo devolvido por `POST /api/prospecting/run`. */
interface RunStats {
  resultsFound: number;
  newLeads: number;
  duplicates: number;
  existingCustomers: number;
  costUsd: number;
}

interface NeighborhoodsResponse {
  data?: Neighborhood[];
  error?: string;
}

interface RunsResponse {
  data?: ProspectingRun[];
}

interface RunResponse {
  stats?: RunStats;
  message?: string;
  error?: string;
}

export default function AdminProspectingPage() {
  const [neighborhoods, setNeighborhoods] = useState<Neighborhood[]>([]);
  const [history, setHistory] = useState<ProspectingRun[]>([]);
  const [loading, setLoading] = useState(true);

  // Form State
  const [selectedNeighborhoodId, setSelectedNeighborhoodId] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('cafeterias');
  const [limit, setLimit] = useState('5');
  const [runLoading, setRunLoading] = useState(false);
  const [runStats, setRunStats] = useState<RunStats | null>(null);

  const carregarHistorico = useCallback(async (): Promise<ProspectingRun[]> => {
    try {
      // Para carregar runs, faremos um endpoint de runs no BD
      const runsRes = await fetch('/api/prospecting/runs');
      if (runsRes.ok) {
        const data: RunsResponse = await runsRes.json();
        return data.data ?? [];
      }
    } catch {
      // Histórico é acessório: falha aqui não impede a tela de abrir.
    }
    return [];
  }, []);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [neighRes] = await Promise.all([
        fetch('/api/neighborhoods'),
        // Mantém a chamada ao endpoint de configurações, que é quem inicializa
        // a linha de config do sistema. A resposta em si não é usada aqui.
        fetch('/api/settings/api-usage'),
      ]);

      const neighJson: NeighborhoodsResponse = await neighRes.json();
      const historico = await carregarHistorico();

      if (!neighRes.ok) throw new Error(apiErrorMessage(neighJson, 'Erro ao carregar bairros.'));

      setNeighborhoods(neighJson.data ?? []);
      setHistory(historico);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [carregarHistorico]);

  useEffect(() => {
    // A carga roda fora do corpo síncrono do efeito para não encadear renders.
    void (async () => {
      await loadData();
    })();
  }, [loadData]);

  const handleRunProspecting = async (e: React.FormEvent) => {
    e.preventDefault();
    setRunLoading(true);
    setRunStats(null);
    try {
      const res = await fetch('/api/prospecting/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          neighborhoodId: selectedNeighborhoodId,
          category: selectedCategory,
          limit: parseInt(limit),
        }),
      });

      const json: RunResponse = await res.json();
      if (!res.ok) throw new Error(apiErrorMessage(json, 'Erro ao rodar motor de busca.'));

      setRunStats(json.stats ?? null);
      alert(json.message);

      // Recarregar histórico
      await loadData();
    } catch (err: unknown) {
      alert(errorMessage(err));
    } finally {
      setRunLoading(false);
    }
  };

  const getRunStatusBadge = (status: string) => {
    switch (status) {
      case 'SUCCESS':
        return 'bg-emerald-50 text-emerald-800 border-emerald-100';
      case 'FAILED':
        return 'bg-red-50 text-red-800 border-red-100';
      case 'RUNNING':
        return 'bg-blue-50 text-blue-800 border-blue-100 animate-pulse';
      default:
        return 'bg-stone-50 text-stone-750 border-stone-200';
    }
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div>
        <h2 className="text-2xl font-black text-stone-900 tracking-tight">Prospecção de Clientes (Discovery Engine)</h2>
        <p className="text-xs text-stone-500 font-medium">Buscas automáticas diárias e prospecções manuais personalizadas integradas ao Google Places</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Formulário de Prospecção Direcionada */}
        <div className="rounded-2xl bg-white p-5 border border-stone-200 shadow-sm space-y-4 lg:col-span-1 h-fit">
          <h3 className="text-sm font-bold text-stone-850 flex items-center gap-2">
            <Sparkles className="h-4.5 w-4.5 text-amber-700" />
            Nova Prospecção Manual
          </h3>

          <p className="text-xs text-stone-600 leading-relaxed">
            Selecione o bairro comercial estratégico, a categoria comercial de interesse e o limite de gastos para o Google.
          </p>

          <form onSubmit={handleRunProspecting} className="space-y-4 text-xs font-semibold text-stone-600">
            <div>
              <label className="block mb-1">Selecione o Bairro Alvo</label>
              <select
                value={selectedNeighborhoodId}
                onChange={(e) => setSelectedNeighborhoodId(e.target.value)}
                className="block w-full rounded-xl border border-stone-300 bg-stone-50 p-3 text-stone-900 focus:outline-none"
                required
              >
                <option value="">Selecione o bairro...</option>
                {neighborhoods.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name} ({n.region.name}) {n.seller ? `• de ${n.seller.name}` : '• Sem Vendedor'}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block mb-1">Categoria do Estabelecimento</label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="block w-full rounded-xl border border-stone-300 bg-stone-50 p-3 text-stone-900 focus:outline-none"
                required
              >
                <option value="cafeterias">Cafeterias (Prioritário)</option>
                <option value="padarias">Padarias (Prioritário)</option>
                <option value="confeitarias">Confeitarias (Prioritário)</option>
                <option value="lanchonetes">Lanchonetes (Prioritário)</option>
                <option value="açaiterias">Açaiterias (Prioritário)</option>
                <option value="restaurantes">Restaurantes</option>
                <option value="mercados">Mercados</option>
                <option value="hotéis">Hotéis</option>
                <option value="conveniências">Lojas de Conveniência</option>
              </select>
            </div>

            <div>
              <label className="block mb-1">Limite Máximo de Resultados (Google Places)</label>
              <select
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
                className="block w-full rounded-xl border border-stone-300 bg-stone-50 p-3 text-stone-900 focus:outline-none"
                required
              >
                <option value="3">3 estabelecimentos</option>
                <option value="5">5 estabelecimentos (Padrão)</option>
                <option value="10">10 estabelecimentos</option>
                <option value="20">20 estabelecimentos</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={runLoading}
              className="flex w-full justify-center items-center gap-2 rounded-xl bg-amber-700 py-3 text-sm font-bold text-white shadow-md hover:bg-amber-800 active:bg-amber-900 transition-all cursor-pointer"
            >
              {runLoading ? (
                <>
                  <Loader2 className="h-4.5 w-4.5 animate-spin" />
                  Buscando e deduplicando...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 fill-white" />
                  Iniciar Busca Comercial
                </>
              )}
            </button>
          </form>

          {/* Resultado Estatístico do Disparo */}
          {runStats && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 space-y-2 text-xs">
              <h4 className="font-bold text-emerald-800 flex items-center gap-1">
                <CheckCircle2 className="h-4 w-4" />
                Busca concluída!
              </h4>
              <ul className="space-y-1 text-stone-700 font-medium">
                <li>Encontrados no Google: <strong>{runStats.resultsFound}</strong></li>
                <li>Importados como Leads: <strong className="text-emerald-700">{runStats.newLeads}</strong></li>
                <li>Duplicados ignorados: <strong>{runStats.duplicates}</strong></li>
                <li>Clientes Prigor já cadastrados: <strong>{runStats.existingCustomers}</strong></li>
                <li>Custo estimado da chamada: <strong>${runStats.costUsd.toFixed(3)}</strong></li>
              </ul>
            </div>
          )}
        </div>

        {/* Histórico das Execuções (Cron e Manual) */}
        <div className="rounded-2xl bg-white p-5 border border-stone-200 shadow-sm space-y-4 lg:col-span-2">
          <h3 className="text-sm font-bold text-stone-850 flex items-center gap-2">
            <History className="h-4.5 w-4.5 text-amber-700" />
            Histórico do Motor de Busca
          </h3>

          {loading ? (
            <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-amber-700" /></div>
          ) : history.length === 0 ? (
            <div className="p-12 border border-dashed border-stone-300 rounded-xl text-center text-stone-500 italic text-xs">
              Nenhuma busca registrada no histórico.
            </div>
          ) : (
            <div className="overflow-x-auto border border-stone-200 rounded-xl">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-stone-200 bg-stone-50 text-stone-400 font-bold uppercase tracking-wider">
                    <th className="p-3">Data / Hora</th>
                    <th className="p-3">Categoria</th>
                    <th className="p-3 text-center">Encontrados</th>
                    <th className="p-3 text-center">Novos Leads</th>
                    <th className="p-3 text-center">Custo API</th>
                    <th className="p-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 font-semibold text-stone-650">
                  {history.map((run) => (
                    <tr key={run.id} className="hover:bg-stone-50/50">
                      <td className="p-3 flex items-center gap-1.5 text-stone-800">
                        <Clock className="h-3.5 w-3.5 text-stone-400" />
                        <span>{new Date(run.startedAt).toLocaleString('pt-BR')}</span>
                      </td>
                      <td className="p-3 capitalize">{run.category || 'busca geral'}</td>
                      <td className="p-3 text-center text-stone-600">{run.resultsFound}</td>
                      <td className="p-3 text-center text-emerald-700">{run.newLeads}</td>
                      <td className="p-3 text-center text-stone-550">${Number(run.estimatedCost).toFixed(3)}</td>
                      <td className="p-3">
                        <span className={`inline-block rounded font-extrabold text-[9px] px-2 py-0.5 border ${getRunStatusBadge(run.status)}`}>
                          {run.status}
                        </span>
                        {run.errors && <span className="block text-[8px] text-red-500 max-w-[120px] truncate">{run.errors}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
