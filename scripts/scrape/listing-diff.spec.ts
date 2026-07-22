import { describe, expect, it } from 'vitest';
import type { Listing } from '../../src/app/core/models/listing.model';
import { computeListingDiff, formatDiffReport } from './listing-diff';

function listing(overrides: Partial<Listing> = {}): Listing {
  return {
    id: '1',
    zone: 'Argüelles',
    operation: 'venta',
    type: 'Piso',
    address: 'Calle Ejemplo 1',
    price: 300_000,
    rooms: 3,
    area: 90,
    floor: '2ª planta exterior con ascensor',
    url: 'https://example.com/1',
    ...overrides,
  };
}

describe('computeListingDiff', () => {
  it('detecta altas: ids presentes ahora que no estaban antes', () => {
    const previous = [listing({ id: '1' })];
    const current = [listing({ id: '1' }), listing({ id: '2' })];

    const diff = computeListingDiff(previous, current);

    expect(diff.added.map((l) => l.id)).toEqual(['2']);
    expect(diff.removed).toEqual([]);
  });

  it('detecta bajas: ids que estaban antes y ya no aparecen', () => {
    const previous = [listing({ id: '1' }), listing({ id: '2' })];
    const current = [listing({ id: '1' })];

    const diff = computeListingDiff(previous, current);

    expect(diff.added).toEqual([]);
    expect(diff.removed.map((l) => l.id)).toEqual(['2']);
  });

  it('no reporta cambios si los snapshots son idénticos', () => {
    const snapshot = [listing({ id: '1' }), listing({ id: '2' })];

    const diff = computeListingDiff(snapshot, snapshot);

    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
  });
});

describe('formatDiffReport', () => {
  it('indica que no hubo cambios cuando todos los diffs están vacíos', () => {
    const report = formatDiffReport(
      new Map([['Argüelles', { added: [], removed: [] }]]),
    );

    expect(report).toContain('Total: 0 nuevos, 0 ya no disponibles.');
    expect(report).toContain('Sin cambios respecto al scrape anterior.');
  });

  it('incluye direcciones de altas y bajas agrupadas por zona', () => {
    const report = formatDiffReport(
      new Map([
        [
          'Argüelles',
          {
            added: [listing({ id: '2', address: 'Calle Nueva 5' })],
            removed: [listing({ id: '3', address: 'Calle Vieja 9' })],
          },
        ],
      ]),
    );

    expect(report).toContain('### Argüelles');
    expect(report).toContain('Calle Nueva 5');
    expect(report).toContain('Calle Vieja 9');
    expect(report).toContain('Total: 1 nuevos, 1 ya no disponibles.');
  });
});
