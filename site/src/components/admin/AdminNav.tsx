'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FileText, Gift, LayoutDashboard, MapPin, Package, Settings, ShoppingBag, Users } from 'lucide-react';

const ITEMS = [
  { href: '/admin', label: 'Visão geral', icon: LayoutDashboard },
  { href: '/admin/pedidos', label: 'Pedidos', icon: ShoppingBag },
  { href: '/admin/leads', label: 'Leads', icon: Users },
  { href: '/admin/produtos', label: 'Produtos', icon: Package },
  { href: '/admin/pontos', label: 'Pontos de venda', icon: MapPin },
  { href: '/admin/natal', label: 'Natal', icon: Gift },
  { href: '/admin/conteudo', label: 'Conteúdo', icon: FileText },
  { href: '/admin/configuracoes', label: 'Configurações', icon: Settings },
];

export function AdminNav({ newLeads, newOrders = 0 }: { newLeads: number; newOrders?: number }) {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto lg:flex-col" aria-label="Painel">
      {ITEMS.map(({ href, label, icon: Icon }) => {
        const active = href === '/admin' ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={`flex shrink-0 items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition ${
              active ? 'bg-cocoa text-cream' : 'text-cocoa-3 hover:bg-white'
            }`}
          >
            <Icon size={17} strokeWidth={1.8} />
            {label}
            {href === '/admin/pedidos' && newOrders > 0 && (
              <span className={`ml-auto rounded-full px-2 py-0.5 text-[0.7rem] ${active ? 'bg-cream text-cocoa' : 'bg-terracotta text-white'}`}>{newOrders}</span>
            )}
            {href === '/admin/leads' && newLeads > 0 && (
              <span className={`ml-auto rounded-full px-2 py-0.5 text-[0.7rem] ${active ? 'bg-cream text-cocoa' : 'bg-terracotta text-white'}`}>{newLeads}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
