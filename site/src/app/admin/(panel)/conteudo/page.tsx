import type { Metadata } from 'next';
import Image from 'next/image';

import { Card, Field, PageTitle, TextArea } from '@/components/admin/fields';
import { ActionForm, SubmitButton } from '@/components/admin/ui';
import { getSettings } from '@/lib/settings';
import { saveContentAction } from '../../actions';

export const metadata: Metadata = { title: 'Conteúdo' };

export default async function ContentPage() {
  const { content } = await getSettings();
  const steps = [...content.resellerSteps, { title: '', text: '' }, { title: '', text: '' }];
  const faq = [...content.resellerFaq, { question: '', answer: '' }, { question: '', answer: '' }];

  return (
    <>
      <PageTitle title="Conteúdo" description="Textos e banner do site. Para remover um passo ou pergunta, apague o título." />

      <ActionForm action={saveContentAction} className="grid max-w-4xl gap-6">
        <Card title="Home — primeira tela">
          <Field label="Assinatura (acima do título)" name="heroEyebrow" defaultValue={content.heroEyebrow} />
          <Field label="Título" name="heroTitle" defaultValue={content.heroTitle} hint="A palavra “felicidade” aparece em destaque dourado." />
          <TextArea label="Texto secundário" name="heroSubtitle" defaultValue={content.heroSubtitle} rows={3} />
          <div className="grid gap-5 md:grid-cols-[140px_1fr]">
            <div className="relative aspect-[4/5] overflow-hidden rounded-xl bg-cocoa">
              {content.heroImage && <Image src={content.heroImage} alt="" fill sizes="140px" className="object-contain" />}
            </div>
            <div className="grid content-start gap-4">
              <div>
                <label htmlFor="f-heroImageFile" className="label">Trocar foto da primeira tela</label>
                <input id="f-heroImageFile" name="heroImageFile" type="file" accept="image/*" className="block w-full text-sm file:mr-4 file:rounded-full file:border-0 file:bg-cocoa file:px-4 file:py-2 file:text-sm file:font-semibold file:text-cream" />
                <p className="mt-1.5 text-xs text-muted">
                  A foto padrão é um recorte do brownie sobre fundo escuro. Uma foto enviada aqui aparece em moldura (prefira vertical, com o produto bem visível).
                </p>
              </div>
              <Field label="ou caminho da imagem" name="heroImage" defaultValue={content.heroImage} />
            </div>
          </div>
        </Card>

        <Card title="Home — seções">
          <Field label="Universo — título" name="universeTitle" defaultValue={content.universeTitle} />
          <TextArea label="Universo — texto" name="universeText" defaultValue={content.universeText} rows={4} />
          <div className="grid gap-4 md:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="grid content-start gap-2">
                <Field label={`Universo — destaque ${i + 1}`} name="pillarTitle" defaultValue={content.universePillars[i]?.title ?? ''} />
                <TextArea label="Texto" name="pillarText" defaultValue={content.universePillars[i]?.text ?? ''} rows={3} />
              </div>
            ))}
          </div>
          <Field label="Produtos — título" name="productsTitle" defaultValue={content.productsTitle} />
          <TextArea label="Produtos — texto" name="productsText" defaultValue={content.productsText} rows={2} />
          <Field label="Experiência sensorial — frase 1" name="desireTitle" defaultValue={content.desireTitle} />
          <TextArea label="Experiência sensorial — texto de apoio" name="desireText" defaultValue={content.desireText} rows={2} />
          <Field label="Experiência sensorial — frase 2" name="sensoryPhrase2" defaultValue={content.sensoryPhrase2} />
          <Field label="Experiência sensorial — frase 3" name="sensoryPhrase3" defaultValue={content.sensoryPhrase3} />
          <Field label="Nossa história (chamada na home) — título" name="brandTitle" defaultValue={content.brandTitle} />
          <TextArea label="Nossa história (chamada na home) — texto" name="brandText" defaultValue={content.brandText} rows={3} />
        </Card>

        <Card title="Nossa história" description="Conte a história real da marca. Cada parágrafo vira um capítulo da página (o começo, o caminho, hoje). Não publique datas ou números que não sejam reais.">
          <Field label="Título" name="aboutTitle" defaultValue={content.aboutTitle} />
          <TextArea label="Abertura" name="aboutLead" defaultValue={content.aboutLead} rows={2} />
          <TextArea label="História" name="aboutParagraphs" defaultValue={content.aboutParagraphs.join('\n\n')} rows={10} hint="Separe os parágrafos com uma linha em branco." />
          <Field label="Próximo capítulo — título" name="storyNextTitle" defaultValue={content.storyNextTitle} />
          <TextArea label="Próximo capítulo — texto" name="storyNextText" defaultValue={content.storyNextText} rows={4} />
          <Field label="Frase antes da assinatura" name="storyClosing" defaultValue={content.storyClosing} />
        </Card>

        <Card title="Onde encontrar">
          <Field label="Título" name="findTitle" defaultValue={content.findTitle} />
          <TextArea label="Texto" name="findLead" defaultValue={content.findLead} rows={2} />
        </Card>

        <Card title="Seja um revendedor" description="Não publique margem, faturamento ou pedido mínimo sem definição comercial.">
          <Field label="Título" name="resellerTitle" defaultValue={content.resellerTitle} />
          <TextArea label="Texto de abertura" name="resellerLead" defaultValue={content.resellerLead} rows={3} />
          <div>
            <p className="label">Como funciona — passos</p>
            <div className="grid gap-3">
              {steps.map((s, i) => (
                <div key={i} className="grid gap-2 rounded-xl border border-line p-3 md:grid-cols-[1fr_2fr]">
                  <input name="stepTitle" defaultValue={s.title} placeholder={`Passo ${i + 1} — título`} className="field !min-h-11" aria-label={`Título do passo ${i + 1}`} />
                  <input name="stepText" defaultValue={s.text} placeholder="Descrição" className="field !min-h-11" aria-label={`Descrição do passo ${i + 1}`} />
                </div>
              ))}
            </div>
          </div>
          <TextArea label="Condições comerciais (opcional)" name="resellerConditions" defaultValue={content.resellerConditions} rows={4} hint="Se preenchido, aparece abaixo dos passos. Deixe vazio enquanto as condições não estiverem definidas." />
          <div>
            <p className="label">Perguntas frequentes</p>
            <div className="grid gap-3">
              {faq.map((f, i) => (
                <div key={i} className="grid gap-2 rounded-xl border border-line p-3">
                  <input name="faqQuestion" defaultValue={f.question} placeholder="Pergunta" className="field !min-h-11" aria-label={`Pergunta ${i + 1}`} />
                  <textarea name="faqAnswer" defaultValue={f.answer} placeholder="Resposta" rows={2} className="field resize-y" aria-label={`Resposta ${i + 1}`} />
                </div>
              ))}
            </div>
          </div>
        </Card>

        <div>
          <SubmitButton>Publicar conteúdo</SubmitButton>
        </div>
      </ActionForm>
    </>
  );
}
