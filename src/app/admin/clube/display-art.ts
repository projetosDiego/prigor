/**
 * Arte do display de balcão do Clube Prigor (10 x 15 cm), aprovada pelo Igor em 23/11/2026.
 * Gera o HTML de impressão com o QR e o nome do ponto; a lista de prêmios vem do catálogo.
 */

export interface DisplayPrize {
  code: string;
  title: string;
  stockPerPoint: number | null;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);

/** Ícone e frase curta de cada prêmio conhecido; prêmio novo cai no padrão. */
const PRIZE_LOOK: Record<string, { icon: string; sub: string; order: number; star?: boolean }> = {
  brownie_gratis: { icon: '🍫', sub: 'retire no balcão', order: 1 },
  compre1leve2: { icon: '🎁', sub: 'o 2º brownie é por nossa conta', order: 2 },
  compre2leve3: { icon: '🎁', sub: 'o 3º brownie é por nossa conta', order: 3 },
  caneta: { icon: '🖊️', sub: 'edição exclusiva', order: 4 },
  copo_termico: { icon: '🥤', sub: 'unidades limitadas', order: 5 },
  bolsa_termica: { icon: '👜', sub: 'o prêmio mais desejado · unidades limitadas', order: 9, star: true },
};

const CSS = `
@page { size: 100mm 150mm; margin: 0; }
* { box-sizing: border-box; }
body { margin: 0; font-family: 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; }
.card { width: 100mm; height: 150mm; background: #24130F; color: #fff; position: relative; overflow: hidden; padding: 6mm 6mm 5mm; display: flex; flex-direction: column; align-items: center; }
.card::before { content: ''; position: absolute; inset: 0; background: radial-gradient(circle at 50% -10%, rgba(185,154,101,.35), transparent 55%); }
.card > * { position: relative; }
.logo { height: 15mm; }
.kicker { margin-top: 2mm; font-size: 7pt; letter-spacing: .35em; text-transform: uppercase; color: #B99A65; font-weight: 800; }
h1 { margin: 1mm 0 0; font-size: 22pt; line-height: 1; font-weight: 900; text-align: center; letter-spacing: -.02em; }
h1 span { color: #E8C99A; }
.sub { margin-top: 1.5mm; font-size: 8.5pt; color: #F3E9D8; text-align: center; }
.prizes { margin-top: 3.5mm; width: 100%; display: grid; grid-template-columns: 1fr 1fr; gap: 1.6mm; }
.prize { background: rgba(243,233,216,.08); border: .3mm solid rgba(185,154,101,.35); border-radius: 2.5mm; padding: 1.6mm 2mm; display: flex; align-items: center; gap: 1.8mm; }
.prize .ic { font-size: 12pt; line-height: 1; }
.prize b { display: block; font-size: 7.3pt; line-height: 1.1; color: #fff; }
.prize small { display: block; font-size: 5.6pt; color: #D9C6A5; margin-top: .3mm; }
.prize.star { grid-column: span 2; background: linear-gradient(90deg, rgba(232,201,154,.25), rgba(232,201,154,.08)); border-color: #E8C99A; justify-content: center; }
.qrwrap { margin-top: 3.5mm; display: flex; align-items: center; gap: 3.5mm; width: 100%; }
.qr { background: #fff; border-radius: 3mm; padding: 2.2mm; width: 34mm; height: 34mm; flex-shrink: 0; }
.qr svg { width: 100%; height: 100%; display: block; }
.steps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 1.6mm; }
.steps li { display: flex; align-items: center; gap: 1.8mm; font-size: 7.6pt; line-height: 1.15; }
.steps .n { width: 5mm; height: 5mm; border-radius: 50%; background: #E8C99A; color: #24130F; font-weight: 900; font-size: 7pt; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.cta { margin-top: auto; text-align: center; }
.cta .big { font-size: 9pt; font-weight: 900; color: #E8C99A; }
.foot { margin-top: 1mm; font-size: 5.3pt; color: #B99A65; text-align: center; line-height: 1.35; }
.point { margin-top: 1.2mm; display: inline-block; font-size: 6pt; font-weight: 700; color: #F3E9D8; border: .3mm solid rgba(243,233,216,.3); border-radius: 10mm; padding: .6mm 2.5mm; }
`;

export function buildDisplayHtml(opts: { pointName: string; qrSvg: string; logoUrl: string; prizes: DisplayPrize[] }): string {
  const prizes = [...opts.prizes]
    .map((p) => ({ p, look: PRIZE_LOOK[p.code] ?? { icon: '🎉', sub: p.stockPerPoint !== null ? 'unidades limitadas' : 'retire no balcão', order: 8 } }))
    .sort((a, b) => a.look.order - b.look.order);
  // Destaque ocupa a linha inteira; se a contagem dos demais for ímpar, o último também ocupa.
  const normal = prizes.filter((x) => !x.look.star);
  const items = prizes
    .map(({ p, look }) => {
      const wide = look.star || (normal.length % 2 === 1 && normal[normal.length - 1]?.p === p);
      return `<div class="prize${look.star ? ' star' : ''}"${wide && !look.star ? ' style="grid-column: span 2; justify-content: center"' : ''}><span class="ic">${look.icon}</span><div><b>${esc(p.title)}</b><small>${esc(look.sub)}</small></div></div>`;
    })
    .join('\n    ');

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Display Clube Prigor - ${esc(opts.pointName)}</title>
<style>${CSS}
.card { -webkit-print-color-adjust: exact; print-color-adjust: exact; }</style></head><body><div class="card">
  <img class="logo" src="${opts.logoUrl}" alt="Doces Prigor">
  <div class="kicker">Clube Prigor</div>
  <h1>Escaneie e<br><span>ganhe um prêmio</span></h1>
  <div class="sub">Cadastre-se grátis em 1 minuto. Todo mundo ganha!</div>
  <div class="prizes">
    ${items}
  </div>
  <div class="qrwrap">
    <div class="qr">${opts.qrSvg}</div>
    <ol class="steps">
      <li><span class="n">1</span>Aponte a câmera do celular para o código</li>
      <li><span class="n">2</span>Cadastre-se e descubra seu prêmio</li>
      <li><span class="n">3</span>Mostre a tela verde aqui no balcão</li>
    </ol>
  </div>
  <div class="cta">
    <div class="big">E ainda junta pontos para ganhar mais brownies!</div>
    <div class="point">📍 ${esc(opts.pointName)}</div>
    <div class="foot">Um prêmio por pessoa (por celular). Brindes sujeitos à disponibilidade neste ponto.<br>Área do cliente: app.docesprigor.com.br/clube</div>
  </div>
</div><script>window.onload = () => setTimeout(() => window.print(), 400);</script></body></html>`;
}
