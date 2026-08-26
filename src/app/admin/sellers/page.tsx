'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { 
  UserSquare2, 
  Plus, 
  Edit2, 
  Trash2, 
  Loader2, 
  Mail, 
  Phone, 
  Target, 
  Calendar,
  ToggleLeft,
  ToggleRight
} from 'lucide-react';

import { errorMessage, apiErrorMessage } from '@/lib/errors';

interface Neighborhood {
  id: string;
  name: string;
}

interface Seller {
  id: string;
  name: string;
  phone?: string | null;
  active: boolean;
  startDate: string;
  goal: number;
  user: {
    id: string;
    email: string;
    phone?: string | null;
    active: boolean;
  };
  neighborhoods: Neighborhood[];
}

interface SellersResponse {
  data?: Seller[];
  error?: string;
}

interface MutationResponse {
  error?: string;
}

/** Corpo enviado ao criar/editar vendedor. A senha só vai quando informada. */
interface SellerPayload {
  name: string;
  email: string;
  phone: string;
  goal: string;
  active: boolean;
  startDate: string;
  password?: string;
}

export default function AdminSellersPage() {
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Estados de formulário
  const [showForm, setShowForm] = useState(false);
  const [sellerId, setSellerId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [goal, setGoal] = useState('10');
  const [active, setActive] = useState(true);
  const [startDate, setStartDate] = useState('');
  const [formLoading, setFormLoading] = useState(false);

  const loadSellers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/sellers');
      const data: SellersResponse = await res.json();
      if (!res.ok) throw new Error(apiErrorMessage(data, 'Erro ao carregar vendedores.'));
      setSellers(data.data ?? []);
    } catch (err: unknown) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // A carga roda fora do corpo síncrono do efeito para não encadear renders.
    void (async () => {
      await loadSellers();
    })();
  }, [loadSellers]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);
    try {
      const url = sellerId ? `/api/sellers/${sellerId}` : '/api/sellers';
      const method = sellerId ? 'PUT' : 'POST';
      const payload: SellerPayload = { name, email, phone, goal, active, startDate };
      
      // Senha é obrigatória na criação, opcional na edição
      if (password) {
        payload.password = password;
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json: MutationResponse = await res.json();
      if (!res.ok) throw new Error(apiErrorMessage(json, 'Erro ao salvar vendedor.'));

      // Reset form
      setSellerId(null);
      setName('');
      setEmail('');
      setPassword('');
      setPhone('');
      setGoal('10');
      setActive(true);
      setStartDate('');
      setShowForm(false);

      await loadSellers();
      alert('Vendedor salvo com sucesso!');
    } catch (err: unknown) {
      alert(errorMessage(err));
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja realmente excluir este vendedor permanentemente?')) return;
    try {
      const res = await fetch(`/api/sellers/${id}`, { method: 'DELETE' });
      const json: MutationResponse = await res.json();
      if (!res.ok) throw new Error(apiErrorMessage(json, 'Erro ao excluir vendedor.'));
      
      await loadSellers();
      alert('Vendedor excluído do sistema.');
    } catch (err: unknown) {
      alert(errorMessage(err));
    }
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black text-stone-900 tracking-tight">Equipe de Vendas</h2>
          <p className="text-xs text-stone-500 font-medium">Controle de vendedores, metas de novos revendedores e monitoramento de territórios</p>
        </div>

        <button
          onClick={() => { 
            setSellerId(null); 
            setName(''); 
            setEmail(''); 
            setPassword(''); 
            setPhone(''); 
            setGoal('10'); 
            setActive(true); 
            setStartDate(new Date().toISOString().split('T')[0]);
            setShowForm(true); 
          }}
          className="flex items-center gap-1.5 rounded-lg bg-amber-700 hover:bg-amber-800 text-white px-4 py-2 text-xs font-bold transition-all cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          Cadastrar Vendedor
        </button>
      </div>

      {loading ? (
        <div className="flex h-60 items-center justify-center gap-2 bg-white rounded-2xl border border-stone-200">
          <Loader2 className="h-6 w-6 animate-spin text-amber-700" />
          <p className="text-xs text-stone-500 font-medium">Carregando lista de vendedores...</p>
        </div>
      ) : error ? (
        <div className="p-4 bg-red-50 text-red-750 text-xs text-center border border-red-200 rounded-xl">{error}</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sellers.map((seller) => (
            <div key={seller.id} className="rounded-2xl bg-white border border-stone-200 p-5 shadow-sm space-y-4 animate-fadeIn">
              <div className="flex justify-between items-start">
                <div className="min-w-0">
                  <h4 className="text-sm font-extrabold text-stone-850 flex items-center gap-2 truncate">
                    <UserSquare2 className="h-4.5 w-4.5 text-amber-700" />
                    {seller.name}
                  </h4>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded inline-block mt-1 ${
                    seller.active ? 'bg-emerald-50 text-emerald-800 border border-emerald-100' : 'bg-red-50 text-red-800 border border-red-100'
                  }`}>
                    {seller.active ? 'ATIVO' : 'DESATIVADO'}
                  </span>
                </div>

                <div className="flex gap-1.5">
                  <button
                    onClick={() => { 
                      setSellerId(seller.id); 
                      setName(seller.name); 
                      setEmail(seller.user.email); 
                      setPassword(''); // não preencher
                      setPhone(seller.phone || ''); 
                      setGoal(String(seller.goal)); 
                      setActive(seller.active); 
                      setStartDate(seller.startDate.split('T')[0]);
                      setShowForm(true); 
                    }}
                    className="p-1 text-stone-400 hover:text-amber-700 hover:bg-stone-50 rounded transition-all cursor-pointer"
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(seller.id)}
                    className="p-1 text-stone-400 hover:text-red-600 hover:bg-stone-50 rounded transition-all cursor-pointer"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Informações de Contato */}
              <div className="text-xs text-stone-600 space-y-1.5 pt-2 border-t border-stone-100">
                <p className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-stone-400 shrink-0" />
                  <span className="truncate">{seller.user.email}</span>
                </p>
                <p className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-stone-400 shrink-0" />
                  <span>{seller.phone || 'Telefone não cadastrado'}</span>
                </p>
                <p className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-stone-400 shrink-0" />
                  <span>Meta Mensal: <strong className="text-amber-800 font-extrabold">{seller.goal} novos pontos</strong></span>
                </p>
                <p className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-stone-400 shrink-0" />
                  <span>Contratado em: {new Date(seller.startDate).toLocaleDateString('pt-BR')}</span>
                </p>
              </div>

              {/* Territórios Associados */}
              <div className="pt-2 border-t border-stone-100 space-y-2">
                <span className="text-[10px] text-stone-400 font-bold uppercase block">Bairros sob responsabilidade:</span>
                {seller.neighborhoods.length === 0 ? (
                  <span className="text-[10px] text-orange-700 font-bold bg-orange-50 px-2 py-0.5 rounded border border-orange-100 block w-fit">SEM TERRITÓRIOS</span>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {seller.neighborhoods.map((n) => (
                      <span 
                        key={n.id} 
                        className="rounded bg-stone-50 border border-stone-150 px-2 py-0.5 text-[9px] font-bold text-stone-550"
                      >
                        {n.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal CRUD Vendedor */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full border border-stone-200 shadow-xl space-y-4">
            <h3 className="font-bold text-sm text-stone-900">{sellerId ? 'Editar Vendedor' : 'Cadastrar Vendedor'}</h3>
            
            <form onSubmit={handleSave} className="space-y-4 text-xs font-semibold text-stone-600">
              <div>
                <label className="block mb-1">Nome Completo</label>
                <input
                  type="text"
                  placeholder="Ex: João da Silva"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="block w-full rounded-lg border border-stone-300 bg-stone-50 p-2.5 text-stone-900 focus:bg-white"
                  required
                />
              </div>

              <div>
                <label className="block mb-1">E-mail Institucional</label>
                <input
                  type="email"
                  placeholder="joao@prigor.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full rounded-lg border border-stone-300 bg-stone-50 p-2.5 text-stone-900 focus:bg-white"
                  required
                />
              </div>

              <div>
                <label className="block mb-1">{sellerId ? 'Alterar Senha (deixe em branco para manter)' : 'Senha de Acesso'}</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full rounded-lg border border-stone-300 bg-stone-50 p-2.5 text-stone-900 focus:bg-white"
                  required={!sellerId}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block mb-1">Telefone / WhatsApp</label>
                  <input
                    type="text"
                    placeholder="21999998888"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="block w-full rounded-lg border border-stone-300 bg-stone-50 p-2.5 text-stone-900 focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block mb-1">Meta Mensal (Pontos)</label>
                  <input
                    type="number"
                    min="1"
                    value={goal}
                    onChange={(e) => setGoal(e.target.value)}
                    className="block w-full rounded-lg border border-stone-300 bg-stone-50 p-2.5 text-stone-900 focus:bg-white"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block mb-1">Data de Contratação / Início</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="block w-full rounded-lg border border-stone-300 bg-stone-50 p-2.5 text-stone-900 focus:bg-white"
                  required
                />
              </div>

              <div className="flex items-center justify-between p-2 rounded-lg bg-stone-50 border border-stone-150">
                <span>Vendedor Ativo?</span>
                <button
                  type="button"
                  onClick={() => setActive(!active)}
                  className="text-stone-500 hover:text-amber-800 cursor-pointer"
                >
                  {active ? <ToggleRight className="h-8 w-8 text-amber-700" /> : <ToggleLeft className="h-8 w-8 text-stone-400" />}
                </button>
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="rounded-lg border border-stone-300 px-4 py-2 text-xs font-bold text-stone-650 hover:bg-stone-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="rounded-lg bg-amber-700 px-4 py-2 text-xs font-bold text-white hover:bg-amber-800 transition-colors cursor-pointer"
                >
                  {formLoading ? 'Gravando...' : 'Salvar Vendedor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
