'use client';

import React, { useState, useEffect } from 'react';
import { 
  Sliders, 
  Save, 
  Loader2, 
  History, 
  AlertCircle,
  CheckCircle,
  Flame,
  Info
} from 'lucide-react';

interface ScoreSettings {
  categoryWeight: number;
  compatibilityWeight: number;
  commercialWeight: number;
  regionWeight: number;
  digitalWeight: number;
  nearbyWeight: number;
  dataQualityWeight: number;
}

interface ScoreHistory {
  id: string;
  createdAt: string;
  updatedBy: string;
  reason?: string | null;
  weights: any;
}

export default function AdminScorePage() {
  const [weights, setWeights] = useState<ScoreSettings | null>(null);
  const [history, setHistory] = useState<ScoreHistory[]>([]);
  const [loading, setLoading] = useState(true);

  // Form edit fields
  const [catW, setCatW] = useState(0);
  const [compW, setCompW] = useState(0);
  const [commW, setCommW] = useState(0);
  const [regW, setRegW] = useState(0);
  const [digW, setDigW] = useState(0);
  const [nearW, setNearW] = useState(0);
  const [dqW, setDqW] = useState(0);
  const [reason, setReason] = useState('');
  
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveResult, setSaveResult] = useState<string | null>(null);

  useEffect(() => {
    loadScoreSettings();
  }, []);

  const loadScoreSettings = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/settings/score');
      const json = await res.json();
      if (res.ok) {
        setWeights(json.settings);
        setHistory(json.history || []);
        
        // Inicializar inputs
        if (json.settings) {
          setCatW(json.settings.categoryWeight);
          setCompW(json.settings.compatibilityWeight);
          setCommW(json.settings.commercialWeight);
          setRegW(json.settings.regionWeight);
          setDigW(json.settings.digitalWeight);
          setNearW(json.settings.nearbyWeight);
          setDqW(json.settings.dataQualityWeight);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const currentSum = catW + compW + commW + regW + digW + nearW + dqW;
  const isValid = currentSum === 100;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) {
      alert(`A soma dos pesos deve ser exatamente 100%. Soma atual: ${currentSum}%`);
      return;
    }

    setSaveLoading(true);
    setSaveResult(null);
    try {
      const res = await fetch('/api/settings/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryWeight: catW,
          compatibilityWeight: compW,
          commercialWeight: commW,
          regionWeight: regW,
          digitalWeight: digW,
          nearbyWeight: nearW,
          dataQualityWeight: dqW,
          reason,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erro ao calibrar score.');

      setSaveResult(json.message);
      setReason('');
      
      // Recarregar
      await loadScoreSettings();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaveLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div>
        <h2 className="text-2xl font-black text-stone-900 tracking-tight">Calibrar Prigor Score</h2>
        <p className="text-xs text-stone-500 font-medium">Ajuste os critérios de atratividade de leads quentes da Doces Prigor</p>
      </div>

      {loading ? (
        <div className="flex h-60 items-center justify-center bg-white rounded-2xl border border-stone-200">
          <Loader2 className="h-6 w-6 animate-spin text-amber-700" />
          <p className="text-xs text-stone-500">Buscando parametrizações de score...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Formulário de Pesos */}
          <div className="rounded-2xl bg-white p-5 border border-stone-200 shadow-sm space-y-4 lg:col-span-1 h-fit">
            <h3 className="text-sm font-bold text-stone-850 flex items-center gap-2">
              <Sliders className="h-4.5 w-4.5 text-amber-700" />
              Pesos de Calibração
            </h3>

            <p className="text-xs text-stone-600 leading-relaxed">
              Modifique a relevância percentual de cada parâmetro comercial. A soma dos pesos deve totalizar exatamente 100%.
            </p>

            <form onSubmit={handleSave} className="space-y-3.5 text-xs font-semibold text-stone-600">
              {/* Categoria */}
              <div className="space-y-1">
                <div className="flex justify-between">
                  <label>1. Categoria Comercial (Brownie/Doce)</label>
                  <span className="text-amber-800">{catW}%</span>
                </div>
                <input
                  type="range" min="0" max="50" step="5"
                  value={catW} onChange={(e) => setCatW(parseInt(e.target.value))}
                  className="w-full h-1.5 bg-stone-200 rounded-lg appearance-none cursor-pointer accent-amber-700"
                />
              </div>

              {/* Compatibilidade */}
              <div className="space-y-1">
                <div className="flex justify-between">
                  <label>2. Compatibilidade (Cafés/Docerias)</label>
                  <span className="text-amber-800">{compW}%</span>
                </div>
                <input
                  type="range" min="0" max="50" step="5"
                  value={compW} onChange={(e) => setCompW(parseInt(e.target.value))}
                  className="w-full h-1.5 bg-stone-200 rounded-lg appearance-none cursor-pointer accent-amber-700"
                />
              </div>

              {/* Potencial Comercial */}
              <div className="space-y-1">
                <div className="flex justify-between">
                  <label>3. Potencial Google (Rating/Nota)</label>
                  <span className="text-amber-800">{commW}%</span>
                </div>
                <input
                  type="range" min="0" max="50" step="5"
                  value={commW} onChange={(e) => setCommW(parseInt(e.target.value))}
                  className="w-full h-1.5 bg-stone-200 rounded-lg appearance-none cursor-pointer accent-amber-700"
                />
              </div>

              {/* Território */}
              <div className="space-y-1">
                <div className="flex justify-between">
                  <label>4. Região Estratégica (Ativa)</label>
                  <span className="text-amber-800">{regW}%</span>
                </div>
                <input
                  type="range" min="0" max="50" step="5"
                  value={regW} onChange={(e) => setRegW(parseInt(e.target.value))}
                  className="w-full h-1.5 bg-stone-200 rounded-lg appearance-none cursor-pointer accent-amber-700"
                />
              </div>

              {/* Presença Digital */}
              <div className="space-y-1">
                <div className="flex justify-between">
                  <label>5. Presença Digital (Website/Reviews)</label>
                  <span className="text-amber-800">{digW}%</span>
                </div>
                <input
                  type="range" min="0" max="50" step="5"
                  value={digW} onChange={(e) => setDigW(parseInt(e.target.value))}
                  className="w-full h-1.5 bg-stone-200 rounded-lg appearance-none cursor-pointer accent-amber-700"
                />
              </div>

              {/* Clientes Próximos */}
              <div className="space-y-1">
                <div className="flex justify-between">
                  <label>6. Densidade Prigor (Clientes perto)</label>
                  <span className="text-amber-800">{nearW}%</span>
                </div>
                <input
                  type="range" min="0" max="50" step="5"
                  value={nearW} onChange={(e) => setNearW(parseInt(e.target.value))}
                  className="w-full h-1.5 bg-stone-200 rounded-lg appearance-none cursor-pointer accent-amber-700"
                />
              </div>

              {/* Qualidade de Dados */}
              <div className="space-y-1">
                <div className="flex justify-between">
                  <label>7. Qualidade dos Dados (CNPJ/Phone)</label>
                  <span className="text-amber-800">{dqW}%</span>
                </div>
                <input
                  type="range" min="0" max="50" step="5"
                  value={dqW} onChange={(e) => setDqW(parseInt(e.target.value))}
                  className="w-full h-1.5 bg-stone-200 rounded-lg appearance-none cursor-pointer accent-amber-700"
                />
              </div>

              {/* Indicador de Soma */}
              <div className={`p-3.5 rounded-xl border flex items-center justify-between font-bold text-xs ${
                isValid ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800 animate-pulse'
              }`}>
                <span className="flex items-center gap-1">
                  <Info className="h-4 w-4" />
                  Soma Total:
                </span>
                <span className="text-sm">{currentSum}% / 100%</span>
              </div>

              {/* Motivo do Ajuste */}
              <div>
                <label className="block mb-1">Justificativa do Ajuste</label>
                <input
                  type="text"
                  placeholder="Ex: Aumentar relevância de cafeterias no inverno"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="block w-full rounded-lg border border-stone-300 bg-stone-50 p-2.5 text-stone-900 focus:bg-white focus:outline-none"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={saveLoading || !isValid}
                className="flex w-full justify-center items-center gap-2 rounded-xl bg-amber-700 py-3 text-sm font-bold text-white shadow-md hover:bg-amber-800 disabled:opacity-50 transition-all cursor-pointer"
              >
                {saveLoading ? (
                  <>
                    <Loader2 className="h-4.5 w-4.5 animate-spin" />
                    Recalculando Leads do Banco...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    Salvar e Recalcular
                  </>
                )}
              </button>

              {saveResult && (
                <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3.5 text-emerald-800 font-medium flex items-start gap-2">
                  <CheckCircle className="h-5 w-5 shrink-0 text-emerald-600" />
                  <span>{saveResult}</span>
                </div>
              )}
            </form>
          </div>

          {/* Histórico das Alterações */}
          <div className="rounded-2xl bg-white p-5 border border-stone-200 shadow-sm space-y-4 lg:col-span-2">
            <h3 className="text-sm font-bold text-stone-850 flex items-center gap-2">
              <History className="h-4.5 w-4.5 text-amber-700" />
              Histórico de Calibragem do Score
            </h3>

            {history.length === 0 ? (
              <div className="p-12 border border-dashed border-stone-300 rounded-xl text-center text-stone-500 italic text-xs">
                Nenhuma alteração de calibragem gravada.
              </div>
            ) : (
              <div className="space-y-4 max-h-[500px] overflow-y-auto pr-1">
                {history.map((hist) => {
                  const w = hist.weights;
                  return (
                    <div key={hist.id} className="rounded-xl border border-stone-200 p-4 space-y-2 bg-stone-50/30 text-xs font-semibold text-stone-650">
                      <div className="flex justify-between items-center text-stone-400">
                        <span className="flex items-center gap-1">
                          👤 Modificado por <strong>{hist.updatedBy}</strong>
                        </span>
                        <span>{new Date(hist.createdAt).toLocaleString('pt-BR')}</span>
                      </div>
                      
                      <p className="text-stone-700 font-bold">Motivo: {hist.reason || 'Sem justificativa informada'}</p>
                      
                      {/* Distribuição dos Pesos Históricos */}
                      <div className="flex flex-wrap gap-2 text-[10px] text-stone-500">
                        <span className="bg-stone-100 px-2 py-0.5 rounded">Categoria: {w.categoryWeight}%</span>
                        <span className="bg-stone-100 px-2 py-0.5 rounded">Compatibilidade: {w.compatibilityWeight}%</span>
                        <span className="bg-stone-100 px-2 py-0.5 rounded">Google: {w.commercialWeight}%</span>
                        <span className="bg-stone-100 px-2 py-0.5 rounded">Região: {w.regionWeight}%</span>
                        <span className="bg-stone-100 px-2 py-0.5 rounded">Digital: {w.digitalWeight}%</span>
                        <span className="bg-stone-100 px-2 py-0.5 rounded">Densidade: {w.nearbyWeight}%</span>
                        <span className="bg-stone-100 px-2 py-0.5 rounded">Dados: {w.dataQualityWeight}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
