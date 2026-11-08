'use client';

import { useEffect } from 'react';

/**
 * No celular, as tabelas do painel viram "cartões" (CSS em globals.css). Aqui só
 * copiamos o texto de cada cabeçalho para um `data-label` em cada célula, sem mexer
 * na estrutura que o React controla. Tabelas com `data-no-cards` ficam como estão.
 */
function labelTable(table: HTMLTableElement): void {
  if (table.hasAttribute('data-no-cards')) return;
  const headRow = table.tHead?.rows[0];
  const labels: string[] = [];
  if (headRow) {
    for (const th of Array.from(headRow.cells)) {
      const text = (th.textContent ?? '').replace(/\s+/g, ' ').trim();
      for (let i = 0; i < Math.max(1, th.colSpan); i++) labels.push(i === 0 ? text : '');
    }
  }
  if (table.dataset.rt !== '1') table.dataset.rt = '1';
  for (const body of Array.from(table.tBodies).concat(table.tFoot ? [table.tFoot] : [])) {
    for (const row of Array.from(body.rows)) {
      let col = 0;
      for (const cell of Array.from(row.cells)) {
        if (cell.colSpan > 1 && cell.colSpan >= labels.length - 1) {
          if (cell.getAttribute('data-label') !== null) cell.removeAttribute('data-label');
          if (!cell.classList.contains('rt-span')) cell.classList.add('rt-span');
        } else {
          const label = labels[col] ?? '';
          if (cell.getAttribute('data-label') !== label) cell.setAttribute('data-label', label);
          if (cell.classList.contains('rt-span')) cell.classList.remove('rt-span');
        }
        col += Math.max(1, cell.colSpan);
      }
    }
  }
}

export function ResponsiveTables() {
  useEffect(() => {
    let frame = 0;
    const run = () => {
      frame = 0;
      document.querySelectorAll<HTMLTableElement>('main table, [role="dialog"] table, .fixed table').forEach(labelTable);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(run);
    };
    schedule();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
  return null;
}
