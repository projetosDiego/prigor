import type { Metadata } from 'next';

import { Checkout } from '@/components/natal/Checkout';
import { getNatalSettings } from '@/lib/natal/config';
import { allowedDates, todayInSaoPaulo } from '@/lib/natal/dates';
import { getSettings } from '@/lib/settings';
import { waLink } from '@/lib/whatsapp';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Finalizar pedido de Natal',
  robots: { index: false },
  alternates: { canonical: '/natal2026/finalizar' },
};

export default async function CheckoutPage() {
  const [natal, settings] = await Promise.all([getNatalSettings(), getSettings()]);
  return (
    <Checkout
      dates={allowedDates(todayInSaoPaulo(), natal.dates)}
      pickupPoints={natal.pickupPoints}
      deliveryNote={natal.deliveryNote}
      depositPct={natal.depositPct}
      pixReady={Boolean(natal.pix.key)}
      acceptingOrders={natal.acceptingOrders}
      whatsappHref={waLink(settings.contact.whatsapp, settings.messages.natal)}
    />
  );
}
