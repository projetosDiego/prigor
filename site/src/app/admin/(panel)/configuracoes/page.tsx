import type { Metadata } from 'next';

import { Card, Field, PageTitle, TextArea } from '@/components/admin/fields';
import { ActionForm, SubmitButton } from '@/components/admin/ui';
import { getSettings } from '@/lib/settings';
import { saveSettingsAction } from '../../actions';

export const metadata: Metadata = { title: 'Configurações' };

export default async function SettingsPage() {
  const { contact, messages, integrations } = await getSettings();

  return (
    <>
      <PageTitle title="Configurações" description="Contatos, mensagens do WhatsApp e integrações." />

      <ActionForm action={saveSettingsAction} className="grid max-w-4xl gap-6">
        <Card title="Contato e empresa">
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="WhatsApp principal" name="whatsapp" defaultValue={contact.whatsapp} hint="Com DDD. Ex.: 21979908138" />
            <Field label="Instagram" name="instagram" defaultValue={contact.instagram} placeholder="docesprigor" />
            <Field label="E-mail" name="email" type="email" defaultValue={contact.email} hint="Opcional. Aparece em Contato e no rodapé." />
            <Field label="Região de atuação" name="region" defaultValue={contact.region} />
            <Field label="Razão social / nome legal" name="legalName" defaultValue={contact.legalName} />
            <Field label="CNPJ" name="cnpj" defaultValue={contact.cnpj} hint="Opcional. Aparece no rodapé e na política." />
          </div>
          <Field label="Endereço institucional" name="address" defaultValue={contact.address} hint="Opcional." />
        </Card>

        <Card title="Mensagens do WhatsApp" description="Texto que já vem escrito quando a pessoa toca no botão. Cada contexto tem a sua.">
          <TextArea label="Geral (rodapé, contato, botão flutuante)" name="msg_general" defaultValue={messages.general} rows={2} />
          <TextArea label="Onde encontrar" name="msg_findPoint" defaultValue={messages.findPoint} rows={2} />
          <TextArea label="Revenda" name="msg_reseller" defaultValue={messages.reseller} rows={2} />
          <TextArea label="Produto" name="msg_product" defaultValue={messages.product} rows={2} hint="Use {produto} para o nome do produto." />
          <TextArea label="Após enviar o cadastro de revenda" name="msg_leadFollowUp" defaultValue={messages.leadFollowUp} rows={2} hint="Use {nome}, {empresa} e {cidade}." />
          <TextArea label="Para o WhatsApp de um ponto de venda" name="msg_point" defaultValue={messages.point} rows={2} />
          <TextArea label="Outros produtos (catálogo completo)" name="msg_catalog" defaultValue={messages.catalog} rows={2} />
          <TextArea label="Cardápio de Natal (dúvidas)" name="msg_natal" defaultValue={messages.natal} rows={2} />
        </Card>

        <Card title="Analytics" description="Os scripts só carregam depois que o visitante aceita os cookies. Os eventos também ficam registrados no painel.">
          <div className="grid gap-5 md:grid-cols-3">
            <Field label="Google Analytics 4" name="ga4Id" defaultValue={integrations.ga4Id} placeholder="G-XXXXXXXXXX" />
            <Field label="Google Tag Manager" name="gtmId" defaultValue={integrations.gtmId} placeholder="GTM-XXXXXXX" />
            <Field label="Meta Pixel" name="metaPixelId" defaultValue={integrations.metaPixelId} placeholder="000000000000000" />
          </div>
        </Card>

        <Card title="CRM" description="Cada novo lead é enviado via POST (JSON) para esta URL — funciona com Zapier, Make, n8n, RD Station, HubSpot, Pipedrive ou o sistema interno.">
          <Field label="URL do webhook" name="crmWebhookUrl" defaultValue={integrations.crmWebhookUrl} placeholder="https://…" />
          <Field label="Segredo de assinatura (opcional)" name="crmWebhookSecret" type="password" defaultValue={integrations.crmWebhookSecret} hint="Enviado como HMAC-SHA256 no cabeçalho X-Prigor-Signature." />
        </Card>

        <Card title="ERP (pedidos do site)" description="Os pedidos feitos pelo site (cardápio de Natal) são enviados para o Doces Prigor OS. Sem isto preenchido, eles ficam só aqui no painel, em Pedidos.">
          <Field label="Endereço do ERP" name="erpOrdersUrl" defaultValue={integrations.erpOrdersUrl} placeholder="https://app.docesprigor.com.br/api/public/site-orders" />
          <Field label="Segredo compartilhado" name="erpOrdersSecret" type="password" defaultValue={integrations.erpOrdersSecret} hint="O mesmo valor de SITE_ORDERS_SECRET no ERP." />
        </Card>

        <Card title="Instagram" description="Com um token da Instagram API, a Home mostra os posts mais recentes. Sem token, exibe fotos oficiais com link para o perfil.">
          <Field label="Token de acesso" name="instagramToken" type="password" defaultValue={integrations.instagramToken} />
        </Card>

        <div>
          <SubmitButton>Salvar configurações</SubmitButton>
        </div>
      </ActionForm>
    </>
  );
}
