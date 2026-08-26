import React from 'react';
import { redirect } from 'next/navigation';
import { getSession } from '@/server/auth/session';
import SellerLayoutClient from './layout-client';

export default async function SellerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session) {
    redirect('/login');
  }

  return (
    <SellerLayoutClient sessionName={session.name}>
      {children}
    </SellerLayoutClient>
  );
}
