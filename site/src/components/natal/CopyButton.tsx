'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

export function CopyButton({ text, label = 'Copiar código Pix' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-primary w-full"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          const area = document.createElement('textarea');
          area.value = text;
          document.body.appendChild(area);
          area.select();
          document.execCommand('copy');
          area.remove();
        }
        setDone(true);
        window.setTimeout(() => setDone(false), 2500);
      }}
    >
      {done ? <Check size={16} /> : <Copy size={16} />} {done ? 'Copiado!' : label}
    </button>
  );
}
