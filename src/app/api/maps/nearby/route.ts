import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getNearbyCustomers, getNearbyLeads } from '@/lib/geocoding';
import prisma from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const latStr = searchParams.get('lat');
    const lngStr = searchParams.get('lng');
    const radiusStr = searchParams.get('radius');

    if (!latStr || !lngStr) {
      return NextResponse.json({ error: 'Latitude (lat) e Longitude (lng) são obrigatórias.' }, { status: 400 });
    }

    const lat = parseFloat(latStr);
    const lng = parseFloat(lngStr);

    // Carregar raio padrão das configurações do sistema se não fornecido
    let radiusKm = 5;
    if (radiusStr) {
      radiusKm = parseFloat(radiusStr);
    } else {
      const settings = await prisma.systemSettings.findFirst();
      if (settings) {
        radiusKm = settings.nearbyRadiusKm;
      }
    }

    // Se o usuário for vendedor, filtrar leads pelo seu id de vendedor
    const sellerId = session.role === 'SELLER' ? session.sellerId : null;

    const [customers, leads] = await Promise.all([
      getNearbyCustomers(lat, lng, radiusKm),
      getNearbyLeads(lat, lng, radiusKm, sellerId),
    ]);

    return NextResponse.json({
      success: true,
      coordinates: { lat, lng },
      radiusKm,
      customers,
      leads,
    });
  } catch (error) {
    console.error('Error in nearby API:', error);
    return NextResponse.json({ error: 'Erro ao processar busca por proximidade.' }, { status: 500 });
  }
}
