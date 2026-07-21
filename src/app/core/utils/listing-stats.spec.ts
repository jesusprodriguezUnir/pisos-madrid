import { describe, expect, it } from 'vitest';
import type { EnrichedListing, Listing, ListingFilters } from '../models/listing.model';
import { applyFilters, enrich, median, sortListings, summarize } from './listing-stats';

function listing(overrides: Partial<Listing> = {}): Listing {
  return {
    id: '1',
    zone: 'Chamberí',
    operation: 'venta',
    type: 'Piso',
    address: 'Calle de Prueba, Trafalgar',
    price: 400_000,
    rooms: 2,
    area: 80,
    floor: '2ª planta exterior con ascensor',
    url: 'https://www.idealista.com/inmueble/1/',
    ...overrides,
  };
}

const baseFilters: ListingFilters = {
  operation: 'venta',
  zones: [],
  minRooms: 2,
  minArea: 60,
  maxPrice: 550_000,
  query: '',
  requireLift: false,
  requireExterior: false,
  onlyBelowMedian: false,
};

describe('median', () => {
  it('devuelve 0 para colecciones vacías', () => {
    expect(median([])).toBe(0);
  });

  it('devuelve el elemento central en longitud impar', () => {
    expect(median([5, 1, 3])).toBe(3);
  });

  it('promedia los dos centrales en longitud par', () => {
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it('no muta el array de entrada', () => {
    const input = [3, 1, 2];
    median(input);
    expect(input).toEqual([3, 1, 2]);
  });
});

describe('enrich', () => {
  it('calcula €/m² y desviación frente a la mediana de su zona y operación', () => {
    const [cheap, mid, expensive] = enrich([
      listing({ id: 'a', price: 200_000, area: 100 }), // 2.000 €/m²
      listing({ id: 'b', price: 300_000, area: 100 }), // 3.000 €/m² -> mediana
      listing({ id: 'c', price: 400_000, area: 100 }), // 4.000 €/m²
    ]);

    expect(mid.zoneMedian).toBe(3_000);
    expect(cheap.pricePerM2).toBe(2_000);
    expect(cheap.deltaVsZone).toBeCloseTo(-33.33, 1);
    expect(mid.deltaVsZone).toBe(0);
    expect(expensive.deltaVsZone).toBeCloseTo(33.33, 1);
  });

  it('aísla las medianas por operación: venta y alquiler no se mezclan', () => {
    const result = enrich([
      listing({ id: 'v1', operation: 'venta', price: 400_000, area: 80 }),
      listing({ id: 'v2', operation: 'venta', price: 600_000, area: 80 }),
      listing({ id: 'a1', operation: 'alquiler', price: 1_600, area: 80 }),
    ]);

    const rent = result.find((l) => l.id === 'a1')!;
    expect(rent.zoneMedian).toBe(20);
    expect(rent.deltaVsZone).toBe(0);
  });

  it('aísla las medianas por zona', () => {
    const result = enrich([
      listing({ id: 'ch', zone: 'Chamberí', price: 560_000, area: 80 }), // 7.000
      listing({ id: 'pa', zone: 'Puerta del Ángel', price: 320_000, area: 80 }), // 4.000
    ]);
    expect(result.find((l) => l.id === 'ch')!.deltaVsZone).toBe(0);
    expect(result.find((l) => l.id === 'pa')!.deltaVsZone).toBe(0);
  });

  it('no divide por cero cuando falta la superficie', () => {
    const [only] = enrich([listing({ area: 0 })]);
    expect(only.pricePerM2).toBe(0);
    expect(only.deltaVsZone).toBe(0);
    expect(Number.isNaN(only.deltaVsZone)).toBe(false);
  });

  it('deriva ascensor y exterior del texto de planta', () => {
    const [withLift, withoutLift] = enrich([
      listing({ id: 'a', floor: '3ª planta exterior con ascensor' }),
      listing({ id: 'b', floor: '4ª planta interior sin ascensor' }),
    ]);
    expect(withLift).toMatchObject({ hasLift: true, isExterior: true });
    expect(withoutLift).toMatchObject({ hasLift: false, isExterior: false });
  });
});

describe('applyFilters', () => {
  const data: EnrichedListing[] = enrich([
    listing({ id: 'a', zone: 'Chamberí', price: 500_000, area: 90, rooms: 3 }),
    listing({ id: 'b', zone: 'Embajadores', price: 300_000, area: 65, rooms: 2 }),
    listing({ id: 'c', zone: 'Embajadores', price: 540_000, area: 62, rooms: 2 }),
    listing({ id: 'r', zone: 'Chamberí', operation: 'alquiler', price: 1_500, area: 70 }),
  ]);

  it('filtra por operación', () => {
    expect(applyFilters(data, { ...baseFilters, operation: 'alquiler' }).map((l) => l.id)).toEqual([
      'r',
    ]);
  });

  it('trata la lista vacía de zonas como "todas"', () => {
    expect(applyFilters(data, baseFilters)).toHaveLength(3);
  });

  it('filtra por zonas seleccionadas', () => {
    const result = applyFilters(data, { ...baseFilters, zones: ['Embajadores'] });
    expect(result.map((l) => l.id)).toEqual(['b', 'c']);
  });

  it('aplica mínimos de habitaciones y superficie', () => {
    expect(applyFilters(data, { ...baseFilters, minRooms: 3 }).map((l) => l.id)).toEqual(['a']);
    expect(applyFilters(data, { ...baseFilters, minArea: 80 }).map((l) => l.id)).toEqual(['a']);
  });

  it('aplica techo de precio', () => {
    expect(applyFilters(data, { ...baseFilters, maxPrice: 400_000 }).map((l) => l.id)).toEqual([
      'b',
    ]);
  });

  it('busca por texto sin distinguir mayúsculas', () => {
    expect(applyFilters(data, { ...baseFilters, query: 'EMBAJADORES' })).toHaveLength(2);
    expect(applyFilters(data, { ...baseFilters, query: '  prueba  ' })).toHaveLength(3);
  });

  it('filtra los que están por debajo de la mediana de su zona', () => {
    const result = applyFilters(data, { ...baseFilters, onlyBelowMedian: true });
    expect(result.every((l) => l.deltaVsZone < 0)).toBe(true);
  });

  it('no devuelve nada si ningún anuncio cumple un requisito', () => {
    expect(applyFilters(data, { ...baseFilters, minRooms: 9 })).toEqual([]);
  });
});

describe('sortListings', () => {
  const data = enrich([
    listing({ id: 'a', address: 'Álava', price: 300_000 }),
    listing({ id: 'b', address: 'Bravo Murillo', price: 100_000 }),
    listing({ id: 'c', address: 'Cea Bermúdez', price: 200_000 }),
  ]);

  it('ordena numéricamente en ambos sentidos', () => {
    expect(sortListings(data, { key: 'price', direction: 1 }).map((l) => l.id)).toEqual([
      'b',
      'c',
      'a',
    ]);
    expect(sortListings(data, { key: 'price', direction: -1 }).map((l) => l.id)).toEqual([
      'a',
      'c',
      'b',
    ]);
  });

  it('ordena texto respetando la configuración regional española', () => {
    expect(sortListings(data, { key: 'address', direction: 1 }).map((l) => l.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('no muta la colección original', () => {
    const before = data.map((l) => l.id);
    sortListings(data, { key: 'price', direction: -1 });
    expect(data.map((l) => l.id)).toEqual(before);
  });
});

describe('summarize', () => {
  it('devuelve ceros para una colección vacía', () => {
    expect(summarize([])).toEqual({
      count: 0,
      medianPrice: 0,
      minPrice: 0,
      medianPricePerM2: 0,
      bargains: 0,
    });
  });

  it('agrega precio mediano, mínimo y chollos', () => {
    const data = enrich([
      listing({ id: 'a', price: 200_000, area: 100 }),
      listing({ id: 'b', price: 300_000, area: 100 }),
      listing({ id: 'c', price: 400_000, area: 100 }),
    ]);
    const summary = summarize(data);

    expect(summary.count).toBe(3);
    expect(summary.medianPrice).toBe(300_000);
    expect(summary.minPrice).toBe(200_000);
    expect(summary.medianPricePerM2).toBe(3_000);
    // sólo 'a' baja más de un 10% respecto a la mediana
    expect(summary.bargains).toBe(1);
  });
});
