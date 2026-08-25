import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSession } from '@/lib/auth';
import { getNearbyCustomers } from '@/lib/geocoding';

// GET /api/leads/[id]/whatsapp - Generate social proof WhatsApp message and link
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    const { id } = await params;

    const lead = await prisma.lead.findUnique({
      where: { id },
      include: { seller: true },
    });

    if (!lead) {
      return NextResponse.json({ error: 'Lead não encontrado.' }, { status: 404 });
    }

    // 1. Obter configurações e template
    let settings = await prisma.systemSettings.findFirst();
    if (!settings) {
      settings = await prisma.systemSettings.create({
        data: {
          dailyCostLimit: 10.0,
          monthlyCostLimit: 150.0,
          currentDailyCost: 0.0,
          currentMonthlyCost: 0.0,
          apiPaused: false,
          nearbyRadiusKm: 5,
          whatsappTemplate: 'Olá! Tudo bem? Sou {vendedor}, da Doces Prigor. Estamos ampliando nossa rede de pontos de revenda na região de {bairro} e acredito que nosso produto combine muito com o perfil do {estabelecimento}. Já atendemos outros pontos próximos como o {cliente_proximo}. Podemos conversar?',
        },
      });
    }

    // 2. Encontrar cliente Prigor mais próximo para prova social
    const nearbyRadius = settings.nearbyRadiusKm;
    const nearbyCustomers = await getNearbyCustomers(lead.latitude, lead.longitude, nearbyRadius);
    const closestCustomer = nearbyCustomers.length > 0 ? nearbyCustomers[0] : null;

    // 3. Montar a mensagem com substituição de variáveis
    let message = settings.whatsappTemplate;
    const sellerName = lead.seller?.name || session.name || 'Representante';
    
    message = message.replace(/{vendedor}/g, sellerName);
    message = message.replace(/{estabelecimento}/g, lead.tradeName);
    message = message.replace(/{bairro}/g, lead.neighborhood);

    if (closestCustomer) {
      // Ex: "Padaria X a 400m"
      const distStr = closestCustomer.distance < 1 
        ? `${Math.round(closestCustomer.distance * 1000)}m`
        : `${closestCustomer.distance.toFixed(1)}km`;
      message = message.replace(/{cliente_proximo}/g, `${closestCustomer.tradeName} (${distStr} de distância)`);
    } else {
      // Fallback genérico caso não existam clientes por perto
      message = message.replace(/Já atendemos outros pontos próximos como o {cliente_proximo}\./g, 'Estamos expandindo nossa rede de parceiros comerciais nesta zona.');
      message = message.replace(/{cliente_proximo}/g, 'nossos parceiros locais');
    }

    // Limpar espaços duplicados
    message = message.replace(/\s+/g, ' ').trim();

    // 4. Gerar link wa.me
    // Formatar telefone: remover tudo que não for dígito e adicionar DDI 55 se necessário
    const cleanPhone = lead.phone ? lead.phone.replace(/\D/g, '') : '';
    let finalPhone = cleanPhone;
    if (finalPhone && finalPhone.length <= 11 && !finalPhone.startsWith('55')) {
      finalPhone = `55${finalPhone}`;
    }

    const whatsappUrl = `https://api.whatsapp.com/send?phone=${finalPhone}&text=${encodeURIComponent(message)}`;

    return NextResponse.json({
      success: true,
      leadPhone: lead.phone || '',
      formattedPhone: finalPhone,
      message,
      whatsappUrl,
      closestCustomer: closestCustomer
        ? {
            id: closestCustomer.id,
            tradeName: closestCustomer.tradeName,
            category: closestCustomer.category,
            distance: closestCustomer.distance,
          }
        : null,
    });
  } catch (error) {
    console.error('Error generating WhatsApp data:', error);
    return NextResponse.json({ error: 'Erro ao gerar dados do WhatsApp.' }, { status: 500 });
  }
}
