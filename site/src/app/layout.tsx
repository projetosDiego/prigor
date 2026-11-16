import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';

import { SITE_URL, SLOGAN } from '@/lib/site';
import './globals.css';

// Fontes servidas pelo próprio site (sem chamada externa): melhor LCP e sem dependência de terceiros.
const fraunces = localFont({
  variable: '--font-fraunces',
  display: 'swap',
  src: [
    { path: '../fonts/fraunces-latin-opsz-normal.woff2', style: 'normal', weight: '100 900' },
    { path: '../fonts/fraunces-latin-opsz-italic.woff2', style: 'italic', weight: '100 900' },
  ],
  fallback: ['Georgia', 'serif'],
});

const manrope = localFont({
  variable: '--font-manrope',
  display: 'swap',
  src: [{ path: '../fonts/manrope-latin-wght-normal.woff2', style: 'normal', weight: '200 800' }],
  fallback: ['system-ui', 'sans-serif'],
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#24130f',
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `Doces Prigor | ${SLOGAN}`,
    template: '%s | Doces Prigor',
  },
  description:
    'Doces Prigor: brownies artesanais, brownies recheados e sobremesas. Encontre um ponto de venda perto de você ou leve a Doces Prigor para o seu estabelecimento.',
  applicationName: 'Doces Prigor',
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    siteName: 'Doces Prigor',
    images: [{ url: '/og-doces-prigor.jpg', width: 1200, height: 630, alt: 'Doces Prigor — A felicidade em forma de brownie.' }],
  },
  twitter: { card: 'summary_large_image' },
  formatDetection: { telephone: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${fraunces.variable} ${manrope.variable}`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
