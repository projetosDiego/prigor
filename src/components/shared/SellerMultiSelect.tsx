'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export interface SellerOption {
  id: string;
  name: string;
}

interface Props {
  options: SellerOption[];
  /** IDs desmarcados. Vazio = todos aparecem (e vendedor novo já entra marcado). */
  excluded: string[];
  onChange: (excluded: string[]) => void;
  className?: string;
}

function summary(options: SellerOption[], excluded: string[]): string {
  const out = options.filter((o) => excluded.includes(o.id));
  if (out.length === 0) return 'Todos os vendedores';
  if (out.length >= options.length) return 'Nenhum vendedor';
  if (out.length <= 2) return `Todos, menos ${out.map((o) => o.name.split(' ')[0]).join(' e ')}`;
  return `${options.length - out.length} de ${options.length} vendedores`;
}

/** Filtro de vendedores com várias marcações: desmarque quem não quer ver. */
export function SellerMultiSelect({ options, excluded, onChange, className = '' }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const toggle = (id: string) => onChange(excluded.includes(id) ? excluded.filter((x) => x !== id) : [...excluded, id]);
  const active = excluded.some((id) => options.some((o) => o.id === id));

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-xs font-semibold text-stone-900 focus:outline-none focus:ring-1 focus:ring-amber-500 ${active ? 'border-amber-400 bg-amber-50' : 'border-stone-200 bg-stone-50/50'}`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate">{summary(options, excluded)}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-stone-500 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute left-0 z-40 mt-1 w-full min-w-[15rem] rounded-xl border border-stone-200 bg-white p-2 shadow-lg">
          <div className="mb-1 flex items-center justify-between px-1 text-[11px] font-bold">
            <button type="button" className="text-amber-700 hover:underline" onClick={() => onChange([])}>Marcar todos</button>
            <button type="button" className="text-stone-500 hover:underline" onClick={() => onChange(options.map((o) => o.id))}>Limpar</button>
          </div>
          <ul className="max-h-72 overflow-y-auto">
            {options.map((o) => {
              const on = !excluded.includes(o.id);
              return (
                <li key={o.id} className="group flex items-center rounded-lg hover:bg-amber-50">
                  <button type="button" onClick={() => toggle(o.id)} className="flex flex-1 items-center gap-2 px-2 py-1.5 text-left text-xs font-medium text-stone-800">
                    <span className={`flex h-4 w-4 items-center justify-center rounded border ${on ? 'border-amber-600 bg-amber-600 text-white' : 'border-stone-300 bg-white'}`}>
                      {on && <Check className="h-3 w-3" />}
                    </span>
                    <span className="truncate">{o.name}</span>
                  </button>
                  <button
                    type="button"
                    className="mr-1 hidden rounded px-1.5 py-0.5 text-[10px] font-bold text-stone-400 hover:bg-white hover:text-amber-700 group-hover:block"
                    onClick={() => onChange(options.filter((x) => x.id !== o.id).map((x) => x.id))}
                    title="Mostrar só este vendedor"
                  >
                    só este
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
