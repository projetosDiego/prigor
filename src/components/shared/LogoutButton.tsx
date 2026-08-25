'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';

export default function LogoutButton() {
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

  return (
    <button
      onClick={handleLogout}
      className="flex flex-col items-center justify-center gap-0.5 text-stone-500 hover:text-red-600 transition-colors w-14 cursor-pointer"
    >
      <LogOut className="h-5 w-5" />
      <span className="text-[10px] font-semibold">Sair</span>
    </button>
  );
}
