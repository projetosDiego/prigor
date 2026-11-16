import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { ActionForm, SubmitButton } from '@/components/admin/ui';
import { Logo } from '@/components/site/Logo';
import { adminConfigured, getSession } from '@/lib/auth/server';
import { loginAction } from '../actions';

export const metadata: Metadata = { title: 'Entrar' };
export const dynamic = 'force-dynamic';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getSession()) redirect('/admin');
  const { next } = await searchParams;

  return (
    <main className="flex min-h-dvh items-center justify-center p-5">
      <div className="w-full max-w-sm">
        <div className="flex justify-center">
          <Logo height={90} link={false} />
        </div>
        <div className="mt-8 rounded-2xl border border-line bg-white p-7">
          <h1 className="font-display text-2xl text-cocoa">Painel administrativo</h1>
          {!adminConfigured() && (
            <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
              Defina ADMIN_EMAIL, ADMIN_PASSWORD (mín. 12 caracteres) e SESSION_SECRET no arquivo .env e reinicie o servidor.
            </p>
          )}
          <ActionForm action={loginAction} className="mt-6 grid gap-4">
            <input type="hidden" name="next" value={next ?? ''} />
            <div>
              <label htmlFor="email" className="label">E-mail</label>
              <input id="email" name="email" type="email" autoComplete="username" required className="field" />
            </div>
            <div>
              <label htmlFor="password" className="label">Senha</label>
              <input id="password" name="password" type="password" autoComplete="current-password" required className="field" />
            </div>
            <SubmitButton className="btn btn-primary mt-2 w-full">Entrar</SubmitButton>
          </ActionForm>
        </div>
      </div>
    </main>
  );
}
