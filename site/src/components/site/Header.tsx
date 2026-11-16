'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { LogIn } from 'lucide-react';

import { APP_URL, NAV } from '@/lib/site';
import { Logo } from './Logo';
import { WhatsAppIcon, InstagramIcon } from '../icons';

export function Header({ whatsappHref, instagramHref }: { whatsappHref: string; instagramHref: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const [menuTop, setMenuTop] = useState(66);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Fecha o menu ao navegar.
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    // O menu começa logo abaixo do cabeçalho (que pode ter a faixa de aviso acima).
    if (open && headerRef.current) setMenuTop(Math.round(headerRef.current.getBoundingClientRect().bottom));
    document.body.style.overflow = open ? 'hidden' : '';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));
  const links = NAV.filter((item) => item.href !== '/' && item.href !== '/seja-um-revendedor');

  return (
    <header
      ref={headerRef}
      className={`on-dark sticky top-0 z-50 transition-[background-color,box-shadow,backdrop-filter] duration-500 ${
        scrolled && !open ? 'bg-cocoa/88 shadow-[0_1px_0_rgb(185_154_101_/_0.18)] backdrop-blur-xl' : 'bg-cocoa'
      }`}
    >
      <div className={`container-x flex items-center justify-between gap-6 transition-[height] duration-500 ${scrolled ? 'h-[66px] lg:h-[72px]' : 'h-[72px] lg:h-[88px]'}`}>
        <Logo height={scrolled ? 44 : 52} className="transition-all duration-500" />

        <nav aria-label="Principal" className="hidden items-center gap-9 lg:flex">
          {links.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`link-underline py-1 text-[0.72rem] font-bold tracking-[0.16em] uppercase transition-colors ${
                isActive(item.href) ? 'text-gold-2' : 'text-cream/75 hover:text-cream'
              }`}
              aria-current={isActive(item.href) ? 'page' : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <a
            href={APP_URL}
            className="hidden items-center gap-2 rounded-full px-3 py-2 text-[0.68rem] font-bold tracking-[0.16em] text-cream/70 uppercase transition-colors hover:text-cream sm:inline-flex"
            data-track="app_login"
            data-track-label="header"
          >
            <LogIn size={15} /> Entrar
          </a>
          <Link
            href="/seja-um-revendedor"
            className="btn btn-gold hidden !min-h-11 !px-5 !text-[0.66rem] sm:inline-flex"
            data-track="cta_vender"
            data-track-label="header"
            aria-current={isActive('/seja-um-revendedor') ? 'page' : undefined}
          >
            Seja um revendedor
          </Link>
          <button
            type="button"
            className="-mr-2 inline-flex size-12 flex-col items-center justify-center gap-[7px] rounded-full text-cream lg:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="menu-mobile"
            aria-label={open ? 'Fechar menu' : 'Abrir menu'}
          >
            <span className={`h-px w-6 bg-current transition-transform duration-500 ${open ? 'translate-y-[4px] rotate-45' : ''}`} />
            <span className={`h-px w-6 bg-current transition-transform duration-500 ${open ? '-translate-y-[4px] -rotate-45' : ''}`} />
          </button>
        </div>
      </div>

      <div
        id="menu-mobile"
        inert={!open}
        style={{ top: menuTop }}
        className={`fixed inset-x-0 bottom-0 z-40 flex flex-col overflow-y-auto bg-cocoa transition-[opacity,visibility] duration-500 lg:hidden ${
          open ? 'visible opacity-100' : 'invisible opacity-0'
        }`}
      >
        <nav aria-label="Menu" className="container-x flex flex-1 flex-col justify-center py-6">
          {NAV.map((item, i) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-baseline gap-4 border-b border-cream/10 py-4 font-display text-[2rem] font-light transition-[opacity,transform] duration-700 ${
                open ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
              } ${isActive(item.href) ? 'text-gold-2' : 'text-cream'}`}
              style={{ transitionDelay: open ? `${80 + i * 55}ms` : '0ms' }}
              aria-current={isActive(item.href) ? 'page' : undefined}
            >
              <span className="font-sans text-[0.65rem] font-bold tracking-[0.2em] text-gold">0{i + 1}</span>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="container-x grid gap-3 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <div className="grid grid-cols-2 gap-3">
            <Link href="/onde-encontrar" className="btn btn-light w-full !px-3 !text-[0.66rem]" data-track="cta_experimentar" data-track-label="menu-mobile">
              Quero experimentar
            </Link>
            <Link href="/seja-um-revendedor" className="btn btn-gold w-full !px-3 !text-[0.66rem]" data-track="cta_vender" data-track-label="menu-mobile">
              Quero revender
            </Link>
          </div>
          <a href={APP_URL} className="flex items-center justify-center gap-2 py-1 text-[0.72rem] font-bold tracking-[0.16em] text-cream/65 uppercase" data-track="app_login" data-track-label="menu-mobile">
            <LogIn size={15} /> Entrar no sistema
          </a>
          <div className="grid grid-cols-2 gap-3">
            <a href={whatsappHref} target="_blank" rel="noopener" className="btn btn-outline-light w-full !px-3" data-track="whatsapp_click" data-track-label="menu-mobile">
              <WhatsAppIcon size={18} /> WhatsApp
            </a>
            <a href={instagramHref} target="_blank" rel="noopener" className="btn btn-outline-light w-full !px-3" data-track="instagram_click" data-track-label="menu-mobile">
              <InstagramIcon size={18} /> Instagram
            </a>
          </div>
        </div>
      </div>
    </header>
  );
}
