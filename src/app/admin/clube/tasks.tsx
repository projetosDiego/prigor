'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Edit2, Loader2, Plus } from 'lucide-react';

import { errorMessage } from '@/lib/errors';
import { api, Field, inputCls, Modal, Toggle } from './parts';

interface Task {
  id: string;
  code: string;
  title: string;
  description: string | null;
  points: number;
  actionUrl: string | null;
  actionLabel: string | null;
  proof: string;
  cooldownDays: number | null;
  active: boolean;
  sortOrder: number;
  approved: number;
  pending: number;
  rejected: number;
}

export default function TasksTab() {
  const [rows, setRows] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Task | 'new' | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows((await api<{ data: Task[] }>('/api/clube/tarefas')).data);
    } catch (err: unknown) {
      alert(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-stone-500 max-w-xl">
          Referência: <b>100 pontos = 1 brownie</b>. Tarefas com print entram em <b>Análises</b>. A indicação credita sozinha quando o
          amigo usa o cupom dele num ponto (máx. 10 por mês por cliente).
        </p>
        <button onClick={() => setEditing('new')} className="flex items-center gap-1.5 rounded-lg bg-amber-700 px-4 py-2 text-xs font-bold text-white">
          <Plus className="h-4 w-4" /> Nova tarefa
        </button>
      </div>

      <div className="rounded-xl border border-stone-200 bg-white overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-stone-50 text-stone-500 uppercase text-[10px]">
            <tr>
              <th className="text-left px-4 py-2">Tarefa</th>
              <th className="text-right px-4 py-2">Pontos</th>
              <th className="text-left px-4 py-2">Repetição</th>
              <th className="text-right px-4 py-2">Aprovadas</th>
              <th className="text-right px-4 py-2">Pendentes</th>
              <th className="text-right px-4 py-2">Recusadas</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id} className={`border-t border-stone-100 ${t.active ? '' : 'opacity-50'}`}>
                <td className="px-4 py-2.5">
                  <p className="font-bold text-stone-800">{t.title}</p>
                  <p className="text-[10px] text-stone-400 truncate max-w-xs">
                    {t.proof === 'indicacao' ? 'Automática (indicação)' : 'Print + análise'}
                    {t.actionUrl ? ` · ${t.actionUrl}` : ''}
                  </p>
                </td>
                <td className="px-4 py-2.5 text-right font-black">{t.points}</td>
                <td className="px-4 py-2.5">{t.proof === 'indicacao' ? 'Por amigo' : t.cooldownDays ? `A cada ${t.cooldownDays} dias` : 'Uma vez'}</td>
                <td className="px-4 py-2.5 text-right">{t.approved}</td>
                <td className="px-4 py-2.5 text-right">{t.proof === 'indicacao' ? '—' : t.pending}</td>
                <td className="px-4 py-2.5 text-right">{t.proof === 'indicacao' ? '—' : t.rejected}</td>
                <td className="px-4 py-2.5 text-right">
                  <button onClick={() => setEditing(t)} className="rounded-md p-1.5 text-stone-500 hover:bg-stone-100">
                    <Edit2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading && <Loader2 className="m-4 h-4 w-4 animate-spin text-stone-400" />}
      </div>

      {editing && (
        <TaskForm
          task={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
          }}
        />
      )}
    </div>
  );
}

function TaskForm({ task, onClose, onSaved }: { task: Task | null; onClose: () => void; onSaved: () => void | Promise<void> }) {
  const [f, setF] = useState({
    title: task?.title ?? '',
    description: task?.description ?? '',
    points: String(task?.points ?? 10),
    actionUrl: task?.actionUrl ?? '',
    actionLabel: task?.actionLabel ?? '',
    cooldownDays: task?.cooldownDays != null ? String(task.cooldownDays) : '',
    active: task?.active ?? true,
    sortOrder: String(task?.sortOrder ?? 10),
  });
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((prev) => ({ ...prev, [k]: v }));
  const isReferral = task?.proof === 'indicacao';

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api(task ? `/api/clube/tarefas/${task.id}` : '/api/clube/tarefas', {
        method: task ? 'PUT' : 'POST',
        body: { ...f, points: Number(f.points) || 0 },
      });
      await onSaved();
    } catch (err: unknown) {
      alert(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={task ? `Editar — ${task.title}` : 'Nova tarefa'} onClose={onClose}>
      <form onSubmit={save} className="space-y-3">
        <Field label="Título">
          <input value={f.title} onChange={(e) => set('title', e.target.value)} required className={inputCls} />
        </Field>
        <Field label="Explicação para o cliente">
          <textarea value={f.description} onChange={(e) => set('description', e.target.value)} rows={2} className={inputCls} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Pontos">
            <input value={f.points} onChange={(e) => set('points', e.target.value.replace(/\D/g, ''))} inputMode="numeric" className={inputCls} />
          </Field>
          {!isReferral && (
            <Field label="Repetir a cada (dias)" hint="vazio = só uma vez">
              <input value={f.cooldownDays} onChange={(e) => set('cooldownDays', e.target.value.replace(/\D/g, ''))} inputMode="numeric" className={inputCls} />
            </Field>
          )}
        </div>
        {!isReferral && (
          <>
            <Field label="Link do botão" hint="Ex.: link de avaliação do Google ou do post no Instagram">
              <input value={f.actionUrl} onChange={(e) => set('actionUrl', e.target.value)} className={inputCls} placeholder="https://..." />
            </Field>
            <Field label="Texto do botão">
              <input value={f.actionLabel} onChange={(e) => set('actionLabel', e.target.value)} className={inputCls} placeholder="Abrir o Instagram" />
            </Field>
          </>
        )}
        <div className="flex items-center gap-4">
          <Toggle checked={f.active} onChange={(v) => set('active', v)} label="Ativa" />
          <Field label="Ordem">
            <input value={f.sortOrder} onChange={(e) => set('sortOrder', e.target.value.replace(/\D/g, ''))} inputMode="numeric" className={`${inputCls} w-20`} />
          </Field>
        </div>
        <button disabled={saving} className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-amber-700 py-2.5 text-sm font-bold text-white disabled:opacity-60">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />} Salvar
        </button>
      </form>
    </Modal>
  );
}
