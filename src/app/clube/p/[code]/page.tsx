import Link from 'next/link';

import { currentLoyaltyHash } from '@/server/auth/loyalty-session';
import { findPointByCode, getMemberView } from '@/server/services/loyalty';
import { getPublicSmsConfig } from '@/server/services/loyalty-sms';

import ClubeClient from '../../ClubeClient';

export const metadata = {
  title: 'Clube Prigor | Doces Prigor',
  description: 'Cadastre-se no Clube Prigor e ganhe brownie de presente.',
};

/** Entrada pelo QR Code do balcão de um ponto de revenda. */
export default async function ClubePontoPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ ref?: string }>;
}) {
  const { code } = await params;
  const { ref } = await searchParams;
  const point = await findPointByCode(code);

  if (!point) {
    return (
      <main className="min-h-screen bg-[#FAF7F1] flex items-center justify-center p-6 text-center">
        <div className="max-w-sm space-y-3">
          <h1 className="text-xl font-black text-[#24130F]">QR Code não encontrado</h1>
          <p className="text-sm text-stone-600">Este código não está ativo. Peça ajuda no balcão ou acesse o Clube direto.</p>
          <Link href="/clube" className="inline-block rounded-full bg-[#24130F] px-5 py-2.5 text-sm font-bold text-white">
            Ir para o Clube Prigor
          </Link>
        </div>
      </main>
    );
  }

  const [member, sms] = await Promise.all([getMemberView(await currentLoyaltyHash()), getPublicSmsConfig()]);
  return <ClubeClient point={{ name: point.name, code: code.trim().toLowerCase() }} initialMember={member} referralCode={ref?.slice(0, 20) ?? null} sms={sms} />;
}
