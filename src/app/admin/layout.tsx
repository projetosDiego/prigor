import React from 'react';
import { redirect } from 'next/navigation';
import { getSession } from '@/server/auth/session';
import AdminLayoutClient from './layout-client';

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
    <AdminLayoutClient session={{ name: session.name, role: session.role }}>
      {children}
    </AdminLayoutClient>
  );
}
