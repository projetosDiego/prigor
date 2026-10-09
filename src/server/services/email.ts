import nodemailer from 'nodemailer';
import { prisma } from '@/server/db';

interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Cria ou recupera o transportador SMTP do Nodemailer
 */
function getTransporter() {
  const host = process.env.SMTP_HOST || 'smtp.hostinger.com';
  const port = parseInt(process.env.SMTP_PORT || '465', 10);
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;
  const user = process.env.SMTP_USER || 'contato@docesprigor.com.br';
  const pass = process.env.SMTP_PASS || 'Doces@prigor0308';

  if (!user || !pass) {
    console.warn('[EMAIL] Configurações de SMTP_USER ou SMTP_PASS ausentes.');
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    tls: {
      rejectUnauthorized: false,
    },
  });
}

function formatCurrency(val: unknown): string {
  const num = typeof val === 'number' ? val : parseFloat(String(val ?? 0));
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(isNaN(num) ? 0 : num);
}

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return 'A combinar';
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  } catch {
    return String(date);
  }
}

/**
 * Dispara e-mail de notificação de novo pedido realizado pelo Autoatendimento / Pedido Rápido
 */
export async function sendNewOrderNotification(orderId: string): Promise<SendResult> {
  try {
    const transporter = getTransporter();
    if (!transporter) {
      return { success: false, error: 'Transporter SMTP não configurado.' };
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer: true,
        deliveryAddress: true,
        seller: { select: { name: true, code: true } },
        items: {
          include: {
            product: { select: { name: true } },
          },
        },
      },
    });

    if (!order) {
      console.error(`[EMAIL] Pedido ${orderId} não encontrado.`);
      return { success: false, error: 'Pedido não encontrado.' };
    }

    const appUrl = (process.env.APP_URL || 'https://docesprigor.com.br').replace(/\/$/, '');
    const toEmail = process.env.NOTIFICATION_EMAIL || process.env.SMTP_USER || 'contato@docesprigor.com.br';
    const fromName = 'Doces Prigor OS';
    const fromEmail = process.env.SMTP_USER || 'contato@docesprigor.com.br';

    // Endereço de entrega prioritário ou endereço do cadastro
    const delivery = order.deliveryAddress;
    const cust = order.customer;

    const fullDeliveryAddress = delivery
      ? `${delivery.address}${delivery.number ? `, nº ${delivery.number}` : ''}${
          delivery.complement ? ` (${delivery.complement})` : ''
        } - ${delivery.neighborhood}, ${delivery.city}/${delivery.state}${
          delivery.zipCode ? ` - CEP: ${delivery.zipCode}` : ''
        }`
      : `${cust.address || 'Não informado'}${cust.number ? `, nº ${cust.number}` : ''}${
          cust.complement ? ` (${cust.complement})` : ''
        } - ${cust.neighborhood || ''}, ${cust.city || 'Rio de Janeiro'}/${cust.state || 'RJ'}${
          cust.zipCode ? ` - CEP: ${cust.zipCode}` : ''
        }`;

    const cleanPhone = (cust.phone || '').replace(/\D/g, '');
    const whatsappLink = cleanPhone ? `https://wa.me/55${cleanPhone}` : null;

    const itemsRowsHtml = order.items
      .map(
        (it) => `
        <tr style="border-bottom: 1px solid #f3f4f6;">
          <td style="padding: 10px 8px; font-size: 13px; color: #1f2937; font-weight: bold;">
            ${it.product?.name || 'Produto'}
          </td>
          <td style="padding: 10px 8px; font-size: 13px; color: #4b5563; text-align: center;">
            ${parseFloat(String(it.quantity))}
          </td>
          <td style="padding: 10px 8px; font-size: 13px; color: #4b5563; text-align: right;">
            ${formatCurrency(it.unitPrice)}
          </td>
          <td style="padding: 10px 8px; font-size: 13px; color: #92400e; font-weight: bold; text-align: right;">
            ${formatCurrency(it.subtotal)}
          </td>
        </tr>
      `,
      )
      .join('');

    const pdfUrl = `${appUrl}/api/public/orders/${order.id}/pdf`;
    const adminOrdersUrl = `${appUrl}/admin/orders`;

    const html = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="utf-8">
        <title>Novo Pedido Doces Prigor</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f5f5f4; margin: 0; padding: 24px; color: #292524;">
        <div style="max-width: 620px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e7e5e4; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
          
          <!-- Cabeçalho -->
          <div style="background-color: #92400e; padding: 24px; text-align: center;">
            <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -0.5px;">
              Doces Prigor
            </h1>
            <p style="color: #fef3c7; margin: 4px 0 0 0; font-size: 13px; font-weight: 600;">
              A Felicidade em forma de Brownie!
            </p>
          </div>

          <!-- Título do Pedido -->
          <div style="padding: 24px 24px 16px 24px; text-align: center; border-bottom: 1px solid #f5f5f4;">
            <div style="display: inline-block; background-color: #fef3c7; color: #92400e; padding: 4px 12px; border-radius: 9999px; font-size: 11px; font-weight: 800; text-transform: uppercase; margin-bottom: 8px;">
              Autoatendimento / Pedido Rápido
            </div>
            <h2 style="margin: 0; color: #1c1917; font-size: 20px; font-weight: 800;">
              Novo Pedido Registrado: #${order.numero}
            </h2>
            <p style="margin: 4px 0 0 0; color: #78716c; font-size: 13px;">
              Recebido em ${formatDate(order.orderDate)} às ${new Date(order.orderDate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}
            </p>
          </div>

          <div style="padding: 20px 24px;">

            ${
              order.hasNegotiatedPrice
                ? `
              <!-- Alerta de Preço Negociado -->
              <div style="background-color: #fffbeb; border: 1px solid #fcd34d; border-left: 4px solid #d97706; padding: 14px; border-radius: 8px; margin-bottom: 20px;">
                <strong style="color: #92400e; font-size: 13px;">⚠️ ATENÇÃO: Valores Negociados</strong>
                <p style="margin: 4px 0 0 0; color: #78350f; font-size: 12px; line-height: 1.4;">
                  Este pedido contém itens com preços unitários alterados e consta como <strong>Aguardando Liberação da Gerência</strong> no sistema.
                </p>
              </div>
            `
                : ''
            }

            <!-- Dados do Cliente -->
            <div style="background-color: #fafaf9; border: 1px solid #e7e5e4; border-radius: 12px; padding: 16px; margin-bottom: 16px;">
              <h3 style="margin: 0 0 10px 0; font-size: 13px; font-weight: 800; text-transform: uppercase; color: #78716c; letter-spacing: 0.5px;">
                👤 Dados do Cliente
              </h3>
              <p style="margin: 0 0 6px 0; font-size: 15px; font-weight: bold; color: #1c1917;">
                ${cust.tradeName} ${cust.legalName && cust.legalName !== cust.tradeName ? `(${cust.legalName})` : ''}
              </p>
              <div style="font-size: 13px; color: #57534e; line-height: 1.5;">
                ${cust.cnpj ? `<strong>CNPJ:</strong> ${cust.cnpj}<br/>` : ''}
                ${cust.cpf ? `<strong>CPF:</strong> ${cust.cpf}<br/>` : ''}
                <strong>Telefone:</strong> ${cust.phone} 
                ${whatsappLink ? `(<a href="${whatsappLink}" target="_blank" style="color: #059669; font-weight: bold; text-decoration: none;">Abrir no WhatsApp</a>)` : ''}
                ${cust.email ? `<br/><strong>E-mail:</strong> ${cust.email}` : ''}
              </div>
            </div>

            <!-- Endereço de Entrega -->
            <div style="background-color: #fafaf9; border: 1px solid #e7e5e4; border-radius: 12px; padding: 16px; margin-bottom: 16px;">
              <h3 style="margin: 0 0 8px 0; font-size: 13px; font-weight: 800; text-transform: uppercase; color: #78716c; letter-spacing: 0.5px;">
                📍 Endereço de Entrega
              </h3>
              <p style="margin: 0; font-size: 13px; color: #1c1917; font-weight: 500; line-height: 1.5;">
                ${fullDeliveryAddress}
              </p>
            </div>

            <!-- Condições do Pedido -->
            <div style="display: table; width: 100%; margin-bottom: 16px;">
              <div style="display: table-row;">
                <div style="display: table-cell; width: 50%; padding-right: 8px;">
                  <div style="background-color: #fafaf9; border: 1px solid #e7e5e4; border-radius: 12px; padding: 12px;">
                    <span style="font-size: 11px; text-transform: uppercase; color: #78716c; font-weight: bold; display: block;">Data de Entrega</span>
                    <strong style="font-size: 14px; color: #1c1917;">${formatDate(order.deliveryDate)}</strong>
                  </div>
                </div>
                <div style="display: table-cell; width: 50%; padding-left: 8px;">
                  <div style="background-color: #fafaf9; border: 1px solid #e7e5e4; border-radius: 12px; padding: 12px;">
                    <span style="font-size: 11px; text-transform: uppercase; color: #78716c; font-weight: bold; display: block;">Forma de Pagamento</span>
                    <strong style="font-size: 14px; color: #1c1917;">${order.paymentMethod || 'A combinar'}</strong>
                  </div>
                </div>
              </div>
            </div>

            ${
              order.seller
                ? `
              <p style="font-size: 12px; color: #78716c; margin: 0 0 16px 0;">
                👔 <strong>Vendedor Vinculado:</strong> ${order.seller.name} (${order.seller.code})
              </p>
            `
                : ''
            }

            ${
              order.notes
                ? `
              <div style="background-color: #f5f5f4; border-radius: 8px; padding: 10px 14px; margin-bottom: 16px; font-size: 12px; color: #57534e;">
                <strong>Observações:</strong> ${order.notes}
              </div>
            `
                : ''
            }

            <!-- Tabela de Produtos -->
            <div style="margin-bottom: 20px;">
              <h3 style="margin: 0 0 10px 0; font-size: 13px; font-weight: 800; text-transform: uppercase; color: #78716c; letter-spacing: 0.5px;">
                🛒 Itens do Pedido
              </h3>
              <table style="width: 100%; border-collapse: collapse;">
                <thead>
                  <tr style="border-bottom: 2px solid #e5e7eb; background-color: #f9fafb;">
                    <th style="padding: 8px; font-size: 11px; text-transform: uppercase; color: #6b7280; text-align: left;">Item</th>
                    <th style="padding: 8px; font-size: 11px; text-transform: uppercase; color: #6b7280; text-align: center;">Qtd</th>
                    <th style="padding: 8px; font-size: 11px; text-transform: uppercase; color: #6b7280; text-align: right;">Unitário</th>
                    <th style="padding: 8px; font-size: 11px; text-transform: uppercase; color: #6b7280; text-align: right;">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  ${itemsRowsHtml}
                </tbody>
                <tfoot>
                  <tr>
                    <td colspan="3" style="padding: 14px 8px; font-size: 15px; font-weight: 800; text-align: right; color: #1c1917;">
                      Total do Pedido:
                    </td>
                    <td style="padding: 14px 8px; font-size: 17px; font-weight: 900; text-align: right; color: #92400e;">
                      ${formatCurrency(order.total)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <!-- Botões de Ação -->
            <div style="text-align: center; margin-top: 24px; padding-top: 16px; border-top: 1px solid #f5f5f4;">
              <a href="${pdfUrl}" target="_blank" style="display: inline-block; background-color: #92400e; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: bold; padding: 12px 24px; border-radius: 10px; margin-right: 8px; margin-bottom: 8px;">
                📄 Baixar Espelho do Pedido (PDF)
              </a>
              <a href="${adminOrdersUrl}" target="_blank" style="display: inline-block; background-color: #f5f5f4; color: #44403c; text-decoration: none; font-size: 14px; font-weight: bold; padding: 12px 20px; border-radius: 10px; border: 1px solid #d6d3d1; margin-bottom: 8px;">
                ⚙️ Ver no Painel Central
              </a>
            </div>

          </div>

          <!-- Rodapé -->
          <div style="background-color: #fafaf9; border-top: 1px solid #e7e5e4; padding: 16px; text-align: center;">
            <p style="margin: 0; font-size: 11px; color: #a8a29e;">
              Doces Prigor OS • Notificação automática enviada via Hostinger SMTP
            </p>
          </div>

        </div>
      </body>
      </html>
    `;

    const info = await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to: toEmail,
      subject: `🍰 Novo Pedido #${order.numero} - ${cust.tradeName} (${formatCurrency(order.total)})`,
      html,
    });

    console.log(`[EMAIL] Notificação do pedido #${order.numero} enviada para ${toEmail}! MessageId: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[EMAIL] Erro ao disparar notificação de e-mail:', msg);
    return { success: false, error: msg };
  }
}

/** Envio genérico (cobrança, avisos). Não lança: devolve o resultado. */
export async function sendMail(args: { to: string; subject: string; html: string; text?: string }): Promise<SendResult> {
  try {
    const transporter = getTransporter();
    if (!transporter) return { success: false, error: 'SMTP não configurado.' };
    const from = process.env.SMTP_FROM || `Doces Prigor <${process.env.SMTP_USER || 'contato@docesprigor.com.br'}>`;
    const info = await transporter.sendMail({ from, to: args.to, subject: args.subject, html: args.html, text: args.text });
    return { success: true, messageId: info.messageId };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}
