import { describe, expect, it } from 'vitest';

import { buildOrderDocsRef, verifyOrderDocsRef } from '@/server/domain/order-link';
import { canAccessOrderDoc } from '@/server/services/doc-access';

const SECRET = 'x'.repeat(40);
const ID = '3f1c2b9e-1111-4a2b-9c3d-123456789abc';

describe('link de documentos do pedido', () => {
  it('ida e volta: o link devolve o id do pedido', () => {
    const ref = buildOrderDocsRef(ID, SECRET);
    expect(ref.startsWith(`${ID}.`)).toBe(true);
    expect(verifyOrderDocsRef(ref, SECRET)).toBe(ID);
  });

  it('é sempre o mesmo link para o mesmo pedido', () => {
    expect(buildOrderDocsRef(ID, SECRET)).toBe(buildOrderDocsRef(ID, SECRET));
  });

  it('recusa assinatura adulterada, de outro pedido ou de outro segredo', () => {
    const ref = buildOrderDocsRef(ID, SECRET);
    const sig = ref.split('.').pop()!;
    const outroId = '3f1c2b9e-2222-4a2b-9c3d-123456789abc';
    expect(verifyOrderDocsRef(`${outroId}.${sig}`, SECRET)).toBeNull();
    expect(verifyOrderDocsRef(ref.slice(0, -1) + (ref.endsWith('A') ? 'B' : 'A'), SECRET)).toBeNull();
    expect(verifyOrderDocsRef(ref, 'y'.repeat(40))).toBeNull();
  });

  it('recusa formatos inválidos', () => {
    for (const bad of ['', '.', 'abc', `${ID}.`, `.${'a'.repeat(24)}`, `../etc.${'a'.repeat(24)}`]) {
      expect(verifyOrderDocsRef(bad, SECRET)).toBeNull();
    }
  });
});

describe('acesso a documentos', () => {
  const order = { id: ID, sellerId: 'v1' };

  it('link público só abre documentos do próprio pedido', () => {
    expect(canAccessOrderDoc({ publicOrderId: ID }, order)).toBe(true);
    expect(canAccessOrderDoc({ publicOrderId: 'outro' }, order)).toBe(false);
  });

  it('vendedor só a própria carteira; gestão tudo', () => {
    const seller = { userId: 'u', role: 'SELLER', sellerId: 'v1' } as never;
    const other = { userId: 'u', role: 'SELLER', sellerId: 'v2' } as never;
    const admin = { userId: 'u', role: 'ADMIN', sellerId: null } as never;
    expect(canAccessOrderDoc(seller, order)).toBe(true);
    expect(canAccessOrderDoc(other, order)).toBe(false);
    expect(canAccessOrderDoc(admin, order)).toBe(true);
  });
});
