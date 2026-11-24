/** Constantes e tipos do Clube Prigor usados nas telas (cliente final e gestão). */

/** WhatsApp oficial da Doces Prigor (mesmo do site). */
export const PRIGOR_WHATSAPP = '5521979908138';

/** Endereço público do sistema, onde ficam as páginas do Clube. */
export const CLUBE_BASE_URL = 'https://app.docesprigor.com.br/clube';

export function prigorWhatsappLink(text: string): string {
  return `https://wa.me/${PRIGOR_WHATSAPP}?text=${encodeURIComponent(text)}`;
}

/** Tipos que a API pública devolve (espelham MemberView do serviço). */
export interface ClubeReward {
  id: string;
  title: string;
  description: string | null;
  status: string;
  source: string;
  requiresCheck: boolean;
  expiresAt: string | null;
  reservedPointName: string | null;
  redeemedAt: string | null;
  redeemPointName: string | null;
  liveSecondsLeft: number;
}

export interface ClubeTask {
  id: string;
  code: string;
  title: string;
  description: string | null;
  points: number;
  actionUrl: string | null;
  actionLabel: string | null;
  proof: string;
  state: 'disponivel' | 'em_analise' | 'concluida' | 'aguarde';
  nextAt: string | null;
  lastRejectedNote: string | null;
}

export interface ClubeMember {
  firstName: string;
  phone: string;
  hasPin: boolean;
  points: number;
  referralCode: string | null;
  referralsCredited: number;
  rewards: ClubeReward[];
  tasks: ClubeTask[];
  catalog: { id: string; title: string; description: string | null; pointsCost: number }[];
  history: { delta: number; description: string; createdAt: string }[];
  serverNow: string;
}
