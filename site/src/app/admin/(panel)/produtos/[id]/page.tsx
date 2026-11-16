import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Trash2 } from 'lucide-react';

import { Card, Field, PageTitle, TextArea, Toggle } from '@/components/admin/fields';
import { ActionForm, ConfirmButton, SubmitButton } from '@/components/admin/ui';
import { db } from '@/lib/db';
import { parseList } from '@/lib/text';
import { deleteProductAction, saveProductAction } from '../../../actions';

export const metadata: Metadata = { title: 'Produto' };

export default async function ProductEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const isNew = id === 'novo';
  const product = isNew ? null : await db.product.findUnique({ where: { id } });
  if (!isNew && !product) notFound();

  const gallery = product ? parseList(product.gallery) : [];

  return (
    <>
      <Link href="/admin/produtos" className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-muted hover:text-cocoa">
        <ArrowLeft size={15} /> Produtos
      </Link>
      <PageTitle title={product?.name ?? 'Novo produto'}>
        {product?.active && (
          <Link href={`/produtos/${product.slug}`} target="_blank" className="btn btn-outline !min-h-10 !px-4 !text-[0.7rem]">
            Ver no site
          </Link>
        )}
      </PageTitle>

      <ActionForm action={saveProductAction} className="grid max-w-4xl gap-6">
        <input type="hidden" name="id" value={product?.id ?? ''} />

        <Card title="Informações" description="Não publique preços, pesos ou ingredientes que não tenham sido confirmados.">
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="Nome" name="name" defaultValue={product?.name} required />
            <Field label="Categoria" name="category" defaultValue={product?.category} placeholder="Brownies, Sobremesas, Doces…" hint="Produtos são agrupados por categoria." />
            <Field label="Tamanho" name="size" defaultValue={product?.size} placeholder="Ex.: 7 × 5 cm" hint="Deixe vazio se não quiser exibir." />
            <Field label="Endereço da página (slug)" name="slug" defaultValue={product?.slug} placeholder="gerado a partir do nome" hint="Aparece na URL: /produtos/slug" />
          </div>
          <Field label="Frase curta" name="tagline" defaultValue={product?.tagline} hint="Usada nos cards." />
          <TextArea label="Descrição" name="description" defaultValue={product?.description} rows={4} />
          <TextArea label="Sabores" name="flavors" defaultValue={product ? parseList(product.flavors).join('\n') : ''} rows={5} hint="Um sabor por linha." />
          <TextArea label="Informações complementares" name="extraInfo" defaultValue={product?.extraInfo} rows={3} hint="Opcional: conservação, validade, observações — só o que for confirmado." />
        </Card>

        <Card title="Fotos" description="Use fotografias reais do produto. Enviadas são convertidas para WebP automaticamente.">
          <div className="grid gap-5 md:grid-cols-[160px_1fr]">
            <div className="relative aspect-[4/5] overflow-hidden rounded-xl bg-sand">
              {product?.image && <Image src={product.image} alt="" fill sizes="160px" className="object-cover" />}
            </div>
            <div className="grid content-start gap-4">
              <div>
                <label htmlFor="f-imageFile" className="label">Foto principal — enviar nova</label>
                <input id="f-imageFile" name="imageFile" type="file" accept="image/*" className="block w-full text-sm file:mr-4 file:rounded-full file:border-0 file:bg-cocoa file:px-4 file:py-2 file:text-sm file:font-semibold file:text-cream" />
              </div>
              <Field label="ou caminho da imagem" name="image" defaultValue={product?.image} placeholder="/images/… ou /media/…" />
              <Field label="Texto alternativo (acessibilidade e SEO)" name="imageAlt" defaultValue={product?.imageAlt} placeholder="Descreva o que aparece na foto" />
            </div>
          </div>
          <TextArea label="Galeria — caminhos" name="gallery" defaultValue={gallery.join('\n')} rows={3} hint="Um caminho por linha. Apague uma linha para remover a foto." />
          <div>
            <label htmlFor="f-galleryFiles" className="label">Adicionar fotos à galeria</label>
            <input id="f-galleryFiles" name="galleryFiles" type="file" accept="image/*" multiple className="block w-full text-sm file:mr-4 file:rounded-full file:border-0 file:bg-cocoa file:px-4 file:py-2 file:text-sm file:font-semibold file:text-cream" />
          </div>
        </Card>

        <Card title="Exibição">
          <div className="grid gap-3 md:grid-cols-3">
            <Toggle label="Ativo" name="active" defaultChecked={product?.active ?? true} hint="Aparece no site." />
            <Toggle label="Destaque" name="featured" defaultChecked={product?.featured ?? false} hint="Prioridade na Home." />
            <Toggle label="Disponível para revenda" name="forResale" defaultChecked={product?.forResale ?? true} hint="Aparece em Quero Vender." />
          </div>
          <Field label="Ordem" name="order" type="number" defaultValue={product?.order ?? 0} hint="Menor aparece primeiro." className="max-w-40" />
        </Card>

        <div className="flex items-center justify-between gap-4">
          <SubmitButton>Salvar e publicar</SubmitButton>
        </div>
      </ActionForm>

      {product && (
        <form action={deleteProductAction} className="mt-10 max-w-4xl border-t border-line pt-6">
          <input type="hidden" name="id" value={product.id} />
          <ConfirmButton message={`Excluir "${product.name}"? Para apenas esconder, use "Ativo".`} className="inline-flex items-center gap-2 text-sm font-semibold text-red-700 hover:underline">
            <Trash2 size={15} /> Excluir produto
          </ConfirmButton>
        </form>
      )}
    </>
  );
}
