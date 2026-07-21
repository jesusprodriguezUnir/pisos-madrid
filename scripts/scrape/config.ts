import type { Operation } from '../../src/app/core/models/listing.model';

export interface ZoneConfig {
  /** Nombre legible que se persiste en el dataset. */
  readonly name: string;
  /** Slug de idealista, sin barras iniciales ni finales. */
  readonly slug: string;
}

/**
 * Ojo con los slugs: no coinciden con la nomenclatura oficial del Ayuntamiento.
 * Casa de Campo cuelga de Moncloa (no de Latina) y Embajadores aparece como
 * "lavapies-embajadores". Verificar con `npm run scrape` ante cualquier 404.
 */
export const ZONES: readonly ZoneConfig[] = [
  { name: 'Chamberí', slug: 'madrid/chamberi' },
  { name: 'Argüelles', slug: 'madrid/moncloa/arguelles' },
  { name: 'Embajadores', slug: 'madrid/centro/lavapies-embajadores' },
  { name: 'Puerta del Ángel', slug: 'madrid/latina/puerta-del-angel' },
  { name: 'Casa de Campo', slug: 'madrid/moncloa/casa-de-campo' },
];

export interface OperationConfig {
  readonly segment: string;
  readonly maxPrice: number;
}

export const OPERATIONS: Readonly<Record<Operation, OperationConfig>> = {
  venta: { segment: 'venta-viviendas', maxPrice: 550_000 },
  alquiler: { segment: 'alquiler-viviendas', maxPrice: 1_800 },
};

export const CRITERIA = {
  minArea: 60,
  minRooms: 2,
  /** Páginas de resultados por combinación zona × operación (30 anuncios cada una). */
  maxPages: 3,
  /** Pausa entre peticiones, en ms. Bajarla es la vía rápida a un baneo. */
  delayMs: 2_500,
} as const;

export const BASE_URL = 'https://www.idealista.com';

export const OUTPUT_PATH = 'public/data/pisos.json';

const ROOM_FILTERS = [
  'de-dos-dormitorios',
  'de-tres-dormitorios',
  'de-cuatro-cinco-habitaciones-o-mas',
].join(',');

export function buildUrl(zone: ZoneConfig, operation: Operation, page: number): string {
  const { segment, maxPrice } = OPERATIONS[operation];
  const filters = [
    `con-precio-hasta_${maxPrice}`,
    `metros-cuadrados-mas-de_${CRITERIA.minArea}`,
    ROOM_FILTERS,
  ].join(',');
  const suffix = page > 1 ? `pagina-${page}.htm` : '';
  return `${BASE_URL}/${segment}/${zone.slug}/${filters}/${suffix}`;
}
