import React from 'react';
import { notFound } from 'next/navigation';
import prisma from '@/lib/db';
import { getSession } from '@/lib/auth';
import LeadDetailClient from './LeadDetailClient';

export const metadata = {
  title: 'Detalhes do Lead | Prigor Expansão',
};

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    notFound();
  }

  const { id } = await params;

  const lead = await prisma.lead.findUnique({
    where: { id },
    include: {
      seller: { select: { id: true, name: true } },
      region: { select: { id: true, name: true } },
      neighborhoodRel: { select: { id: true, name: true } },
      activities: {
        orderBy: { date: 'desc' },
        include: { seller: { select: { name: true } } },
      },
      meetings: {
        orderBy: { date: 'desc' },
      },
      samples: {
        orderBy: { date: 'desc' },
      },
    },
  });

  if (!lead) {
    notFound();
  }

  // Se o vendedor logado tentar acessar um lead que não pertence a ele, negar acesso
  if (session.role === 'SELLER' && lead.sellerId !== session.sellerId) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-red-800 max-w-md mx-auto mt-12">
        <h3 className="font-bold text-base">Acesso Negado</h3>
        <p className="mt-2 text-sm">Este lead pertence a outro vendedor ou está na fila de triagem.</p>
      </div>
    );
  }

  // Obter regiões e bairros ativos para caso o gestor/admin queira alterar o território do lead
  const regions = await prisma.region.findMany({ where: { active: true } });
  const neighborhoods = await prisma.neighborhood.findMany({ where: { active: true } });

  // Serializar dados para passar ao cliente
  const serializedLead = JSON.parse(JSON.stringify(lead));
  const serializedRegions = JSON.parse(JSON.stringify(regions));
  const serializedNeighborhoods = JSON.parse(JSON.stringify(neighborhoods));

  return (
    <LeadDetailClient
      initialLead={serializedLead}
      regions={serializedRegions}
      neighborhoods={serializedNeighborhoods}
      currentUserRole={session.role}
    />
  );
}
