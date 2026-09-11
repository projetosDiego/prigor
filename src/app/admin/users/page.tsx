'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { ShieldCheck, Plus, Edit2, Trash2, Loader2, Mail, ToggleLeft, ToggleRight } from 'lucide-react';

import { errorMessage, apiErrorMessage } from '@/lib/errors';

interface UserRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  active: boolean;
}

interface ListResponse {
  data?: UserRow[];
}

const ROLE_LABEL: Record<string, string> = { ADMIN: 'Administrador', MANAGER: 'Gerente' };

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('MANAGER');
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/users');
      const data: ListResponse = await res.json();
      if (!res.ok) throw new Error(apiErrorMessage(data, 'Erro ao carregar usuários.'));
      setUsers(data.data ?? []);
    } catch (err: unknown) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const openCreate = () => {
    setEditId(null); setName(''); setEmail(''); setPassword(''); setPhone(''); setRole('MANAGER'); setActive(true); setShowForm(true);
  };
  const openEdit = (u: UserRow) => {
    setEditId(u.id); setName(u.name); setEmail(u.email); setPassword(''); setPhone(u.phone ?? ''); setRole(u.role); setActive(u.active); setShowForm(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const url = editId ? `/api/users/${editId}` : '/api/users';
      const method = editId ? 'PUT' : 'POST';
      const payload: Record<string, unknown> = { name, email, phone, role, active };
      if (password && password.trim()) payload.password = password.trim();
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const json: unknown = await res.json();
      if (!res.ok) throw new Error(apiErrorMessage(json, 'Erro ao salvar usuário.'));
      setShowForm(false);
      await load();
    } catch (err: unknown) {
      alert(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (u: UserRow) => {
    if (!confirm(`Desativar o acesso de "${u.name}"?`)) return;
    try {
      const res = await fetch(`/api/users/${u.id}`, { method: 'DELETE' });
      const json: unknown = await res.json();
      if (!res.ok) throw new Error(apiErrorMessage(json, 'Erro ao desativar.'));
      await load();
    } catch (err: unknown) {
      alert(errorMessage(err));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black text-stone-900 tracking-tight flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-amber-700" />
            Usuários & Acessos
          </h2>
          <p className="text-xs text-stone-500 font-medium">Logins de administradores e gerentes. Vendedores têm login próprio na tela de Vendedores.</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-1.5 rounded-lg bg-amber-700 hover:bg-amber-800 text-white px-4 py-2 text-xs font-bold transition-all cursor-pointer">
          <Plus className="h-4 w-4" /> Novo Usuário
        </button>
      </div>

      {loading ? (
        <div className="flex h-60 items-center justify-center gap-2 bg-white rounded-2xl border border-stone-200">
          <Loader2 className="h-6 w-6 animate-spin text-amber-700" /><span className="text-xs text-stone-500 font-medium">Carregando...</span>
        </div>
      ) : error ? (
        <div className="p-4 bg-red-50 text-red-700 text-xs text-center border border-red-200 rounded-xl">{error}</div>
      ) : (
        <div className="rounded-2xl bg-white border border-stone-200 shadow-sm overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-stone-200 bg-stone-50 text-stone-400 font-bold uppercase tracking-wider">
                <th className="py-3 px-6">Nome</th>
                <th className="py-3 px-6">E-mail</th>
                <th className="py-3 px-6 text-center">Papel</th>
                <th className="py-3 px-6 text-center">Situação</th>
                <th className="py-3 px-6 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 font-semibold text-stone-700">
              {users.length === 0 ? (
                <tr><td colSpan={5} className="py-8 text-center text-stone-400">Nenhum usuário.</td></tr>
              ) : users.map((u) => (
                <tr key={u.id} className="hover:bg-stone-50/50">
                  <td className="py-3 px-6 text-stone-850 font-bold text-sm">{u.name}</td>
                  <td className="py-3 px-6 text-stone-500"><span className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5 text-stone-400" />{u.email}</span></td>
                  <td className="py-3 px-6 text-center">
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${u.role === 'ADMIN' ? 'bg-amber-50 text-amber-800 border-amber-100' : 'bg-sky-50 text-sky-800 border-sky-100'}`}>{ROLE_LABEL[u.role] ?? u.role}</span>
                  </td>
                  <td className="py-3 px-6 text-center">
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${u.active ? 'bg-emerald-50 text-emerald-800 border-emerald-100' : 'bg-red-50 text-red-800 border-red-100'}`}>{u.active ? 'ATIVO' : 'DESATIVADO'}</span>
                  </td>
                  <td className="py-3 px-6 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <button onClick={() => openEdit(u)} className="p-1 text-stone-400 hover:text-amber-700 hover:bg-stone-50 rounded transition-all cursor-pointer"><Edit2 className="h-4 w-4" /></button>
                      {u.active && (
                        <button onClick={() => remove(u)} className="p-1 text-stone-400 hover:text-red-600 hover:bg-stone-50 rounded transition-all cursor-pointer"><Trash2 className="h-4 w-4" /></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full border border-stone-200 shadow-xl space-y-4">
            <h3 className="font-bold text-sm text-stone-900">{editId ? 'Editar Usuário' : 'Novo Usuário'}</h3>
            <form onSubmit={save} className="space-y-4 text-xs font-semibold text-stone-600">
              <div>
                <label className="block mb-1">Nome</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} required className="block w-full rounded-lg border border-stone-300 bg-stone-50 p-2.5 text-stone-900 focus:bg-white" />
              </div>
              <div>
                <label className="block mb-1">E-mail (login)</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="block w-full rounded-lg border border-stone-300 bg-stone-50 p-2.5 text-stone-900 focus:bg-white" />
              </div>
              <div>
                <label className="block mb-1">{editId ? 'Nova senha (em branco = manter)' : 'Senha de acesso'}</label>
                <input type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required={!editId} className="block w-full rounded-lg border border-stone-300 bg-stone-50 p-2.5 text-stone-900 focus:bg-white" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block mb-1">Papel</label>
                  <select value={role} onChange={(e) => setRole(e.target.value)} className="block w-full rounded-lg border border-stone-300 bg-stone-50 p-2.5 text-stone-900 focus:bg-white">
                    <option value="MANAGER">Gerente</option>
                    <option value="ADMIN">Administrador</option>
                  </select>
                </div>
                <div>
                  <label className="block mb-1">Telefone</label>
                  <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} className="block w-full rounded-lg border border-stone-300 bg-stone-50 p-2.5 text-stone-900 focus:bg-white" />
                </div>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-stone-50 border border-stone-150">
                <span>Usuário ativo?</span>
                <button type="button" onClick={() => setActive(!active)} className="text-stone-500 hover:text-amber-800 cursor-pointer">
                  {active ? <ToggleRight className="h-8 w-8 text-amber-700" /> : <ToggleLeft className="h-8 w-8 text-stone-400" />}
                </button>
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="rounded-lg border border-stone-300 px-4 py-2 text-xs font-bold text-stone-650 hover:bg-stone-50 cursor-pointer">Cancelar</button>
                <button type="submit" disabled={saving} className="rounded-lg bg-amber-700 px-4 py-2 text-xs font-bold text-white hover:bg-amber-800 transition-colors cursor-pointer">{saving ? 'Gravando...' : 'Salvar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
