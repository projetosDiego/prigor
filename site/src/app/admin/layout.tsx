import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: { default: 'Painel', template: '%s · Painel Doces Prigor' },
  robots: { index: false, follow: false },
};

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-[#f4efe8]">{children}</div>;
}
