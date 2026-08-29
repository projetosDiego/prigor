import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/server/auth/session';
import { 
  BarChart3, 
  Users, 
  Map, 
  UserSquare2, 
  Compass, 
  Sliders, 
  Activity, 
  ShieldCheck,
  Flame,
  Package,
  Scale,
  FileText,
  DollarSign,
  Truck,
  Upload,
  ScanLine
} from 'lucide-react';
import LogoutButton from '@/components/shared/LogoutButton';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session) {
    redirect('/login');
  }

  if (session.role !== 'ADMIN' && session.role !== 'MANAGER') {
    redirect('/seller/dashboard');
  }

  return (
    <div className="flex min-h-screen bg-stone-100">
      {/* Desktop Sidebar */}
      <aside className="w-64 border-r border-stone-200 bg-stone-900 text-stone-300 flex flex-col shrink-0">
        {/* Brand Header */}
        <div className="flex h-16 items-center gap-2.5 px-5 border-b border-stone-850">
          <Image src="/logo.png" alt="Doces Prigor" width={532} height={469} priority className="h-9 w-auto object-contain" />
          <div>
            <h1 className="font-black text-white text-xs tracking-tight uppercase leading-none">Doces Prigor</h1>
            <span className="text-[9px] text-amber-500 font-bold uppercase tracking-widest">OS Central</span>
          </div>
        </div>

        {/* Navigation Options */}
        <nav className="flex-1 px-4 py-6 space-y-4 overflow-y-auto">
          {/* Módulo Expansão */}
          <div className="space-y-1">
            <span className="text-[10px] font-black text-stone-500 uppercase tracking-widest px-4 block mb-2">Expansão & CRM</span>
            
            <Link href="/admin/dashboard" className="flex items-center gap-3 px-4 py-2 rounded-lg text-xs font-bold hover:bg-stone-800 hover:text-white transition-all">
              <BarChart3 className="h-4 w-4 text-amber-750" />
              <span>Dashboard</span>
            </Link>

            <Link href="/admin/leads" className="flex items-center gap-3 px-4 py-2 rounded-lg text-xs font-bold hover:bg-stone-800 hover:text-white transition-all">
              <Flame className="h-4 w-4 text-amber-755" />
              <span>Oportunidades (Leads)</span>
            </Link>

            <Link href="/admin/customers" className="flex items-center gap-3 px-4 py-2 rounded-lg text-xs font-bold hover:bg-stone-800 hover:text-white transition-all">
              <Users className="h-4 w-4 text-amber-755" />
              <span>Pontos de Revenda</span>
            </Link>

            <Link href="/admin/regions" className="flex items-center gap-3 px-4 py-2 rounded-lg text-xs font-bold hover:bg-stone-800 hover:text-white transition-all">
              <Map className="h-4 w-4 text-amber-755" />
              <span>Bairros & Regiões</span>
            </Link>

            <Link href="/admin/map" className="flex items-center gap-3 px-4 py-2 rounded-lg text-xs font-bold hover:bg-stone-800 hover:text-white transition-all">
              <Map className="h-4 w-4 text-amber-755" />
              <span>Mapa de Revendas</span>
            </Link>

            <Link href="/admin/prospecting" className="flex items-center gap-3 px-4 py-2 rounded-lg text-xs font-bold hover:bg-stone-800 hover:text-white transition-all">
              <Compass className="h-4 w-4 text-amber-755" />
              <span>Pesquisa & Prospecção</span>
            </Link>
          </div>

          {/* Módulo ERP e Operações */}
          <div className="space-y-1">
            <span className="text-[10px] font-black text-stone-500 uppercase tracking-widest px-4 block mb-2">Produção & ERP</span>

            <Link href="/admin/orders" className="flex items-center gap-3 px-4 py-2 rounded-lg text-xs font-bold hover:bg-stone-800 hover:text-white transition-all">
              <FileText className="h-4 w-4 text-amber-755" />
              <span>Pedidos & Faturamento</span>
            </Link>

            <Link href="/admin/products" className="flex items-center gap-3 px-4 py-2 rounded-lg text-xs font-bold hover:bg-stone-800 hover:text-white transition-all">
              <Package className="h-4 w-4 text-amber-755" />
              <span>Produtos Acabados</span>
            </Link>

            <Link href="/admin/raw-materials" className="flex items-center gap-3 px-4 py-2 rounded-lg text-xs font-bold hover:bg-stone-800 hover:text-white transition-all">
              <Scale className="h-4 w-4 text-amber-755" />
              <span>Matérias-primas / Insumos</span>
            </Link>

            <Link href="/admin/stock" className="flex items-center gap-3 px-4 py-2 rounded-lg text-xs font-bold hover:bg-stone-800 hover:text-white transition-all">
              <ScanLine className="h-4 w-4 text-amber-755" />
              <span>Scanner de Produção</span>
            </Link>

            <Link href="/admin/financial" className="flex items-center gap-3 px-4 py-2 rounded-lg text-xs font-bold hover:bg-stone-800 hover:text-white transition-all">
              <DollarSign className="h-4 w-4 text-amber-755" />
              <span>Financeiro & Caixa</span>
            </Link>

            <Link href="/admin/logistics" className="flex items-center gap-3 px-4 py-2 rounded-lg text-xs font-bold hover:bg-stone-800 hover:text-white transition-all">
              <Truck className="h-4 w-4 text-amber-755" />
              <span>Roteiros & Logística</span>
            </Link>
          </div>

          {/* Módulo Sistema */}
          <div className="space-y-1">
            <span className="text-[10px] font-black text-stone-500 uppercase tracking-widest px-4 block mb-2">Configurações</span>

            <Link href="/admin/sellers" className="flex items-center gap-3 px-4 py-2 rounded-lg text-xs font-bold hover:bg-stone-800 hover:text-white transition-all">
              <UserSquare2 className="h-4 w-4 text-amber-755" />
              <span>Vendedores</span>
            </Link>

            <Link href="/admin/score" className="flex items-center gap-3 px-4 py-2 rounded-lg text-xs font-bold hover:bg-stone-800 hover:text-white transition-all">
              <Sliders className="h-4 w-4 text-amber-755" />
              <span>Calibrar Score</span>
            </Link>

            <Link href="/admin/api-usage" className="flex items-center gap-3 px-4 py-2 rounded-lg text-xs font-bold hover:bg-stone-800 hover:text-white transition-all">
              <Activity className="h-4 w-4 text-amber-755" />
              <span>Consumo da API</span>
            </Link>

            <Link href="/admin/import" className="flex items-center gap-3 px-4 py-2 rounded-lg text-xs font-bold hover:bg-stone-800 hover:text-white transition-all">
              <Upload className="h-4 w-4 text-amber-755" />
              <span>Importar Planilhas</span>
            </Link>
          </div>
        </nav>

        {/* Footer info & Logout */}
        <div className="p-4 border-t border-stone-850 bg-stone-950 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <ShieldCheck className="h-4 w-4 text-amber-600 shrink-0" />
            <div className="truncate text-xs">
              <span className="font-bold text-white block truncate">{session.name}</span>
              <span className="text-[9px] text-stone-500 font-bold uppercase">{session.role}</span>
            </div>
          </div>
          <LogoutButton />
        </div>
      </aside>

      {/* Main Content Pane */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <header className="h-16 border-b border-stone-200 bg-white flex items-center justify-between px-8 shrink-0">
          <span className="font-bold text-stone-700 text-sm tracking-wide">PAINEL ADMINISTRATIVO</span>
          <div className="text-xs text-stone-400 font-medium">
            Leed Doces Prigor • Versão 1.0.0
          </div>
        </header>
        <main className="p-8 flex-1">{children}</main>
      </div>
    </div>
  );
}
