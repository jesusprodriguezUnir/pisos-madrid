import type { Operation } from '../../src/app/core/models/listing.model';

export interface ZoneConfig {
  /** Nombre legible que se persiste en el dataset y en el nombre del fichero de salida. */
  readonly name: string;
  /** Slug estable (kebab-case) usado como nombre de fichero: `public/data/districts/{slug}.json`. */
  readonly slug: string;
  /** Segmento de URL de idealista, sin barras iniciales ni finales. */
  readonly idealista: string;
  /** Segmento de URL de fotocasa bajo `madrid-capital/`, sin barras iniciales ni finales. */
  readonly fotocasa: string;
}

/**
 * Distritos y barrios cercanos a Argüelles. Ojo con los slugs: no coinciden
 * con la nomenclatura oficial del Ayuntamiento ni son iguales entre portales.
 * Verificar con `npm run scrape` ante cualquier 404 o página vacía.
 */
export const ZONES: readonly ZoneConfig[] = [
  { name: 'Argüelles', slug: 'arguelles', idealista: 'madrid/moncloa/arguelles', fotocasa: 'arguelles' },
  {
    name: 'Ciudad Universitaria',
    slug: 'ciudad-universitaria',
    idealista: 'madrid/moncloa/ciudad-universitaria',
    fotocasa: 'ciudad-universitaria',
  },
  {
    name: 'Casa de Campo',
    slug: 'casa-de-campo',
    idealista: 'madrid/moncloa/casa-de-campo',
    fotocasa: 'casa-de-campo',
  },
  {
    name: 'Puerta del Ángel',
    slug: 'puerta-del-angel',
    idealista: 'madrid/latina/puerta-del-angel',
    fotocasa: 'puerta-del-angel',
  },
  {
    name: 'Embajadores',
    slug: 'embajadores',
    idealista: 'madrid/centro/lavapies-embajadores',
    fotocasa: 'embajadores-lavapies',
  },
  { name: 'Tetuán', slug: 'tetuan', idealista: 'madrid/tetuan', fotocasa: 'tetuan' },
  { name: 'Gaztambide', slug: 'gaztambide', idealista: 'madrid/chamberi/gaztambide', fotocasa: 'gaztambide' },
  { name: 'Arapiles', slug: 'arapiles', idealista: 'madrid/chamberi/arapiles', fotocasa: 'arapiles' },
  { name: 'Trafalgar', slug: 'trafalgar', idealista: 'madrid/chamberi/trafalgar', fotocasa: 'trafalgar' },
  { name: 'Almagro', slug: 'almagro', idealista: 'madrid/chamberi/almagro', fotocasa: 'almagro' },
  {
    name: 'Vallehermoso',
    slug: 'vallehermoso',
    idealista: 'madrid/chamberi/vallehermoso',
    fotocasa: 'vallehermoso',
  },
  { name: 'Ríos Rosas', slug: 'rios-rosas', idealista: 'madrid/chamberi/rios-rosas', fotocasa: 'rios-rosas' },
  { name: 'Arganzuela', slug: 'arganzuela', idealista: 'madrid/arganzuela', fotocasa: 'arganzuela' },
  { name: 'Imperial', slug: 'imperial', idealista: 'madrid/arganzuela/imperial', fotocasa: 'imperial' },
  { name: 'Palacio', slug: 'palacio', idealista: 'madrid/centro/palacio', fotocasa: 'palacio' },
  {
    name: 'Malasaña',
    slug: 'malasana',
    // El slug `universidad` redirige a la home de idealista (barrio inexistente);
    // el segmento válido es `malasana-universidad`. Verificado 2026-07-22.
    idealista: 'madrid/centro/malasana-universidad',
    fotocasa: 'universidad-malasana',
  },
];

export interface OperationConfig {
  readonly segment: string;
  readonly maxPrice: number;
}

export const OPERATIONS: Readonly<Record<Operation, OperationConfig>> = {
  venta: { segment: 'venta-viviendas', maxPrice: 550_000 },
  alquiler: { segment: 'alquiler-viviendas', maxPrice: 1_800 },
};

/** Segmento fotocasa por operación: comprar/alquiler, sección viviendas. */
export const FOTOCASA_OPERATIONS: Readonly<Record<Operation, string>> = {
  venta: 'comprar',
  alquiler: 'alquiler',
};

export const CRITERIA = {
  minArea: 60,
  minRooms: 2,
  /** Páginas de resultados por combinación zona × operación (30 anuncios cada una). */
  maxPages: 3,
  /** Pausa entre peticiones, en ms. Bajarla es la vía rápida a un baneo. */
  delayMs: 2_500,
} as const;

export const IDEALISTA_BASE_URL = 'https://www.idealista.com';
export const FOTOCASA_BASE_URL = 'https://www.fotocasa.es';

/** Directorio de salida: un JSON por distrito, más un índice para que la app sepa qué ficheros cargar. */
export const OUTPUT_DIR = 'public/data/districts';
export const OUTPUT_INDEX_PATH = `${OUTPUT_DIR}/index.json`;

const ROOM_FILTERS = [
  'de-dos-dormitorios',
  'de-tres-dormitorios',
  'de-cuatro-cinco-habitaciones-o-mas',
].join(',');

export function buildIdealistaUrl(zone: ZoneConfig, operation: Operation, page: number): string {
  const { segment, maxPrice } = OPERATIONS[operation];
  const filters = [
    `con-precio-hasta_${maxPrice}`,
    `metros-cuadrados-mas-de_${CRITERIA.minArea}`,
    ROOM_FILTERS,
  ].join(',');
  const suffix = page > 1 ? `pagina-${page}.htm` : '';
  return `${IDEALISTA_BASE_URL}/${segment}/${zone.idealista}/${filters}/${suffix}`;
}

/**
 * fotocasa no expone los mismos filtros de precio/habitaciones/metros por URL
 * de forma fiable, así que se pide la lista sin filtrar y se aplican los
 * mismos mínimos que en idealista al parsear (ver `fotocasa-parser.ts`).
 */
export function buildFotocasaUrl(zone: ZoneConfig, operation: Operation, page: number): string {
  const suffix = page > 1 ? `/${page}` : '';
  return `${FOTOCASA_BASE_URL}/es/${FOTOCASA_OPERATIONS[operation]}/viviendas/madrid-capital/${zone.fotocasa}/l${suffix}`;
}
