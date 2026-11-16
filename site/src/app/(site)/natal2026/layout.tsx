import { notFound } from 'next/navigation';

import { CartBar, CartDrawer, CartProvider } from '@/components/natal/Cart';
import { getNatalSettings, natalCatalog } from '@/lib/natal/config';

export default async function NatalLayout({ children }: { children: React.ReactNode }) {
  const settings = await getNatalSettings();
  if (!settings.active) notFound();
  return (
    <CartProvider catalog={natalCatalog(settings)} rules={settings.rules} depositPct={settings.depositPct}>
      {children}
      <CartBar />
      <CartDrawer acceptingOrders={settings.acceptingOrders} />
    </CartProvider>
  );
}
