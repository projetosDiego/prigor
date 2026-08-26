/**
 * Mensagem de abordagem por WhatsApp, com prova social.
 *
 * Antes qualquer usuário autenticado conseguia gerar a mensagem de qualquer
 * lead — inclusive o telefone. Agora o lead precisa ser da carteira de quem
 * pede (gestão continua vendo tudo).
 */
import { assertOwnedBySeller, requireUser } from '@/server/auth/guard';
import { getNearbyCustomers } from '@/lib/geocoding';
import { prisma } from '@/server/db';
import { notFound } from '@/server/http/errors';
import { ok, route } from '@/server/http/respond';

type Context = { params: Promise<{ id: string }> };

const DEFAULT_TEMPLATE =
  'Olá! Tudo bem? Sou {vendedor}, da Doces Prigor. Estamos ampliando nossa rede de pontos de revenda na região de {bairro} e acredito que nosso produto combine muito com o perfil do {estabelecimento}. Já atendemos outros pontos próximos como o {cliente_proximo}. Podemos conversar?';

export const GET = route<Context>('leads.whatsapp', async (_request, { params }) => {
  const session = await requireUser();
  const { id } = await params;

  const lead = await prisma.lead.findUnique({
    where: { id },
    include: { seller: { select: { name: true } } },
  });

  if (!lead) throw notFound('Lead');
  assertOwnedBySeller(session, lead, 'lead');

  const settings = await prisma.systemSettings.findFirst({
    select: { nearbyRadiusKm: true, whatsappTemplate: true },
  });

  const nearbyRadius = settings?.nearbyRadiusKm ?? 5;
  const template = settings?.whatsappTemplate?.trim() || DEFAULT_TEMPLATE;

  const nearbyCustomers = await getNearbyCustomers(lead.latitude, lead.longitude, nearbyRadius);
  const closestCustomer = nearbyCustomers.length > 0 ? nearbyCustomers[0] : null;

  const sellerName = lead.seller?.name || session.name || 'Representante';

  let message = template
    .replace(/\{vendedor\}/g, sellerName)
    .replace(/\{estabelecimento\}/g, lead.tradeName)
    .replace(/\{bairro\}/g, lead.neighborhood);

  if (closestCustomer) {
    const distance =
      closestCustomer.distance < 1
        ? `${Math.round(closestCustomer.distance * 1000)}m`
        : `${closestCustomer.distance.toFixed(1)}km`;
    message = message.replace(
      /\{cliente_proximo\}/g,
      `${closestCustomer.tradeName} (${distance} de distância)`,
    );
  } else {
    // Sem cliente por perto, a frase de prova social inteira sai fora.
    message = message
      .replace(
        /Já atendemos outros pontos próximos como o \{cliente_proximo\}\./g,
        'Estamos expandindo nossa rede de parceiros comerciais nesta zona.',
      )
      .replace(/\{cliente_proximo\}/g, 'nossos parceiros locais');
  }

  message = message.replace(/\s+/g, ' ').trim();

  // wa.me exige só dígitos e DDI; número local ganha o 55 na frente.
  const cleanPhone = lead.phone ? lead.phone.replace(/\D/g, '') : '';
  const formattedPhone =
    cleanPhone && cleanPhone.length <= 11 && !cleanPhone.startsWith('55')
      ? `55${cleanPhone}`
      : cleanPhone;

  return ok({
    success: true,
    leadPhone: lead.phone ?? '',
    formattedPhone,
    message,
    whatsappUrl: `https://api.whatsapp.com/send?phone=${formattedPhone}&text=${encodeURIComponent(message)}`,
    closestCustomer: closestCustomer
      ? {
          id: closestCustomer.id,
          tradeName: closestCustomer.tradeName,
          category: closestCustomer.category,
          distance: closestCustomer.distance,
        }
      : null,
  });
});
