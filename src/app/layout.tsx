import type { Metadata } from 'next';
import './globals.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Prigor Expansão',
  description: 'Sistema de Inteligência Comercial e Expansão da Doces Prigor',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className="h-full bg-stone-50 antialiased">
      <body className="h-full flex flex-col font-sans text-stone-900 m-0">
        {children}
      </body>
    </html>
  );
}
