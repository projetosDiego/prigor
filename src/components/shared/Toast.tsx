'use client';

/**
 * Toasts e diálogo de confirmação compartilhados.
 *
 * Substitui os `alert()` / `confirm()` nativos por uma UI consistente com o
 * tema stone/amber. Uso:
 *
 *   const { toast, confirm } = useToast();
 *   toast('Pedido salvo!', 'success');
 *   if (await confirm({ title: 'Cancelar pedido?', message: '...' })) { ... }
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react';
import { CheckCircle2, AlertTriangle, Info, X, XCircle } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface ConfirmState extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  const remove = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, type: ToastType = 'info') => {
      const id = nextId++;
      setToasts((list) => [...list, { id, message, type }]);
      window.setTimeout(() => remove(id), 4000);
    },
    [remove],
  );

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      setConfirmState({ ...options, resolve });
    });
  }, []);

  const closeConfirm = useCallback(
    (value: boolean) => {
      setConfirmState((current) => {
        current?.resolve(value);
        return null;
      });
    },
    [],
  );

  return (
    <ToastContext.Provider value={{ toast, confirm }}>
      {children}

      {/* Stack de toasts */}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 w-80 max-w-[90vw]">
        {toasts.map((t) => {
          const styles =
            t.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : t.type === 'error'
                ? 'border-red-200 bg-red-50 text-red-800'
                : 'border-stone-200 bg-white text-stone-700';
          const Icon =
            t.type === 'success' ? CheckCircle2 : t.type === 'error' ? XCircle : Info;
          return (
            <div
              key={t.id}
              className={`flex items-start gap-2 rounded-xl border px-4 py-3 shadow-lg text-sm font-semibold animate-[fadeIn_0.15s_ease-out] ${styles}`}
            >
              <Icon className="h-4 w-4 mt-0.5 shrink-0" />
              <span className="flex-1">{t.message}</span>
              <button
                onClick={() => remove(t.id)}
                className="text-stone-400 hover:text-stone-600 cursor-pointer"
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Diálogo de confirmação */}
      {confirmState && (
        <div
          className="fixed inset-0 z-[110] bg-black/40 flex items-center justify-center p-4"
          onClick={() => closeConfirm(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex items-start gap-3">
                <div
                  className={`rounded-full p-2 shrink-0 ${
                    confirmState.danger ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  {confirmState.title && (
                    <h3 className="font-black text-stone-800 mb-1">{confirmState.title}</h3>
                  )}
                  <p className="text-sm text-stone-600 whitespace-pre-line">
                    {confirmState.message}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 bg-stone-50 border-t border-stone-100">
              <button
                onClick={() => closeConfirm(false)}
                className="rounded-lg border border-stone-200 bg-white hover:bg-stone-100 px-4 py-2 text-xs font-bold text-stone-600 cursor-pointer transition-all"
              >
                {confirmState.cancelLabel ?? 'Cancelar'}
              </button>
              <button
                onClick={() => closeConfirm(true)}
                className={`rounded-lg px-4 py-2 text-xs font-bold text-white cursor-pointer transition-all shadow-xs ${
                  confirmState.danger
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-amber-700 hover:bg-amber-800'
                }`}
              >
                {confirmState.confirmLabel ?? 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Fallback defensivo: se o provider não estiver montado, cai no nativo em
    // vez de quebrar a tela.
    return {
      toast: (message: string) => {
        if (typeof window !== 'undefined') window.alert(message);
      },
      confirm: ({ message }: ConfirmOptions) =>
        Promise.resolve(typeof window !== 'undefined' ? window.confirm(message) : false),
    };
  }
  return ctx;
}
