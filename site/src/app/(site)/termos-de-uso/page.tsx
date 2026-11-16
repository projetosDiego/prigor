import type { Metadata } from 'next';
import Link from 'next/link';

import { getSettings } from '@/lib/settings';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Termos de Uso',
  description: 'Condições de uso do site oficial da Doces Prigor.',
  alternates: { canonical: '/termos-de-uso' },
};

export default async function TermsPage() {
  const { contact } = await getSettings();
  const company = contact.legalName || 'Doces Prigor';

  return (
    <article className="container-x max-w-3xl pt-10 pb-16 md:pt-20">
      <p className="eyebrow">Institucional</p>
      <h1 className="mt-4 text-[2.5rem] leading-[1.05] font-medium text-cocoa md:text-6xl">Termos de Uso</h1>
      <div className="mt-10 space-y-8 text-[1.02rem] leading-relaxed text-muted [&_h2]:mb-3 [&_h2]:font-display [&_h2]:text-2xl [&_h2]:text-cocoa">
        <p>Ao usar este site, você concorda com as condições abaixo.</p>
        <section>
          <h2>Finalidade do site</h2>
          <p>
            Este é o site institucional de {company}. Ele apresenta a marca e os produtos, indica pontos de venda e recebe contatos de estabelecimentos interessados em revenda. O site não realiza vendas online.
          </p>
        </section>
        <section>
          <h2>Informações sobre produtos e pontos de venda</h2>
          <p>
            As imagens são ilustrativas. A disponibilidade de produtos, sabores e horários pode variar em cada ponto de venda, que é um estabelecimento independente e responsável pelo próprio atendimento.
          </p>
        </section>
        <section>
          <h2>Propriedade intelectual</h2>
          <p>Marca, logo, fotografias e textos pertencem a {company} e não podem ser usados sem autorização.</p>
        </section>
        <section>
          <h2>Cadastro de revenda</h2>
          <p>O envio do cadastro não gera obrigação comercial para nenhuma das partes. As condições de parceria são tratadas diretamente com a nossa equipe.</p>
        </section>
        <section>
          <h2>Dados pessoais</h2>
          <p>
            O tratamento de dados segue a nossa{' '}
            <Link href="/politica-de-privacidade" className="underline underline-offset-2">Política de Privacidade</Link>.
          </p>
        </section>
        <p className="text-sm">Última atualização: {new Date().getFullYear()}.</p>
      </div>
    </article>
  );
}
