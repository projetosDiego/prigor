import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { ExternalLink } from 'lucide-react';

import { Card, Field, PageTitle, TextArea, Toggle } from '@/components/admin/fields';
import { ActionForm, SubmitButton } from '@/components/admin/ui';
import { NATAL_GROUPS } from '@/lib/natal/catalog';
import { getNatalSettings, natalCatalog } from '@/lib/natal/config';
import { saveNatalAction } from '../../order-actions';

export const metadata: Metadata = { title: 'Natal' };
export const dynamic = 'force-dynamic';

const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const money = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');
const br = (iso: string) => iso.split('-').reverse().slice(0, 2).join('/');

export default async function NatalAdminPage() {
  const s = await getNatalSettings();
  const catalog = natalCatalog(s);

  return (
    <>
      <PageTitle title="Cardápio de Natal" description="Preços, disponibilidade, datas de entrega e Pix do pedido pelo site.">
        <Link href="/natal2026" target="_blank" className="btn btn-outline !min-h-10 !px-4 !text-[0.7rem]">
          Ver página <ExternalLink size={14} />
        </Link>
      </PageTitle>

      <ActionForm action={saveNatalAction} className="grid gap-6">
        <Card title="Campanha">
          <div className="grid gap-3 md:grid-cols-2">
            <Toggle label="Mostrar o cardápio de Natal" name="active" defaultChecked={s.active} hint="Página /natal2026 e chamadas na Home." />
            <Toggle label="Aceitar pedidos pelo site" name="acceptingOrders" defaultChecked={s.acceptingOrders} hint="Desligue quando a produção lotar: o cardápio continua visível, sem botão de compra." />
          </div>
        </Card>

        <Card title="Datas" description="O cliente só consegue escolher datas dentro destas regras.">
          <div className="grid gap-5 md:grid-cols-3">
            <Field label="Primeira data de entrega" name="start" type="date" defaultValue={s.dates.start} />
            <Field label="Última data de entrega" name="end" type="date" defaultValue={s.dates.end} />
            <Field label="Antecedência mínima (dias)" name="leadDays" type="number" defaultValue={s.dates.leadDays} />
          </div>
          <fieldset>
            <legend className="label">Dias sem entrega</legend>
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.map((d, i) => (
                <label key={d} className="flex items-center gap-2 rounded-full border border-line bg-white px-3 py-2 text-sm">
                  <input type="checkbox" name="closedWeekdays" value={i} defaultChecked={s.dates.closedWeekdays.includes(i)} className="accent-[#24130f]" />
                  {d}
                </label>
              ))}
            </div>
          </fieldset>
          <Field label="Datas bloqueadas" name="blockedDates" defaultValue={s.dates.blockedDates.map(br).join(', ')} placeholder="ex.: 08/12, 15/12" hint="Separe por vírgula. Use para dias de produção cheia." />
        </Card>

        <Card title="Entrega e retirada">
          <TextArea label="Texto sobre a entrega" name="deliveryNote" defaultValue={s.deliveryNote} rows={3} />
          <TextArea label="Pontos de retirada" name="pickupPoints" defaultValue={s.pickupPoints.join('\n')} rows={3} hint="Um por linha. O endereço completo vai pelo WhatsApp na confirmação." />
        </Card>

        <Card title="Pagamento e desconto">
          <div className="grid gap-5 md:grid-cols-3">
            <Field label="Sinal (%)" name="depositPct" type="number" defaultValue={s.depositPct} />
            <Field label="Desconto por quantidade (%)" name="bulkPct" defaultValue={String(s.rules.bulkPct).replace('.', ',')} />
            <Field label="A partir de (unidades do mesmo produto)" name="bulkQty" type="number" defaultValue={s.rules.bulkQty} />
          </div>
          <div className="grid gap-5 md:grid-cols-[1.4fr_1fr_1fr]">
            <Field label="Chave Pix" name="pixKey" defaultValue={s.pix.key} placeholder="CNPJ, e-mail, celular ou chave aleatória" hint="Com a chave preenchida, o cliente recebe QR Code e Pix copia e cola com o valor exato." />
            <Field label="Nome do recebedor" name="pixName" defaultValue={s.pix.name} />
            <Field label="Cidade do recebedor" name="pixCity" defaultValue={s.pix.city} />
          </div>
        </Card>

        <Card title="Produtos e preços" description="Desmarque para tirar do cardápio. Preço em reais.">
          {NATAL_GROUPS.map((g) => (
            <div key={g.id}>
              <p className="mb-2 text-xs font-bold tracking-wider text-muted uppercase">{g.title}</p>
              <ul className="grid gap-2">
                {catalog
                  .filter((i) => i.groupId === g.id)
                  .map((i) => (
                    <li key={i.sku} className="flex items-center gap-3 rounded-xl border border-line bg-white p-3">
                      <div className="relative size-12 shrink-0 overflow-hidden rounded-lg bg-sand">
                        <Image src={i.image} alt="" fill sizes="48px" className="object-cover" />
                      </div>
                      <label className="flex min-w-0 flex-1 items-center gap-3">
                        <input type="checkbox" name={`active_${i.sku}`} defaultChecked={i.active} className="size-4 accent-[#24130f]" />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-cocoa">{i.name}</span>
                          <span className="block text-xs text-muted">{[i.detail, i.minQty ? `mín. ${i.minQty} un.` : '', i.sku].filter(Boolean).join(' · ')}</span>
                        </span>
                      </label>
                      <div className="flex items-center gap-1">
                        <span className="text-sm text-muted">R$</span>
                        <input name={`price_${i.sku}`} defaultValue={money(i.priceCents)} inputMode="decimal" className="field !min-h-10 !w-24 !px-3 text-right" aria-label={`Preço de ${i.name}`} />
                      </div>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </Card>

        <div>
          <SubmitButton>Salvar e publicar</SubmitButton>
        </div>
      </ActionForm>
    </>
  );
}
