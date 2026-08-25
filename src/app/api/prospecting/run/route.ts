import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { runProspectingEngine } from '@/lib/places';

// POST /api/prospecting/run - Run prospecting engine manually for a neighborhood/category
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || (session.role !== 'ADMIN' && session.role !== 'MANAGER')) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 });
    }

    const body = await request.json();
    const { neighborhoodId, category, limit } = body;

    if (!neighborhoodId || !category) {
      return NextResponse.json(
        { error: 'Bairro (neighborhoodId) e Categoria são campos obrigatórios.' },
        { status: 400 }
      );
    }

    const stats = await runProspectingEngine({
      neighborhoodId,
      category,
      manual: true,
      limit: limit ? parseInt(limit) : 5,
    });

    if (!stats.success) {
      return NextResponse.json(
        { error: 'Falha ao executar prospecção. Verifique logs do servidor.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Prospecção concluída com sucesso! Encontrados: ${stats.resultsFound}, Novos Leads: ${stats.newLeads}, Duplicados pulados: ${stats.duplicates}, Clientes atuais ignorados: ${stats.existingCustomers}.`,
      stats,
    });
  } catch (error: any) {
    console.error('Error running manual prospecting:', error);
    return NextResponse.json({ error: error.message || 'Erro interno ao rodar motor de prospecção.' }, { status: 500 });
  }
}
