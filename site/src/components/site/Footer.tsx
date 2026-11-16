import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';

import type { Settings } from '@/lib/settings';
import { APP_URL, SLOGAN } from '@/lib/site';
import { formatPhone, instagramHandle } from '@/lib/text';
import { waLink } from '@/lib/whatsapp';
import { InstagramIcon, WhatsAppIcon } from '../icons';
import { Logo } from './Logo';

export function Footer({ settings }: { settings: Settings }) {
  const { contact, messages } = settings;
  const ig = instagramHandle(contact.instagram);
  const year = new Date().getFullYear();

  return (
    <footer className="on-dark relative bg-[#1a0d0a] text-cream">
      <div className="container-x grid gap-14 py-16 md:py-20 lg:grid-cols-[1.2fr_2fr]">
        <div>
          <Logo height={88} />
          <p className="mt-6 max-w-xs font-display text-2xl leading-snug font-light text-cream italic">{SLOGAN}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href={waLink(contact.whatsapp, messages.general)}
              target="_blank"
              rel="noopener"
              className="btn btn-outline-light !min-h-11 !px-5 !text-[0.7rem]"
              data-track="whatsapp_click"
              data-track-label="footer"
            >
              <WhatsAppIcon size={17} /> Falar pelo WhatsApp
            </a>
            {ig && (
              <a
                href={`https://www.instagram.com/${ig}/`}
                target="_blank"
                rel="noopener"
                className="btn btn-outline-light !min-h-11 !px-5 !text-[0.7rem]"
                data-track="instagram_click"
                data-track-label="footer"
              >
                <InstagramIcon size={17} /> @{ig}
              </a>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-10 sm:grid-cols-3">
          <div>
            <p className="eyebrow eyebrow-plain">Navegue</p>
            <ul className="mt-5 space-y-3 text-[0.95rem] text-cream/80">
              <li><Link className="link-underline hover:text-cream" href="/nossa-historia">Nossa história</Link></li>
              <li><Link className="link-underline hover:text-cream" href="/produtos">Produtos</Link></li>
              <li><Link className="link-underline hover:text-cream" href="/natal2026">Cardápio de Natal</Link></li>
              <li><Link className="link-underline hover:text-cream" href="/onde-encontrar">Onde encontrar</Link></li>
              <li><Link className="link-underline hover:text-cream" href="/seja-um-revendedor">Seja um revendedor</Link></li>
              <li><Link className="link-underline hover:text-cream" href="/contato">Contato</Link></li>
            </ul>
          </div>
          <div>
            <p className="eyebrow eyebrow-plain">Para você</p>
            <ul className="mt-5 space-y-3 text-[0.95rem] text-cream/80">
              <li>
                <Link className="link-underline hover:text-cream" href="/onde-encontrar" data-track="cta_experimentar" data-track-label="footer">
                  Quero experimentar
                </Link>
              </li>
              <li>
                <a className="link-underline hover:text-cream" href={waLink(contact.whatsapp, messages.findPoint)} target="_blank" rel="noopener" data-track="whatsapp_click" data-track-label="footer:onde-encontrar">
                  Quero saber onde encontrar
                </a>
              </li>
            </ul>
            <p className="eyebrow eyebrow-plain mt-8">Para o seu negócio</p>
            <ul className="mt-5 space-y-3 text-[0.95rem] text-cream/80">
              <li>
                <Link className="link-underline hover:text-cream" href="/seja-um-revendedor" data-track="cta_vender" data-track-label="footer">
                  Quero revender Prigor
                </Link>
              </li>
              <li>
                <a className="link-underline hover:text-cream" href={waLink(contact.whatsapp, messages.reseller)} target="_blank" rel="noopener" data-track="whatsapp_click" data-track-label="footer:revenda">
                  Revenda pelo WhatsApp
                </a>
              </li>
            </ul>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <p className="eyebrow eyebrow-plain">Contato</p>
            <ul className="mt-5 space-y-3 text-[0.95rem] text-cream/80">
              {contact.whatsapp && (
                <li>
                  <a className="link-underline hover:text-cream" href={waLink(contact.whatsapp, messages.general)} target="_blank" rel="noopener" data-track="whatsapp_click" data-track-label="footer:numero">
                    {formatPhone(contact.whatsapp)}
                  </a>
                </li>
              )}
              {contact.email && (
                <li>
                  <a className="link-underline hover:text-cream" href={`mailto:${contact.email}`}>{contact.email}</a>
                </li>
              )}
              {contact.region && <li>{contact.region}</li>}
            </ul>
          </div>
        </div>
      </div>

      <div className="border-t border-cream/10">
        <div className="container-x flex flex-col gap-4 pt-7 pb-16 text-[0.8rem] text-cream/55 md:flex-row md:items-center md:justify-between md:pr-56 md:pb-7">
          <p>
            © {year} {contact.legalName || 'Doces Prigor'}. Todos os direitos reservados.
            {contact.cnpj && <> · CNPJ {contact.cnpj}</>}
          </p>
          <div className="flex gap-6">
            <Link className="hover:text-cream" href="/politica-de-privacidade">Política de Privacidade</Link>
            <Link className="hover:text-cream" href="/termos-de-uso">Termos de Uso</Link>
            <a className="hover:text-cream" href={APP_URL}>Entrar</a>
            {ig && (
              <a className="inline-flex items-center gap-1 hover:text-cream" href={`https://www.instagram.com/${ig}/`} target="_blank" rel="noopener">
                Instagram <ArrowUpRight size={13} />
              </a>
            )}
          </div>
        </div>
      </div>
    </footer>
  );
}
