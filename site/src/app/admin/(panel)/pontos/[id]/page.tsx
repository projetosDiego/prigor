import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Trash2 } from 'lucide-react';

import { Card, Field, PageTitle, TextArea, Toggle } from '@/components/admin/fields';
import { ActionForm, ConfirmButton, SubmitButton } from '@/components/admin/ui';
import { db } from '@/lib/db';
import { deletePointAction, savePointAction } from '../../../actions';

export const metadata: Metadata = { title: 'Ponto de venda' };

export default async function PointEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const isNew = id === 'novo';
  const point = isNew ? null : await db.pointOfSale.findUnique({ where: { id } });
  if (!isNew && !point) notFound();

  return (
    <>
      <Link href="/admin/pontos" className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-muted hover:text-cocoa">
        <ArrowLeft size={15} /> Pontos de venda
      </Link>
      <PageTitle title={point?.name ?? 'Novo ponto de venda'}>
        {point?.active && (
          <Link href={`/pontos-de-venda/${point.slug}`} target="_blank" className="btn btn-outline !min-h-10 !px-4 !text-[0.7rem]">
            Ver no site
          </Link>
        )}
      </PageTitle>

      <ActionForm action={savePointAction} className="grid max-w-4xl gap-6">
        <input type="hidden" name="id" value={point?.id ?? ''} />

        <Card title="Estabelecimento">
          <Field label="Nome do estabelecimento" name="name" defaultValue={point?.name} required />
          <div className="grid gap-5 md:grid-cols-[2fr_1fr]">
            <Field label="Endereço (rua e número)" name="address" defaultValue={point?.address} required />
            <Field label="CEP" name="zipCode" defaultValue={point?.zipCode} />
          </div>
          <div className="grid gap-5 md:grid-cols-[1.5fr_1.5fr_0.6fr]">
            <Field label="Bairro" name="neighborhood" defaultValue={point?.neighborhood} />
            <Field label="Cidade" name="city" defaultValue={point?.city ?? 'Rio de Janeiro'} required />
            <Field label="UF" name="state" defaultValue={point?.state ?? 'RJ'} />
          </div>
          <TextArea label="Horário de funcionamento" name="hours" defaultValue={point?.hours} rows={2} placeholder="Seg a sáb, 8h às 20h" />
        </Card>

        <Card title="Contato">
          <div className="grid gap-5 md:grid-cols-3">
            <Field label="Telefone" name="phone" defaultValue={point?.phone} />
            <Field label="WhatsApp" name="whatsapp" defaultValue={point?.whatsapp} hint="Só se o estabelecimento autorizar." />
            <Field label="Instagram" name="instagram" defaultValue={point?.instagram} placeholder="@estabelecimento" />
          </div>
        </Card>

        <Card title="Localização" description="Se deixar latitude/longitude em branco, o sistema tenta localizar pelo endereço (ou pelo link do Google Maps).">
          <Field label="Link do Google Maps" name="mapUrl" defaultValue={point?.mapUrl} placeholder="https://maps.google.com/…" />
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="Latitude" name="latitude" defaultValue={point?.latitude ?? ''} placeholder="-22.9068" />
            <Field label="Longitude" name="longitude" defaultValue={point?.longitude ?? ''} placeholder="-43.1729" />
          </div>
        </Card>

        <Card title="Status e observações">
          <Toggle label="Ativo" name="active" defaultChecked={point?.active ?? true} hint="Aparece em Onde Encontrar." />
          <TextArea label="Observações internas" name="notes" defaultValue={point?.notes} rows={3} hint="Não aparecem no site." />
        </Card>

        <div>
          <SubmitButton>Salvar e publicar</SubmitButton>
        </div>
      </ActionForm>

      {point && (
        <form action={deletePointAction} className="mt-10 max-w-4xl border-t border-line pt-6">
          <input type="hidden" name="id" value={point.id} />
          <ConfirmButton message={`Excluir "${point.name}"? Para apenas esconder do site, desative.`} className="inline-flex items-center gap-2 text-sm font-semibold text-red-700 hover:underline">
            <Trash2 size={15} /> Excluir ponto de venda
          </ConfirmButton>
        </form>
      )}
    </>
  );
}
