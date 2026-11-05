'use client';

import React from 'react';
import { Calendar, Truck, X } from 'lucide-react';

interface Props {
  dates: string[];
  onChange: (dates: string[]) => void;
  label?: string;
  className?: string;
}

const pad = (n: number) => String(n).padStart(2, '0');
const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const br = (iso: string) => iso.split('-').reverse().join('/');

/** Escolha uma ou várias datas (ex.: entregas de hoje e amanhã). */
export function MultiDatePicker({ dates, onChange, label = 'Data de Entrega', className = '' }: Props) {
  const hoje = toISO(new Date());
  const amanha = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return toISO(d);
  })();
  const sorted = [...dates].sort();
  const toggle = (iso: string) => onChange(dates.includes(iso) ? dates.filter((d) => d !== iso) : [...dates, iso].sort());
  const quick = (iso: string, text: string) => (
    <button
      type="button"
      onClick={() => toggle(iso)}
      className={`px-2 py-0.5 rounded text-[10px] font-black transition-all cursor-pointer ${
        dates.includes(iso) ? 'bg-amber-700 text-white shadow-xs' : 'bg-white text-amber-900 hover:bg-amber-100 border border-amber-200'
      }`}
    >
      {text}
    </button>
  );

  return (
    <div className={`bg-amber-50/70 p-2.5 rounded-xl border border-amber-200 ${className}`}>
      <div className="flex items-center justify-between mb-1.5 gap-2">
        <span className="text-[10px] text-amber-950 font-black uppercase tracking-wider flex items-center gap-1.5">
          <Truck className="h-3.5 w-3.5 text-amber-700" />
          {label}
        </span>
        <div className="flex items-center gap-1">
          {quick(hoje, 'Hoje')}
          {quick(amanha, 'Amanhã')}
          {dates.length > 0 && (
            <button type="button" onClick={() => onChange([])} className="px-1 text-[11px] font-bold text-stone-400 hover:text-red-600 cursor-pointer" title="Limpar datas">
              ✕
            </button>
          )}
        </div>
      </div>
      <div className="relative">
        <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-amber-700 pointer-events-none" />
        <input
          type="date"
          value=""
          onChange={(e) => {
            const v = e.target.value;
            if (v && !dates.includes(v)) onChange([...dates, v].sort());
          }}
          aria-label="Adicionar data"
          className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-amber-200 text-xs font-bold text-amber-950 focus:outline-none bg-white focus:ring-2 focus:ring-amber-500/20"
        />
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        {sorted.length === 0 ? (
          <span className="text-[10px] font-semibold text-amber-800/70">Escolha uma ou mais datas (todas, se vazio)</span>
        ) : (
          sorted.map((d) => (
            <span key={d} className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-white px-2 py-0.5 text-[10px] font-black text-amber-900">
              {br(d)}
              <button type="button" onClick={() => toggle(d)} className="text-amber-700 hover:text-red-600" aria-label={`Remover ${br(d)}`}>
                <X className="h-3 w-3" />
              </button>
            </span>
          ))
        )}
      </div>
    </div>
  );
}
