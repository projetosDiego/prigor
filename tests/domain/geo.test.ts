import { describe, expect, it } from 'vitest';

import { boundingBox, distanceKm, nearestNeighborOrder, neighborhoodFromAddress } from '@/server/domain/geo';

const TIJUCA = { latitude: -22.9234, longitude: -43.2356 };
const MARACANA = { latitude: -22.9121, longitude: -43.2302 };

describe('distanceKm', () => {
  it('é zero no mesmo ponto', () => {
    expect(distanceKm(TIJUCA, TIJUCA)).toBe(0);
  });
  it('Tijuca → Maracanã fica perto de 1,4 km', () => {
    const d = distanceKm(TIJUCA, MARACANA);
    expect(d).toBeGreaterThan(1.2);
    expect(d).toBeLessThan(1.5);
  });
});

describe('boundingBox', () => {
  it('contém o círculo do raio pedido', () => {
    const box = boundingBox(TIJUCA, 1);
    const norte = { latitude: box.high.latitude, longitude: TIJUCA.longitude };
    const leste = { latitude: TIJUCA.latitude, longitude: box.high.longitude };
    expect(distanceKm(TIJUCA, norte)).toBeCloseTo(1, 1);
    expect(distanceKm(TIJUCA, leste)).toBeCloseTo(1, 1);
    expect(box.low.latitude).toBeLessThan(TIJUCA.latitude);
    expect(box.low.longitude).toBeLessThan(TIJUCA.longitude);
  });
  it('recusa raio zero ou negativo', () => {
    expect(() => boundingBox(TIJUCA, 0)).toThrow();
    expect(() => boundingBox(TIJUCA, -1)).toThrow();
  });
});

describe('neighborhoodFromAddress', () => {
  it('extrai o bairro do formato do Google', () => {
    expect(
      neighborhoodFromAddress('R. Conde de Bonfim, 123 - Tijuca, Rio de Janeiro - RJ, 20520-053, Brasil'),
    ).toBe('Tijuca');
    expect(
      neighborhoodFromAddress('Av. Maracanã, 987 - Loja B - Tijuca, Rio de Janeiro - RJ, 20511-000, Brasil'),
    ).toBe('Tijuca');
  });
  it('devolve null quando não há bairro', () => {
    expect(neighborhoodFromAddress('Rio de Janeiro - RJ, Brasil')).toBeNull();
    expect(neighborhoodFromAddress('Rua Sem Traço, 10, Rio de Janeiro')).toBeNull();
    expect(neighborhoodFromAddress('R. A, 10 - 2')).toBeNull();
    expect(neighborhoodFromAddress('R. A, 10 - 22, X')).toBeNull();
    expect(neighborhoodFromAddress('')).toBeNull();
    expect(neighborhoodFromAddress(null)).toBeNull();
  });
});

describe('nearestNeighborOrder', () => {
  it('visita sempre a parada mais próxima primeiro', () => {
    const a = { id: 'a', latitude: -22.9, longitude: -43.2 };
    const b = { id: 'b', latitude: -22.92, longitude: -43.23 };
    const c = { id: 'c', latitude: -22.95, longitude: -43.18 };
    const order = nearestNeighborOrder(TIJUCA, [a, c, b]).map((p) => p.id);
    expect(order[0]).toBe('b');
    expect(order).toHaveLength(3);
  });
  it('lista vazia devolve vazia', () => {
    expect(nearestNeighborOrder(TIJUCA, [])).toEqual([]);
  });
});
