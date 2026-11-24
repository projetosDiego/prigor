import { currentLoyaltyHash } from '@/server/auth/loyalty-session';
import { getMemberView } from '@/server/services/loyalty';
import { getPublicSmsConfig } from '@/server/services/loyalty-sms';

import ClubeClient from './ClubeClient';

export const metadata = {
  title: 'Clube Prigor | Doces Prigor',
  description: 'Cadastre-se no Clube Prigor e ganhe brownie de presente.',
};

export default async function ClubePage({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const { ref } = await searchParams;
  const [member, sms] = await Promise.all([getMemberView(await currentLoyaltyHash()), getPublicSmsConfig()]);
  return <ClubeClient point={null} initialMember={member} referralCode={ref?.slice(0, 20) ?? null} sms={sms} />;
}
