'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  Settings,
  Loader2,
  RefreshCw,
  ToggleLeft,
  ToggleRight,
  DollarSign
} from 'lucide-react';

import { errorMessage, apiErrorMessage } from '@/lib/errors';

/**
 * Linha de consumo devolvida por `GET /api/settings/api-usage`.
 *
 * `estimatedCost` é uma coluna Decimal que a rota devolve crua, sem passar
 * por `num()`: no JSON ela chega como string. Chamar `.toFixed()` direto
 * quebrava a tela, então o valor é convertido na hora de exibir.
 */
interface ApiUsageLog {
  id: string;
  date: string;
  service: string;
  endpoint: string;
  callCount: number;
  estimatedCost: number | string;
  region?: string | null;
}

interface ApiSettings {
  id: string;
  dailyCostLimit: number;
  monthlyCostLimit: number;
  currentDailyCost: number;
  currentMonthlyCost: number;
  apiPaused: boolean;
  nearbyRadiusKm: number;
  dailyPercent: number;
  monthlyPercent: number;
}

interface ApiUsageResponse {
  settings?: ApiSettings | null;
  data?: ApiUsageLog[];
  error?: string;
}

interface MutationResponse {
  error?: string;
  message?: string;
}

export default function AdminApiUsagePage() {
  const [settings, setSettings] = useState<ApiSettings | null>(null);
  const [logs, setLogs] = useState<ApiUsageLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form edit limits
  const [dailyLimit, setDailyLimit] = useState('10.00');
  const [monthlyLimit, setMonthlyLimit] = useState('150.00');
  const [radiusKm, setRadiusKm] = useState('5');
  const [saveLoading, setSaveLoading] = useState(false);

  const loadApiUsageData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/settings/api-usage');
      const data: ApiUsageResponse = await res.json();
      if (!res.ok) throw new Error(apiErrorMessage(data, 'Erro ao obter dados de consumo de API.'));

      setSettings(data.settings ?? null);
      setLogs(data.data ?? []);

      if (data.settings) {
        setDailyLimit(data.settings.dailyCostLimit.toFixed(2));
        setMonthlyLimit(data.settings.monthlyCostLimit.toFixed(2));
        setRadiusKm(String(data.settings.nearbyRadiusKm));
      }
    } catch (err: unknown) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // O carregamento roda fora do corpo síncrono do efeito para não
    // encadear renders (react-hooks/set-state-in-effect).
    void (async () => {
      await loadApiUsageData();
    })();
  }, [loadApiUsageData]);

  const handleUpdateLimits = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveLoading(true);
    try {
      const res = await fetch('/api/settings/api-usage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dailyCostLimit: parseFloat(dailyLimit),
          monthlyCostLimit: parseFloat(monthlyLimit),
          nearbyRadiusKm: parseInt(radiusKm),
        }),
      });

      const json: MutationResponse = await res.json();
      if (!res.ok) throw new Error(apiErrorMessage(json, 'Erro ao atualizar limites.'));

      alert(json.message);
      await loadApiUsageData();
    } catch (err: unknown) {
      alert(errorMessage(err));
    } finally {
      setSaveLoading(false);
    }
  };

  const handleTogglePause = async () => {
    if (!settings) return;
    try {
      const targetState = !settings.apiPaused;
      const res = await fetch('/api/settings/api-usage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiPaused: targetState }),
      });
      const json: MutationResponse = await res.json();
      if (!res.ok) throw new Error(apiErrorMessage(json, 'Erro ao alterar estado da API.'));

      await loadApiUsageData();
      alert(`API ${targetState ? 'PAUSADA' : 'REATIVADA'} com sucesso.`);
    } catch (err: unknown) {
      alert(errorMessage(err));
    }
  };

  const handleResetCosts = async () => {
    if (!confirm('Deseja realmente reiniciar os contadores de custos de API hoje? Isso reativará as consultas caso estejam bloqueadas por limites.')) return;
    try {
      const res = await fetch('/api/settings/api-usage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resetCosts: true }),
      });
      const json: MutationResponse = await res.json();
      if (!res.ok) throw new Error(apiErrorMessage(json, 'Erro ao redefinir contadores.'));

      await loadApiUsageData();
      alert('Custos acumulados zerados e API reativada!');
    } catch (err: unknown) {
      alert(errorMessage(err));
    }
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black text-stone-900 tracking-tight">Consumo da API do Google</h2>
          <p className="text-xs text-stone-500 font-medium">Controle financeiro e limites de requisições do Google Places para evitar custos inesperados</p>
        </div>

        <button
          onClick={handleResetCosts}
          className="flex items-center gap-1.5 rounded-lg border border-stone-300 hover:bg-stone-50 text-stone-700 px-4 py-2 text-xs font-bold transition-all cursor-pointer"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Zerar Contadores
        </button>
      </div>

      {loading ? (
        <div className="flex h-60 items-center justify-center bg-white rounded-2xl border border-stone-200">
          <Loader2 className="h-6 w-6 animate-spin text-amber-700" />
          <p className="text-xs text-stone-500 font-medium">Apurando custos financeiros...</p>
        </div>
      ) : error || !settings ? (
        <div className="p-4 bg-red-50 text-red-750 text-xs text-center border border-red-200 rounded-xl">{error || 'Dados indisponíveis'}</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Caixa de Configurações e Limites */}
          <div className="space-y-6 lg:col-span-1 h-fit">
            
            {/* Estado Geral de Trava da API */}
            <div className={`rounded-2xl border p-5 shadow-sm space-y-4 flex items-center justify-between bg-white ${
              settings.apiPaused ? 'border-red-200 bg-red-50/20' : 'border-stone-200'
            }`}>
              <div className="min-w-0 pr-3">
                <h3 className="text-xs font-black uppercase text-stone-700 block">Status do Discovery Engine</h3>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded inline-block mt-1 ${
                  settings.apiPaused ? 'bg-red-150 text-red-900 border border-red-200' : 'bg-emerald-50 text-emerald-800 border border-emerald-100'
                }`}>
                  {settings.apiPaused ? 'BLOQUEADO/PAUSADO' : 'ATIVO/PERMITIDO'}
                </span>
                <p className="text-[10px] text-stone-400 mt-2 font-medium">Se pausado, buscas automáticas e manuais do Google Places ficam suspensas.</p>
              </div>

              <button onClick={handleTogglePause} className="cursor-pointer text-stone-500 hover:text-amber-800">
                {settings.apiPaused ? <ToggleLeft className="h-10 w-10 text-red-600" /> : <ToggleRight className="h-10 w-10 text-emerald-700" />}
              </button>
            </div>

            {/* Configurações Form */}
            <div className="rounded-2xl bg-white p-5 border border-stone-200 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-stone-850 flex items-center gap-2">
                <Settings className="h-4.5 w-4.5 text-amber-700" />
                Definir Limites Financeiros
              </h3>

              <form onSubmit={handleUpdateLimits} className="space-y-4 text-xs font-semibold text-stone-600">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block mb-1">Teto Diário (USD)</label>
                    <div className="relative">
                      <input
                        type="number" step="0.50" min="1.00"
                        value={dailyLimit}
                        onChange={(e) => setDailyLimit(e.target.value)}
                        className="block w-full rounded-lg border border-stone-300 bg-stone-50 p-2.5 pl-6 text-stone-900 focus:bg-white"
                        required
                      />
                      <DollarSign className="absolute left-1.5 top-3 h-3.5 w-3.5 text-stone-400" />
                    </div>
                  </div>
                  <div>
                    <label className="block mb-1">Teto Mensal (USD)</label>
                    <div className="relative">
                      <input
                        type="number" step="5.00" min="10.00"
                        value={monthlyLimit}
                        onChange={(e) => setMonthlyLimit(e.target.value)}
                        className="block w-full rounded-lg border border-stone-300 bg-stone-50 p-2.5 pl-6 text-stone-900 focus:bg-white"
                        required
                      />
                      <DollarSign className="absolute left-1.5 top-3 h-3.5 w-3.5 text-stone-400" />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block mb-1">Raio do Vendedor / GPS (KM)</label>
                  <select
                    value={radiusKm}
                    onChange={(e) => setRadiusKm(e.target.value)}
                    className="block w-full rounded-lg border border-stone-300 bg-stone-50 p-2.5 text-stone-900 focus:outline-none"
                    required
                  >
                    <option value="1">1 km</option>
                    <option value="3">3 km</option>
                    <option value="5">5 km (Padrão)</option>
                    <option value="10">10 km</option>
                  </select>
                  <p className="text-[9px] text-stone-400 font-medium mt-1">Define o raio inicial de busca de prova social e de leads ao redor do vendedor.</p>
                </div>

                <button
                  type="submit"
                  disabled={saveLoading}
                  className="flex w-full justify-center items-center gap-2 rounded-xl bg-amber-700 py-3 text-sm font-bold text-white shadow-md hover:bg-amber-800 transition-all cursor-pointer"
                >
                  {saveLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Salvar Configurações'}
                </button>
              </form>
            </div>
          </div>

          {/* Consumo Acumulado e Log de Requisições */}
          <div className="rounded-2xl bg-white p-5 border border-stone-200 shadow-sm space-y-6 lg:col-span-2">
            
            {/* Indicadores de Gasto Acumulado */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Diário */}
              <div className="rounded-xl border border-stone-200 bg-stone-50/50 p-4 space-y-2">
                <div className="flex justify-between items-center text-xs font-bold text-stone-600">
                  <span>Gasto Hoje (USD)</span>
                  <span>${settings.currentDailyCost.toFixed(3)} / ${settings.dailyCostLimit.toFixed(2)}</span>
                </div>
                <div className="h-3 w-full bg-stone-200 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${settings.dailyPercent >= 90 ? 'bg-red-600' : settings.dailyPercent >= 80 ? 'bg-orange-500' : 'bg-amber-700'}`} style={{ width: `${settings.dailyPercent}%` }} />
                </div>
                <span className="text-[9px] text-stone-400 font-bold block text-right">{settings.dailyPercent}% do teto diário</span>
              </div>

              {/* Mensal */}
              <div className="rounded-xl border border-stone-200 bg-stone-50/50 p-4 space-y-2">
                <div className="flex justify-between items-center text-xs font-bold text-stone-600">
                  <span>Gasto Mensal (USD)</span>
                  <span>${settings.currentMonthlyCost.toFixed(3)} / ${settings.monthlyCostLimit.toFixed(2)}</span>
                </div>
                <div className="h-3 w-full bg-stone-200 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${settings.monthlyPercent >= 90 ? 'bg-red-600' : settings.monthlyPercent >= 80 ? 'bg-orange-500' : 'bg-amber-700'}`} style={{ width: `${settings.monthlyPercent}%` }} />
                </div>
                <span className="text-[9px] text-stone-400 font-bold block text-right">{settings.monthlyPercent}% do teto mensal</span>
              </div>
            </div>

            {/* Log de Requisições Recentes */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-stone-800 uppercase tracking-wider flex items-center gap-1.5">
                <Activity className="h-4.5 w-4.5 text-amber-700" />
                Histórico de Faturamento Google Maps
              </h4>

              {logs.length === 0 ? (
                <div className="p-8 border border-dashed border-stone-300 rounded-xl text-center text-stone-500 italic text-xs">
                  Nenhuma chamada de API cobrada recentemente.
                </div>
              ) : (
                <div className="overflow-x-auto border border-stone-200 rounded-xl max-h-[300px]">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-stone-200 bg-stone-50 text-stone-450 font-bold uppercase tracking-wider">
                        <th className="p-3">Data</th>
                        <th className="p-3">API / Endpoint</th>
                        <th className="p-3 text-center">Chamadas</th>
                        <th className="p-3 text-right">Custo Estimado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100 font-semibold text-stone-600">
                      {logs.map((log) => (
                        <tr key={log.id} className="hover:bg-stone-50/50">
                          <td className="p-3 text-stone-400">{new Date(log.date).toLocaleDateString('pt-BR')}</td>
                          <td className="p-3">
                            <span className="text-stone-850 block">{log.service}</span>
                            <span className="text-[9px] text-stone-400 font-bold uppercase">{log.endpoint}</span>
                          </td>
                          <td className="p-3 text-center text-stone-700">{log.callCount}</td>
                          <td className="p-3 text-right font-black text-amber-900">${Number(log.estimatedCost).toFixed(4)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
