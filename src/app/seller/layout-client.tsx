'use client';

import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { 
  Home, 
  List, 
  Map, 
  LogOut, 
  User, 
  FileText, 
  Users 
} from 'lucide-react';

interface SellerLayoutClientProps {
  children: React.ReactNode;
  sessionName: string;
}

export default function SellerLayoutClient({ children, sessionName }: SellerLayoutClientProps) {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    if (!confirm('Deseja realmente sair do sistema?')) return;
    try {
      const res = await fetch('/api/auth/logout', { method: 'POST' });
      if (res.ok) {
        router.push('/login');
        router.refresh();
      }
    } catch (err) {
      console.error('Erro ao sair:', err);
    }
  };

  const isActive = (path: string) => pathname === path;

  return (
    <div className="flex min-h-screen flex-col bg-stone-100 pb-16">
      {/* Mobile Top Header */}
      <header className="sticky top-0 z-45 flex h-14 items-center justify-between border-b border-stone-200 bg-white px-4 shadow-sm">
        <div className="flex items-center gap-2">
          <Image src="/logo.png" alt="Doces Prigor" width={532} height={469} priority className="h-7 w-auto object-contain" />
          <span className="font-black text-stone-900 text-xs tracking-wide uppercase">Prigor Vendedor</span>
        </div>
        
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 text-stone-600 text-[10px] font-bold bg-stone-50 px-2 py-1 rounded-full border border-stone-200">
            <User className="h-3.5 w-3.5 text-amber-700" />
            <span className="max-w-[70px] truncate">{sessionName.split(' ')[0]}</span>
          </div>
          <button 
            onClick={handleLogout}
            className="p-1.5 border border-stone-200 rounded-full bg-white hover:bg-red-50 text-stone-500 hover:text-red-700 transition-all cursor-pointer shadow-xs"
            title="Sair do sistema"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 px-4 py-4">{children}</main>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-45 border-t border-stone-200 bg-white shadow-lg">
        <div className="mx-auto flex h-16 max-w-md items-center justify-around px-1">
          
          <Link 
            href="/seller/dashboard" 
            className={`flex flex-col items-center justify-center gap-0.5 transition-colors w-14 ${
              isActive('/seller/dashboard') ? 'text-amber-800 font-bold' : 'text-stone-400 hover:text-stone-600'
            }`}
          >
            <Home className="h-5 w-5" />
            <span className="text-[9px] font-bold">Início</span>
          </Link>
          
          <Link 
            href="/seller/leads" 
            className={`flex flex-col items-center justify-center gap-0.5 transition-colors w-14 ${
              isActive('/seller/leads') ? 'text-amber-800 font-bold' : 'text-stone-400 hover:text-stone-600'
            }`}
          >
            <List className="h-5 w-5" />
            <span className="text-[9px] font-bold">Leads</span>
          </Link>

          <Link 
            href="/seller/orders" 
            className={`flex flex-col items-center justify-center gap-0.5 transition-colors w-14 ${
              isActive('/seller/orders') ? 'text-amber-800 font-bold' : 'text-stone-400 hover:text-stone-600'
            }`}
          >
            <FileText className="h-5 w-5" />
            <span className="text-[9px] font-bold">Pedidos</span>
          </Link>

          <Link 
            href="/seller/customers" 
            className={`flex flex-col items-center justify-center gap-0.5 transition-colors w-14 ${
              isActive('/seller/customers') ? 'text-amber-800 font-bold' : 'text-stone-400 hover:text-stone-600'
            }`}
          >
            <Users className="h-5 w-5" />
            <span className="text-[9px] font-bold">Clientes</span>
          </Link>

          <Link 
            href="/seller/map" 
            className={`flex flex-col items-center justify-center gap-0.5 transition-colors w-14 ${
              isActive('/seller/map') ? 'text-amber-800 font-bold' : 'text-stone-400 hover:text-stone-600'
            }`}
          >
            <Map className="h-5 w-5" />
            <span className="text-[9px] font-bold">Mapa</span>
          </Link>

        </div>
      </nav>
    </div>
  );
}
