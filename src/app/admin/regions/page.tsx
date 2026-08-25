'use client';

import React, { useState, useEffect } from 'react';
import { 
  Map, 
  MapPin, 
  Plus, 
  Edit2, 
  Trash2, 
  Loader2,
  CheckCircle,
  ToggleLeft,
  ToggleRight
} from 'lucide-react';

interface Neighborhood {
  id: string;
  name: string;
  city: string;
  state: string;
  sellerId?: string | null;
  seller?: { name: string } | null;
  active: boolean;
}

interface Region {
  id: string;
  name: string;
  description?: string;
  active: boolean;
  neighborhoods: Neighborhood[];
}

interface Seller {
  id: string;
  name: string;
}

export default function AdminRegionsPage() {
  const [regions, setRegions] = useState<Region[]>([]);
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form de Região
  const [showRegForm, setShowRegForm] = useState(false);
  const [regId, setRegId] = useState<string | null>(null);
  const [regName, setRegName] = useState('');
  const [regDesc, setRegDesc] = useState('');
  const [regActive, setRegActive] = useState(true);
  const [regLoading, setRegLoading] = useState(false);

  // Form de Bairro
  const [showNeighForm, setShowNeighForm] = useState(false);
  const [neighId, setNeighId] = useState<string | null>(null);
  const [neighName, setNeighName] = useState('');
  const [neighCity, setNeighCity] = useState('Rio de Janeiro');
  const [neighState, setNeighState] = useState('RJ');
  const [neighRegionId, setNeighRegionId] = useState('');
  const [neighSellerId, setNeighSellerId] = useState('');
  const [neighActive, setNeighActive] = useState(true);
  const [neighLoading, setNeighLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [regRes, sellersRes] = await Promise.all([
        fetch('/api/regions'),
        fetch('/api/sellers'),
      ]);

      const regJson = await regRes.json();
      const sellersJson = await sellersRes.json();

      if (!regRes.ok || !sellersRes.ok) {
        throw new Error('Erro ao carregar dados territoriais.');
      }

      setRegions(regJson.regions || []);
      setSellers(sellersJson.sellers || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveRegion = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegLoading(true);
    try {
      const url = regId ? `/api/regions/${regId}` : '/api/regions';
      const method = regId ? 'PUT' : 'POST';
      const payload = { name: regName, description: regDesc, active: regActive };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erro ao salvar região.');

      // Reset form
      setRegId(null);
      setRegName('');
      setRegDesc('');
      setRegActive(true);
      setShowRegForm(false);
      
      // Recarregar
      await loadData();
      alert('Região salva com sucesso!');
    } catch (err: any) {
      alert(err.message);
    } finally {
      setRegLoading(false);
    }
  };

  const handleDeleteRegion = async (id: string) => {
    if (!confirm('Deseja realmente excluir esta região? Isso falhará se houver bairros associados.')) return;
    try {
      const res = await fetch(`/api/regions/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erro ao excluir região.');
      
      await loadData();
      alert('Região excluída.');
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleSaveNeighborhood = async (e: React.FormEvent) => {
    e.preventDefault();
    setNeighLoading(true);
    try {
      const url = neighId ? `/api/neighborhoods/${neighId}` : '/api/neighborhoods';
      const method = neighId ? 'PUT' : 'POST';
      const payload = { 
        name: neighName, 
        city: neighCity, 
        state: neighState, 
        regionId: neighRegionId, 
        sellerId: neighSellerId || '',
        active: neighActive 
      };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erro ao salvar bairro.');

      // Reset
      setNeighId(null);
      setNeighName('');
      setNeighRegionId('');
      setNeighSellerId('');
      setNeighActive(true);
      setShowNeighForm(false);

      await loadData();
      alert('Bairro salvo e atribuído com sucesso!');
    } catch (err: any) {
      alert(err.message);
    } finally {
      setNeighLoading(false);
    }
  };

  const handleDeleteNeighborhood = async (id: string) => {
    if (!confirm('Deseja realmente excluir este bairro?')) return;
    try {
      const res = await fetch(`/api/neighborhoods/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erro ao excluir bairro.');
      
      await loadData();
      alert('Bairro excluído.');
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black text-stone-900 tracking-tight">Regiões e Bairros</h2>
          <p className="text-xs text-stone-500 font-medium">Controle de territórios e atribuição de responsabilidades comerciais</p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => { setRegId(null); setRegName(''); setRegDesc(''); setRegActive(true); setShowRegForm(true); }}
            className="flex items-center gap-1.5 rounded-lg bg-amber-700 hover:bg-amber-800 text-white px-4 py-2 text-xs font-bold transition-all cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            Nova Região
          </button>
          
          <button
            onClick={() => { setNeighId(null); setNeighName(''); setNeighRegionId(''); setNeighSellerId(''); setNeighActive(true); setShowNeighForm(true); }}
            className="flex items-center gap-1.5 rounded-lg border border-stone-300 hover:bg-stone-50 text-stone-700 px-4 py-2 text-xs font-bold transition-all cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            Cadastrar Bairro
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex h-60 items-center justify-center gap-2 bg-white rounded-2xl border border-stone-200">
          <Loader2 className="h-6 w-6 animate-spin text-amber-700" />
          <p className="text-xs text-stone-500 font-medium">Mapeando territórios de vendas...</p>
        </div>
      ) : error ? (
        <div className="p-4 bg-red-50 text-red-750 text-xs text-center border border-red-200 rounded-xl">{error}</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Listagem de Regiões */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-stone-500 uppercase tracking-wider px-1">Regiões Ativas ({regions.length})</h3>

            <div className="space-y-3">
              {regions.map((reg) => (
                <div key={reg.id} className="rounded-xl bg-white border border-stone-200 p-5 shadow-sm space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="text-sm font-extrabold text-stone-850 flex items-center gap-2">
                        <Map className="h-4.5 w-4.5 text-amber-700" />
                        {reg.name}
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                          reg.active ? 'bg-emerald-50 text-emerald-800 border border-emerald-100' : 'bg-red-50 text-red-800 border border-red-100'
                        }`}>
                          {reg.active ? 'ATIVO' : 'INATIVO'}
                        </span>
                      </h4>
                      {reg.description && <p className="text-[11px] text-stone-400 mt-0.5">{reg.description}</p>}
                    </div>

                    <div className="flex gap-1.5 shrink-0">
                      <button
                        onClick={() => { setRegId(reg.id); setRegName(reg.name); setRegDesc(reg.description || ''); setRegActive(reg.active); setShowRegForm(true); }}
                        className="p-1 text-stone-400 hover:text-amber-750 hover:bg-stone-50 rounded transition-all cursor-pointer"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteRegion(reg.id)}
                        className="p-1 text-stone-400 hover:text-red-600 hover:bg-stone-50 rounded transition-all cursor-pointer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* Listagem de bairros associados àquela região */}
                  <div className="pt-2 border-t border-stone-100 space-y-1.5">
                    <span className="text-[10px] text-stone-400 font-bold uppercase tracking-wider block">Bairros associados:</span>
                    {reg.neighborhoods.length === 0 ? (
                      <span className="text-[10px] text-stone-400 italic block">Nenhum bairro cadastrado nesta região.</span>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {reg.neighborhoods.map((n) => (
                          <div 
                            key={n.id}
                            className="rounded-lg bg-stone-50 border border-stone-150 px-2 py-1 text-[10px] font-bold text-stone-600 flex items-center gap-1 cursor-default"
                          >
                            <MapPin className="h-3 w-3 text-stone-400" />
                            {n.name}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Listagem Geral de Bairros com Vendedores */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-stone-500 uppercase tracking-wider px-1">Atribuição por Bairro</h3>

            <div className="rounded-2xl bg-white border border-stone-200 shadow-sm overflow-hidden">
              <div className="overflow-y-auto max-h-[550px]">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-stone-200 bg-stone-50 text-stone-400 font-bold uppercase tracking-wider">
                      <th className="p-3">Bairro / Cidade</th>
                      <th className="p-3">Região</th>
                      <th className="p-3">Vendedor Atribuído</th>
                      <th className="p-3 text-center">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {regions.flatMap(r => r.neighborhoods.map(n => ({ ...n, regionName: r.name, regionId: r.id }))).map((n) => (
                      <tr key={n.id} className="hover:bg-stone-50/50">
                        <td className="p-3">
                          <span className="font-bold text-stone-850 block">{n.name}</span>
                          <span className="text-[9px] text-stone-400 font-medium">{n.city} - {n.state}</span>
                        </td>
                        <td className="p-3 text-stone-500 font-semibold">{n.regionName}</td>
                        <td className="p-3">
                          {n.sellerId ? (
                            <span className="rounded bg-emerald-50 text-emerald-800 border border-emerald-100 font-extrabold text-[10px] px-2 py-0.5">{n.seller?.name}</span>
                          ) : (
                            <span className="rounded bg-orange-50 text-orange-850 border border-orange-150 font-extrabold text-[10px] px-2 py-0.5">SEM VENDEDOR (FILA)</span>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex gap-2 justify-center">
                            <button
                              onClick={() => { 
                                setNeighId(n.id); 
                                setNeighName(n.name); 
                                setNeighCity(n.city); 
                                setNeighState(n.state); 
                                setNeighRegionId(n.regionId); 
                                setNeighSellerId(n.sellerId || ''); 
                                setNeighActive(n.active); 
                                setShowNeighForm(true); 
                              }}
                              className="p-1 text-stone-400 hover:text-amber-700 transition-colors cursor-pointer"
                            >
                              <Edit2 className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteNeighborhood(n.id)}
                              className="p-1 text-stone-400 hover:text-red-600 transition-colors cursor-pointer"
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
          </div>
        </div>
      )}

      {/* Modal CRUD Região */}
      {showRegForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full border border-stone-200 shadow-xl space-y-4">
            <h3 className="font-bold text-sm text-stone-900">{regId ? 'Editar Região' : 'Nova Região'}</h3>
            
            <form onSubmit={handleSaveRegion} className="space-y-4 text-xs font-semibold text-stone-600">
              <div>
                <label className="block mb-1">Nome da Região</label>
                <input
                  type="text"
                  placeholder="Ex: Zona Oeste, Centro"
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  className="block w-full rounded-lg border border-stone-300 bg-stone-50 p-2.5 text-stone-900"
                  required
                />
              </div>

              <div>
                <label className="block mb-1">Descrição</label>
                <textarea
                  placeholder="Detalhes sobre a região..."
                  value={regDesc}
                  onChange={(e) => setRegDesc(e.target.value)}
                  rows={2}
                  className="block w-full rounded-lg border border-stone-300 bg-stone-50 p-2 text-stone-900"
                />
              </div>

              <div className="flex items-center justify-between p-2 rounded-lg bg-stone-50 border border-stone-150">
                <span>Região Ativa?</span>
                <button
                  type="button"
                  onClick={() => setRegActive(!regActive)}
                  className="text-stone-500 hover:text-amber-800 cursor-pointer"
                >
                  {regActive ? <ToggleRight className="h-8 w-8 text-amber-700" /> : <ToggleLeft className="h-8 w-8 text-stone-400" />}
                </button>
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowRegForm(false)}
                  className="rounded-lg border border-stone-300 px-4 py-2 text-xs font-bold text-stone-650 hover:bg-stone-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={regLoading}
                  className="rounded-lg bg-amber-700 px-4 py-2 text-xs font-bold text-white hover:bg-amber-800 transition-colors cursor-pointer"
                >
                  {regLoading ? 'Gravando...' : 'Salvar Região'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal CRUD Bairro */}
      {showNeighForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full border border-stone-200 shadow-xl space-y-4">
            <h3 className="font-bold text-sm text-stone-900">{neighId ? 'Editar Bairro' : 'Cadastrar Bairro'}</h3>
            
            <form onSubmit={handleSaveNeighborhood} className="space-y-4 text-xs font-semibold text-stone-600">
              <div>
                <label className="block mb-1">Nome do Bairro</label>
                <input
                  type="text"
                  placeholder="Ex: Botafogo, Lapa"
                  value={neighName}
                  onChange={(e) => setNeighName(e.target.value)}
                  className="block w-full rounded-lg border border-stone-300 bg-stone-50 p-2.5 text-stone-900"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block mb-1">Cidade</label>
                  <input
                    type="text"
                    value={neighCity}
                    onChange={(e) => setNeighCity(e.target.value)}
                    className="block w-full rounded-lg border border-stone-300 bg-stone-50 p-2 text-stone-900"
                    required
                  />
                </div>
                <div>
                  <label className="block mb-1">Estado</label>
                  <input
                    type="text"
                    value={neighState}
                    onChange={(e) => setNeighState(e.target.value)}
                    className="block w-full rounded-lg border border-stone-300 bg-stone-50 p-2 text-stone-900"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block mb-1">Região Geográfica</label>
                <select
                  value={neighRegionId}
                  onChange={(e) => setNeighRegionId(e.target.value)}
                  className="block w-full rounded-lg border border-stone-300 bg-stone-50 p-2 text-stone-900 focus:outline-none"
                  required
                >
                  <option value="">Selecione a região...</option>
                  {regions.map(r => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block mb-1">Vendedor Atribuído (Território)</label>
                <select
                  value={neighSellerId}
                  onChange={(e) => setNeighSellerId(e.target.value)}
                  className="block w-full rounded-lg border border-stone-300 bg-stone-50 p-2 text-stone-900 focus:outline-none"
                >
                  <option value="">Fila de Triagem (Sem Vendedor)</option>
                  {sellers.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <p className="text-[9px] text-stone-400 mt-1 font-medium">Nota: Mudar o vendedor do bairro reatribuirá automaticamente todos os leads ativos deste bairro.</p>
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowNeighForm(false)}
                  className="rounded-lg border border-stone-300 px-4 py-2 text-xs font-bold text-stone-650 hover:bg-stone-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={neighLoading}
                  className="rounded-lg bg-amber-700 px-4 py-2 text-xs font-bold text-white hover:bg-amber-800 transition-colors cursor-pointer"
                >
                  {neighLoading ? 'Gravando...' : 'Salvar Bairro'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
