import Link from 'next/link';
import { ExternalLink, LogOut } from 'lucide-react';

import { AdminNav } from '@/components/admin/AdminNav';
import { Logo } from '@/components/site/Logo';
import { requireAdmin } from '@/lib/auth/server';
import { db } from '@/lib/db';
import { logoutAction } from '../actions';

export const dynamic = 'force-dynamic';

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdmin();
  const [newLeads, newOrders] = await Promise.all([
    db.lead.count({ where: { status: 'NOVO' } }),
    db.shopOrder.count({ where: { status: 'AGUARDANDO_PAGAMENTO' } }),
  ]);

  return (
    <div className="lg:grid lg:min-h-dvh lg:grid-cols-[250px_1fr]">
      <aside className="border-b border-line bg-[#efe7dc] px-4 py-4 lg:sticky lg:top-0 lg:h-dvh lg:border-r lg:border-b-0 lg:px-5 lg:py-7">
        <div className="flex items-center justify-between lg:block">
          <Logo height={44} link={false} />
          <form action={logoutAction} className="lg:hidden">
            <button className="inline-flex items-center gap-2 text-sm font-semibold text-cocoa-3">
              <LogOut size={16} /> Sair
            </button>
          </form>
        </div>
        <div className="mt-4 lg:mt-8">
          <AdminNav newLeads={newLeads} newOrders={newOrders} />
        </div>
        <div className="mt-8 hidden border-t border-line pt-6 text-sm lg:block">
          <Link href="/" target="_blank" className="flex items-center gap-2 font-semibold text-cocoa-3 hover:text-cocoa">
            <ExternalLink size={15} /> Ver site
          </Link>
          <p className="mt-4 truncate text-xs text-muted" title={session.sub}>{session.sub}</p>
          <form action={logoutAction} className="mt-2">
            <button className="inline-flex items-center gap-2 font-semibold text-cocoa-3 hover:text-cocoa">
              <LogOut size={15} /> Sair
            </button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 px-4 py-8 md:px-8 lg:px-12 lg:py-10">{children}</main>
    </div>
  );
}
