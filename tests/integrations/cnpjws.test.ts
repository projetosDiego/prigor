import { describe, expect, it } from 'vitest';

import { pickStateRegistration } from '@/server/integrations/cnpjws';

const body = (regs: unknown[], uf = 'RJ') => ({
  estabelecimento: { estado: { sigla: uf }, inscricoes_estaduais: regs },
});

describe('pickStateRegistration', () => {
  it('pega a IE ativa da UF do cliente', () => {
    const r = pickStateRegistration(
      body([
        { inscricao_estadual: '11.111.111', ativo: true, estado: { sigla: 'SP' } },
        { inscricao_estadual: '86.123.45-6', ativo: true, estado: { sigla: 'RJ' } },
      ]),
      'rj',
    );
    expect(r).toMatchObject({ ie: '86123456', indicator: '1', state: 'RJ' });
    expect(r.all).toHaveLength(2);
  });

  it('IE inativa não conta → não contribuinte', () => {
    expect(pickStateRegistration(body([{ inscricao_estadual: '86123456', ativo: false, estado: { sigla: 'RJ' } }]), 'RJ'))
      .toMatchObject({ ie: null, indicator: '9' });
  });

  it('sem inscrições → não contribuinte; sem UF informada usa a do estabelecimento', () => {
    expect(pickStateRegistration(body([]))).toMatchObject({ ie: null, indicator: '9', state: 'RJ' });
    expect(pickStateRegistration({})).toMatchObject({ ie: null, indicator: '9' });
  });
});
