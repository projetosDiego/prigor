import type { Metadata } from 'next';

import { getSettings } from '@/lib/settings';
import { formatPhone } from '@/lib/text';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Política de Privacidade',
  description: 'Como a Doces Prigor coleta, usa e protege os dados pessoais enviados pelo site.',
  alternates: { canonical: '/politica-de-privacidade' },
};

export default async function PrivacyPage() {
  const { contact } = await getSettings();
  const company = contact.legalName || 'Doces Prigor';
  const channel = [contact.email, contact.whatsapp && `WhatsApp ${formatPhone(contact.whatsapp)}`].filter(Boolean).join(' ou ');

  return (
    <article className="container-x max-w-3xl pt-10 pb-16 md:pt-20">
      <p className="eyebrow">Institucional</p>
      <h1 className="mt-4 text-[2.5rem] leading-[1.05] font-medium text-cocoa md:text-6xl">Política de Privacidade</h1>
      <div className="mt-10 space-y-8 text-[1.02rem] leading-relaxed text-muted [&_h2]:mb-3 [&_h2]:font-display [&_h2]:text-2xl [&_h2]:text-cocoa [&_li]:ml-5 [&_li]:list-disc">
        <p>
          Esta política explica como {company}
          {contact.cnpj ? ` (CNPJ ${contact.cnpj})` : ''} trata os dados pessoais recebidos por este site, em conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018).
        </p>
        <section>
          <h2>Quais dados coletamos</h2>
          <ul>
            <li>Dados enviados no formulário de revenda: nome, empresa, WhatsApp, cidade, bairro, tipo de estabelecimento, Instagram, como conheceu a marca e mensagem.</li>
            <li>Dados de navegação agregados: páginas visitadas e cliques em botões, sem identificar você pessoalmente.</li>
            <li>Localização aproximada, apenas quando você toca em “Usar minha localização” — ela é usada no seu próprio navegador para ordenar os pontos de venda e não é armazenada.</li>
          </ul>
        </section>
        <section>
          <h2>Para que usamos</h2>
          <ul>
            <li>Responder ao seu interesse em revender os produtos e conduzir a negociação comercial.</li>
            <li>Mostrar os pontos de venda mais próximos de você.</li>
            <li>Entender o uso do site para melhorar conteúdo e navegação.</li>
          </ul>
        </section>
        <section>
          <h2>Cookies e ferramentas de medição</h2>
          <p>
            Ferramentas de medição de terceiros (como Google Analytics ou Meta Pixel), quando utilizadas, só são carregadas após o seu consentimento no aviso de cookies. Você pode mudar essa escolha limpando os dados do site no seu navegador.
          </p>
        </section>
        <section>
          <h2>Compartilhamento</h2>
          <p>
            Não vendemos dados pessoais. Os dados podem ser processados por fornecedores que nos ajudam a operar o site e o atendimento comercial (hospedagem, ferramentas de CRM e de mensagens), sempre para as finalidades descritas aqui.
          </p>
        </section>
        <section>
          <h2>Por quanto tempo guardamos</h2>
          <p>Mantemos os dados pelo tempo necessário para a relação comercial ou até que você solicite a exclusão, salvo obrigação legal.</p>
        </section>
        <section>
          <h2>Seus direitos</h2>
          <p>
            Você pode pedir acesso, correção, portabilidade ou exclusão dos seus dados, e revogar o consentimento a qualquer momento
            {channel ? `, pelo ${channel}` : ''}.
          </p>
        </section>
        <p className="text-sm">Última atualização: {new Date().getFullYear()}.</p>
      </div>
    </article>
  );
}
