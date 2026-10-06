'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

export default function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text.replace(/\s/g, ''));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* navegador sem clipboard: o texto está visível para copiar à mão */
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-bold text-amber-800 border border-amber-300 hover:bg-amber-50 cursor-pointer"
    >
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      {copied ? 'Copiado!' : 'Copiar código de barras'}
    </button>
  );
}
