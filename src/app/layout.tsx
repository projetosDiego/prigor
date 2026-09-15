import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ToastProvider } from '@/components/shared/Toast';

export const dynamic = 'force-dynamic';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export const metadata: Metadata = {
  title: 'Prigor Expansão',
  description: 'Sistema de Inteligência Comercial e Expansão da Doces Prigor',
  icons: {
    icon: [
      { url: '/logo.png', type: 'image/png' },
      { url: '/icon.png', type: 'image/png' },
    ],
    shortcut: '/logo.png',
    apple: '/logo.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className="h-full bg-stone-50 antialiased">
      <body className="h-full flex flex-col font-sans text-stone-900 m-0">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
