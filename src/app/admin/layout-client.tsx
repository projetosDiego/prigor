'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
  TrendingUp,
  CreditCard,
  Truck,
  Upload,
  ScanLine,
  Wallet,
  CalendarDays,
  UserX,
  PieChart,
  Menu,
  X
} from 'lucide-react';
import LogoutButton from '@/components/shared/LogoutButton';

interface AdminLayoutClientProps {
  children: React.ReactNode;
  session: {
    name: string;
    role: string;
  };
}

export default function AdminLayoutClient({ children, session }: AdminLayoutClientProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const pathname = usePathname();

  // Fecha o menu gaveta quando o usuário troca de rota
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

  const isActive = (path: string) => pathname === path;

  return (
    <div className="flex min-h-screen bg-stone-100">
      {/* Backdrop escuro no celular quando o menu estiver aberto */}
      {isMobileMenuOpen && (
        <div 
          onClick={() => setIsMobileMenuOpen(false)}
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs md:hidden animate-fadeIn"
          aria-hidden="true"
        />
      )}

      {/* Sidebar: Fixa no desktop (md:static) e Gaveta deslizante no celular (fixed) */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 border-r border-stone-850 bg-stone-900 text-stone-300 flex flex-col shrink-0 shadow-2xl md:shadow-none transition-transform duration-300 ease-in-out md:static md:translate-x-0 ${
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="flex h-16 items-center justify-between px-5 border-b border-stone-850">
          <div className="flex items-center gap-2.5">
            <Image src="/logo.png" alt="Doces Prigor" width={532} height={469} priority className="h-9 w-auto object-contain" />
            <div>
              <h1 className="font-black text-white text-xs tracking-tight uppercase leading-none">Doces Prigor</h1>
              <span className="text-[9px] text-amber-500 font-bold uppercase tracking-widest">OS Central</span>
            </div>
          </div>
          {/* Botão Fechar no Celular */}
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(false)}
            className="md:hidden p-1.5 rounded-lg text-stone-400 hover:text-white hover:bg-stone-800 transition-colors"
            title="Fechar menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation Options */}
        <nav className="flex-1 px-4 py-5 space-y-4 overflow-y-auto">
          {/* Módulo Expansão */}
          <div className="space-y-1">
            <span className="text-[10px] font-black text-stone-500 uppercase tracking-widest px-4 block mb-2">Expansão & CRM</span>
            
            <Link 
              href="/admin/dashboard" 
              onClick={() => setIsMobileMenuOpen(false)}
              className={`flex items-center gap-3 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                isActive('/admin/dashboard') ? 'bg-amber-600 text-white shadow-xs' : 'hover:bg-stone-800 hover:text-white text-stone-300'
              }`}
            >
              <BarChart3 className="h-4 w-4 text-amber-400" />
              <span>Dashboard</span>
            </Link>

            <Link 
              href="/admin/leads" 
              onClick={() => setIsMobileMenuOpen(false)}
              className={`flex items-center gap-3 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                isActive('/admin/leads') ? 'bg-amber-600 text-white shadow-xs' : 'hover:bg-stone-800 hover:text-white text-stone-300'
              }`}
            >
              <Flame className="h-4 w-4 text-amber-400" />
              <span>Oportunidades (Leads)</span>
            </Link>

            <Link 
              href="/admin/customers" 
              onClick={() => setIsMobileMenuOpen(false)}
              className={`flex items-center gap-3 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                isActive('/admin/customers') ? 'bg-amber-600 text-white shadow-xs' : 'hover:bg-stone-800 hover:text-white text-stone-300'
              }`}
            >
              <Users className="h-4 w-4 text-amber-400" />
              <span>Pontos de Revenda</span>
            </Link>

            <Link 
              href="/admin/regions" 
              onClick={() => setIsMobileMenuOpen(false)}
              className={`flex items-center gap-3 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                isActive('/admin/regions') ? 'bg-amber-600 text-white shadow-xs' : 'hover:bg-stone-800 hover:text-white text-stone-300'
              }`}
            >
              <Map className="h-4 w-4 text-amber-400" />
              <span>Bairros & Regiões</span>
            </Link>

            <Link 
              href="/admin/map" 
              onClick={() => setIsMobileMenuOpen(false)}
              className={`flex items-center gap-3 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                isActive('/admin/map') ? 'bg-amber-600 text-white shadow-xs' : 'hover:bg-stone-800 hover:text-white text-stone-300'
              }`}
            >
              <Map className="h-4 w-4 text-amber-400" />
              <span>Mapa de Revendas</span>
            </Link>

            <Link 
              href="/admin/prospecting" 
              onClick={() => setIsMobileMenuOpen(false)}
              className={`flex items-center gap-3 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                isActive('/admin/prospecting') ? 'bg-amber-600 text-white shadow-xs' : 'hover:bg-stone-800 hover:text-white text-stone-300'
              }`}
            >
              <Compass className="h-4 w-4 text-amber-400" />
              <span>Pesquisa & Prospecção</span>
            </Link>
          </div>

          {/* Módulo ERP e Operações */}
          <div className="space-y-1">
            <span className="text-[10px] font-black text-stone-500 uppercase tracking-widest px-4 block mb-2">Produção & ERP</span>

            <Link 
              href="/admin/orders" 
              onClick={() => setIsMobileMenuOpen(false)}
              className={`flex items-center gap-3 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                isActive('/admin/orders') ? 'bg-amber-600 text-white shadow-xs' : 'hover:bg-stone-800 hover:text-white text-stone-300'
              }`}
            >
              <FileText className="h-4 w-4 text-amber-400" />
              <span>Pedidos & Faturamento</span>
            </Link>

            <Link 
              href="/admin/products" 
              onClick={() => setIsMobileMenuOpen(false)}
              className={`flex items-center gap-3 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                isActive('/admin/products') ? 'bg-amber-600 text-white shadow-xs' : 'hover:bg-stone-800 hover:text-white text-stone-300'
              }`}
            >
              <Package className="h-4 w-4 text-amber-400" />
              <span>Produtos Acabados</span>
            </Link>

            <Link 
              href="/admin/raw-materials" 
              onClick={() => setIsMobileMenuOpen(false)}
              className={`flex items-center gap-3 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                isActive('/admin/raw-materials') ? 'bg-amber-600 text-white shadow-xs' : 'hover:bg-stone-800 hover:text-white text-stone-300'
              }`}
            >
              <Scale className="h-4 w-4 text-amber-400" />
              <span>Matérias-primas / Insumos</span>
            </Link>

            <Link 
              href="/admin/stock" 
              onClick={() => setIsMobileMenuOpen(false)}
              className={`flex items-center gap-3 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                isActive('/admin/stock') ? 'bg-amber-600 text-white shadow-xs' : 'hover:bg-stone-800 hover:text-white text-stone-300'
              }`}
            >
              <ScanLine className="h-4 w-4 text-amber-400" />
              <span>Scanner de Produção</span>
            </Link>

            <Link 
              href="/admin/financial" 
              onClick={() => setIsMobileMenuOpen(false)}
              className={`flex items-center gap-3 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                isActive('/admin/financial') ? 'bg-amber-600 text-white shadow-xs' : 'hover:bg-stone-800 hover:text-white text-stone-300'
              }`}
            >
              <DollarSign className="h-4 w-4 text-amber-400" />
              <span>Financeiro & Caixa</span>
            </Link>

            <Link 
              href="/admin/logistics" 
              onClick={() => setIsMobileMenuOpen(false)}
              className={`flex items-center gap-3 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                isActive('/admin/logistics') ? 'bg-amber-600 text-white shadow-xs' : 'hover:bg-stone-800 hover:text-white text-stone-300'
              }`}
            >
              <Truck className="h-4 w-4 text-amber-400" />
              <span>Roteiros & Logística</span>
            </Link>
            <Link 
              href="/admin/costs" 
              onClick={() => setIsMobileMenuOpen(false)}
              className={`flex items-center gap-3 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                isActive('/admin/costs') ? 'bg-amber-600 text-white shadow-xs' : 'hover:bg-stone-800 hover:text-white text-stone-300'
              }`}
            >
              <Wallet className="h-4 w-4 text-amber-400" />
              <span>Custos & Equipe</span>
            </Link>
          </div>

          {/* Módulo Relatórios */}
          <div className="space-y-1">
            <span className="text-[10px] font-black text-stone-500 uppercase tracking-widest px-4 block mb-2">Relatórios</span>

            <Link 
              href="/admin/reports/sales" 
              onClick={() => setIsMobileMenuOpen(false)}
              className={`flex items-center gap-3 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                isActive('/admin/reports/sales') ? 'bg-amber-600 text-white shadow-xs' : 'hover:bg-stone-800 hover:text-white text-stone-300'
              }`}
            >
              <CalendarDays className="h-4 w-4 text-amber-400" />
              <span>Vendas Diárias</span>
            </Link>
            <Link 
              href="/admin/reports/customers" 
              onClick={() => setIsMobileMenuOpen(false)}
              className={`flex items-center gap-3 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                isActive('/admin/reports/customers') ? 'bg-amber-600 text-white shadow-xs' : 'hover:bg-stone-800 hover:text-white text-stone-300'
              }`}
            >
              <BarChart3 className="h-4 w-4 text-amber-400" />
              <span>Relatório de Clientes</span>
            </Link>
            <Link 
              href="/admin/reports/sellers" 
              onClick={() => setIsMobileMenuOpen(false)}
              className={`flex items-center gap-3 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                isActive('/admin/reports/sellers') ? 'bg-amber-600 text-white shadow-xs' : 'hover:bg-stone-800 hover:text-white text-stone-300'
              }`}
            >
              <TrendingUp className="h-4 w-4 text-amber-400" />
              <span>Relatório por Vendedor</span>
            </Link>
            <Link 
              href="/admin/reports/inactive-customers" 
              onClick={() => setIsMobileMenuOpen(false)}
              className={`flex items-center gap-3 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                isActive('/admin/reports/inactive-customers') ? 'bg-rose-900/60 text-white shadow-xs' : 'hover:bg-stone-800 hover:text-white text-stone-300'
              }`}
            >
              <UserX className="h-4 w-4 text-rose-400" />
              <span>Clientes Inativos (Reativação)</span>
            </Link>
            <Link 
              href="/admin/reports/products-abc" 
              onClick={() => setIsMobileMenuOpen(false)}
              className={`flex items-center gap-3 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                isActive('/admin/reports/products-abc') ? 'bg-amber-600 text-white shadow-xs' : 'hover:bg-stone-800 hover:text-white text-stone-300'
              }`}
            >
              <PieChart className="h-4 w-4 text-amber-400" />
              <span>Curva ABC de Produtos</span>
            </Link>
          </div>

          {/* Módulo Sistema */}
          <div className="space-y-1">
            <span className="text-[10px] font-black text-stone-500 uppercase tracking-widest px-4 block mb-2">Configurações</span>

            <Link 
              href="/admin/users" 
              onClick={() => setIsMobileMenuOpen(false)}
              className={`flex items-center gap-3 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                isActive('/admin/users') ? 'bg-amber-600 text-white shadow-xs' : 'hover:bg-stone-800 hover:text-white text-stone-300'
              }`}
            >
              <ShieldCheck className="h-4 w-4 text-amber-400" />
              <span>Usuários & Acessos</span>
            </Link>

            <Link 
              href="/admin/sellers" 
              onClick={() => setIsMobileMenuOpen(false)}
              className={`flex items-center gap-3 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                isActive('/admin/sellers') ? 'bg-amber-600 text-white shadow-xs' : 'hover:bg-stone-800 hover:text-white text-stone-300'
              }`}
            >
              <UserSquare2 className="h-4 w-4 text-amber-400" />
              <span>Vendedores</span>
            </Link>
            <Link 
              href="/admin/payment-methods" 
              onClick={() => setIsMobileMenuOpen(false)}
              className={`flex items-center gap-3 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                isActive('/admin/payment-methods') ? 'bg-amber-600 text-white shadow-xs' : 'hover:bg-stone-800 hover:text-white text-stone-300'
              }`}
            >
              <CreditCard className="h-4 w-4 text-amber-400" />
              <span>Formas de Pagamento</span>
            </Link>

            <Link 
              href="/admin/score" 
              onClick={() => setIsMobileMenuOpen(false)}
              className={`flex items-center gap-3 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                isActive('/admin/score') ? 'bg-amber-600 text-white shadow-xs' : 'hover:bg-stone-800 hover:text-white text-stone-300'
              }`}
            >
              <Sliders className="h-4 w-4 text-amber-400" />
              <span>Calibrar Score</span>
            </Link>

            <Link 
              href="/admin/api-usage" 
              onClick={() => setIsMobileMenuOpen(false)}
              className={`flex items-center gap-3 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                isActive('/admin/api-usage') ? 'bg-amber-600 text-white shadow-xs' : 'hover:bg-stone-800 hover:text-white text-stone-300'
              }`}
            >
              <Activity className="h-4 w-4 text-amber-400" />
              <span>Consumo da API</span>
            </Link>

            <Link 
              href="/admin/import" 
              onClick={() => setIsMobileMenuOpen(false)}
              className={`flex items-center gap-3 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                isActive('/admin/import') ? 'bg-amber-600 text-white shadow-xs' : 'hover:bg-stone-800 hover:text-white text-stone-300'
              }`}
            >
              <Upload className="h-4 w-4 text-amber-400" />
              <span>Importar Planilhas</span>
            </Link>
          </div>
        </nav>

        {/* Footer info & Logout */}
        <div className="p-4 border-t border-stone-850 bg-stone-950 flex items-center justify-between shrink-0">
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
        {/* Top Header responsivo */}
        <header className="h-16 border-b border-stone-200 bg-white flex items-center justify-between px-4 sm:px-6 md:px-8 shrink-0 sticky top-0 z-30 shadow-2xs">
          <div className="flex items-center gap-3">
            {/* Botão Hambúrguer visível apenas no celular */}
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(true)}
              className="md:hidden p-2 -ml-1.5 rounded-xl border border-stone-200 bg-stone-50 text-stone-700 hover:bg-stone-100 transition-colors"
              title="Abrir navegação"
            >
              <Menu className="h-5 w-5" />
            </button>

            {/* Logo no celular / Título no desktop */}
            <div className="flex items-center gap-2">
              <div className="md:hidden flex items-center gap-2">
                <Image src="/logo.png" alt="Doces Prigor" width={532} height={469} priority className="h-7 w-auto object-contain" />
                <span className="font-black text-stone-900 text-xs tracking-tight uppercase">Doces Prigor</span>
              </div>
              <span className="hidden md:inline font-bold text-stone-700 text-sm tracking-wide">
                PAINEL ADMINISTRATIVO
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-xs text-stone-400 font-medium hidden sm:block">
              Leed Doces Prigor • Versão 1.0.0
            </div>
            {/* Indicador do usuário logado no mobile */}
            <div className="md:hidden flex items-center gap-1.5 bg-stone-50 border border-stone-200 px-2.5 py-1 rounded-full text-[11px] font-bold text-stone-700">
              <span className="truncate max-w-[80px]">{session.name.split(' ')[0]}</span>
            </div>
          </div>
        </header>

        {/* Conteúdo com padding adaptativo (3.5 no celular, 8 no desktop) */}
        <main className="p-3.5 sm:p-6 md:p-8 flex-1">{children}</main>
      </div>
    </div>
  );
}
