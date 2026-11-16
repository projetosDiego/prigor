'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { fillTemplate, waLink } from '@/lib/whatsapp';
import type { MessageSettings } from '@/lib/settings';
import { WhatsAppIcon } from '../icons';

/** Botão flutuante com mensagem de acordo com a página em que a pessoa está. */
export function WhatsAppFloat({ number, messages, products }: { number: string; messages: MessageSettings; products: Record<string, string> }) {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 320);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const productName = pathname.startsWith('/produtos/') ? (products[pathname.split('/')[2] ?? ''] ?? '') : '';
  let message = messages.general;
  let label = 'Fale com a gente';
  if (pathname.startsWith('/natal')) {
    message = messages.natal;
    label = 'Dúvidas do Natal';
  } else if (pathname.startsWith('/seja-um-revendedor')) {
    message = messages.reseller;
    label = 'Quero revender';
  } else if (pathname.startsWith('/onde-encontrar') || pathname.startsWith('/pontos-de-venda')) {
    message = messages.findPoint;
    label = 'Onde encontrar?';
  } else if (pathname.startsWith('/produtos/') && productName) {
    message = fillTemplate(messages.product, { produto: productName });
    label = 'Perguntar';
  }

  const href = waLink(number, message);
  if (!href) return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener"
      aria-label={`${label} — WhatsApp da Doces Prigor`}
      data-track="whatsapp_click"
      data-track-label={`flutuante:${label}`}
      className={`fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 flex h-14 items-center gap-2 rounded-full bg-[#1f7a4d] text-white ${pathname.startsWith('/natal') ? 'w-14 justify-center md:w-auto md:pr-5 md:pl-4' : 'pr-5 pl-4'} shadow-[0_14px_34px_-10px_rgb(20_70_45_/_0.6)] transition-all duration-500 hover:bg-[#19663f] md:right-6 md:bottom-6 ${
        visible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-4 opacity-0'
      }`}
    >
      <WhatsAppIcon size={24} />
      <span className={`text-[0.78rem] font-bold tracking-wide ${pathname.startsWith('/natal') ? 'max-md:hidden' : ''}`}>{label}</span>
    </a>
  );
}
