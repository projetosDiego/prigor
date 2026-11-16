'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import { Loader2 } from 'lucide-react';

import type { ActionState } from '@/app/admin/actions';

export function SubmitButton({ children, className = 'btn btn-primary' }: { children: React.ReactNode; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`${className} disabled:opacity-60`}>
      {pending && <Loader2 size={16} className="animate-spin" />}
      {children}
    </button>
  );
}

/** Formulário com retorno de erro/sucesso da server action. */
export function ActionForm({
  action,
  children,
  className = '',
  encType,
}: {
  action: (state: ActionState, fd: FormData) => Promise<ActionState>;
  children: React.ReactNode;
  className?: string;
  encType?: 'multipart/form-data';
}) {
  const [state, formAction] = useActionState(action, undefined);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state?.error || state?.message) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [state]);

  return (
    <form action={formAction} className={className} encType={encType}>
      <div ref={ref} aria-live="polite">
        {state?.error && <p className="mb-6 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-800">{state.error}</p>}
        {state?.message && <p className="mb-6 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">{state.message}</p>}
      </div>
      {children}
    </form>
  );
}

/** Botão que pede confirmação antes de enviar (excluir etc.). */
export function ConfirmButton({ children, message, className }: { children: React.ReactNode; message: string; className?: string }) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}

/** Select que envia o formulário ao mudar (ex.: status do lead). */
export function AutoSubmitSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} onChange={(e) => e.currentTarget.form?.requestSubmit()} />;
}
