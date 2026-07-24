import type { EnrichedListing, Listing, ListingFilters, SortState } from '../models/listing.model';

/** Mediana de una colección numérica. Devuelve 0 para colecciones vacías. */
export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const NO_LIFT_RE = /sin\s*ascensor/i;
const LIFT_RE = /ascensor/i;

const NO_EXTERIOR_RE = /\binterior\b/i;
const EXTERIOR_RE = /\bexterior\b/i;

const NO_TERRACE_RE = /sin\s*terraza/i;
const TERRACE_RE = /terraza|balc[oó]n/i;

const NO_POOL_RE = /sin\s*piscina/i;
const POOL_RE = /piscina/i;

const NUDA_PROPIEDAD_RE = /nuda\s*propiedad|nuda-propiedad|nudapropiedad/i;

export function detectLift(listing: Listing): boolean {
  const fullText = `${listing.floor} ${listing.address} ${listing.type} ${listing.url}`;
  if (NO_LIFT_RE.test(fullText)) return false;
  return LIFT_RE.test(fullText);
}

export function detectExterior(listing: Listing): boolean {
  const fullText = `${listing.floor} ${listing.address} ${listing.type} ${listing.url}`;
  if (NO_EXTERIOR_RE.test(listing.floor) && !EXTERIOR_RE.test(listing.floor)) return false;
  return EXTERIOR_RE.test(fullText);
}

export function detectTerrace(listing: Listing): boolean {
  const fullText = `${listing.floor} ${listing.address} ${listing.type} ${listing.url}`;
  if (NO_TERRACE_RE.test(fullText)) return false;
  return TERRACE_RE.test(fullText);
}

export function detectPool(listing: Listing): boolean {
  const fullText = `${listing.floor} ${listing.address} ${listing.type} ${listing.url}`;
  if (NO_POOL_RE.test(fullText)) return false;
  return POOL_RE.test(fullText);
}

export function isNudaPropiedad(listing: Listing): boolean {
  return (
    NUDA_PROPIEDAD_RE.test(listing.address) ||
    NUDA_PROPIEDAD_RE.test(listing.type) ||
    NUDA_PROPIEDAD_RE.test(listing.floor) ||
    NUDA_PROPIEDAD_RE.test(listing.url)
  );
}

function zoneKey(listing: Listing): string {
  return `${listing.zone} ${listing.operation}`;
}

/**
 * Añade métricas derivadas. La mediana de referencia se calcula por par
 * (zona, operación): comparar €/m² de venta con los de alquiler no tiene sentido,
 * y comparar Chamberí con Puerta del Ángel tampoco. Excluye inmuebles en nuda propiedad.
 */
export function enrich(rawListings: readonly Listing[]): EnrichedListing[] {
  const listings = rawListings.filter((l) => !isNudaPropiedad(l));
  const buckets = new Map<string, number[]>();

  for (const listing of listings) {
    if (listing.area <= 0) continue;
    const key = zoneKey(listing);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(listing.price / listing.area);
    else buckets.set(key, [listing.price / listing.area]);
  }

  const medians = new Map<string, number>();
  for (const [key, values] of buckets) medians.set(key, median(values));

  return listings.map((listing) => {
    const pricePerM2 = listing.area > 0 ? listing.price / listing.area : 0;
    const zoneMedian = medians.get(zoneKey(listing)) ?? 0;
    return {
      ...listing,
      pricePerM2,
      zoneMedian,
      deltaVsZone: zoneMedian > 0 ? (pricePerM2 / zoneMedian - 1) * 100 : 0,
      hasLift: detectLift(listing),
      isExterior: detectExterior(listing),
      hasTerrace: detectTerrace(listing),
      hasPool: detectPool(listing),
    };
  });
}

export interface FilterOptions {
  readonly favoritesSet?: ReadonlySet<string>;
  readonly dismissedSet?: ReadonlySet<string>;
}

export function applyFilters(
  listings: readonly EnrichedListing[],
  filters: ListingFilters,
  options: FilterOptions = {},
): EnrichedListing[] {
  const query = filters.query.trim().toLowerCase();
  const zones = new Set(filters.zones);
  const sources = new Set(filters.sources ?? []);
  const types = new Set(filters.types ?? []);
  const { favoritesSet = new Set(), dismissedSet = new Set() } = options;

  return listings.filter((listing) => {
    if (listing.operation !== filters.operation) return false;
    if (zones.size > 0 && !zones.has(listing.zone)) return false;
    if (sources.size > 0 && listing.source && !sources.has(listing.source)) return false;
    if (types.size > 0 && !types.has(listing.type)) return false;
    if (listing.rooms < filters.minRooms) return false;
    if (listing.area < filters.minArea) return false;
    if (filters.minPrice > 0 && listing.price < filters.minPrice) return false;
    if (filters.maxPrice > 0 && listing.price > filters.maxPrice) return false;
    if (filters.requireLift && !listing.hasLift) return false;
    if (filters.requireExterior && !listing.isExterior) return false;
    if (filters.requireTerrace && !listing.hasTerrace) return false;
    if (filters.requirePool && !listing.hasPool) return false;
    if (filters.onlyBelowMedian && listing.deltaVsZone >= 0) return false;
    if (filters.onlyFavorites && !favoritesSet.has(listing.id)) return false;
    if (filters.hideDismissed && dismissedSet.has(listing.id)) return false;
    if (query && !`${listing.address} ${listing.zone} ${listing.type}`.toLowerCase().includes(query)) return false;
    return true;
  });
}

const collator = new Intl.Collator('es', { sensitivity: 'base', numeric: true });

export function sortListings(
  listings: readonly EnrichedListing[],
  { key, direction }: SortState,
): EnrichedListing[] {
  return [...listings].sort((a, b) => {
    const left = a[key];
    const right = b[key];
    const result =
      typeof left === 'string' && typeof right === 'string'
        ? collator.compare(left, right)
        : Number(left) - Number(right);
    return result * direction;
  });
}

export interface ListingsSummary {
  readonly count: number;
  readonly medianPrice: number;
  readonly minPrice: number;
  readonly medianPricePerM2: number;
  readonly bargains: number;
}

/** Umbral (en %) a partir del cual consideramos que un anuncio está claramente por debajo de mercado. */
export const BARGAIN_THRESHOLD = -10;

export function summarize(listings: readonly EnrichedListing[]): ListingsSummary {
  if (listings.length === 0) {
    return { count: 0, medianPrice: 0, minPrice: 0, medianPricePerM2: 0, bargains: 0 };
  }
  const prices = listings.map((l) => l.price);
  return {
    count: listings.length,
    medianPrice: median(prices),
    minPrice: Math.min(...prices),
    medianPricePerM2: median(listings.map((l) => l.pricePerM2)),
    bargains: listings.filter((l) => l.deltaVsZone < BARGAIN_THRESHOLD).length,
  };
}

export function exportToCsv(listings: readonly EnrichedListing[]): string {
  const headers = [
    'ID',
    'Operación',
    'Tipo',
    'Zona',
    'Dirección',
    'Precio (€)',
    'Habitaciones',
    'Superficie (m²)',
    '€/m²',
    'Mediana Zona (€/m²)',
    'vs. Zona (%)',
    'Ascensor',
    'Exterior',
    'Terraza',
    'Piscina',
    'Planta',
    'Fuente',
    'URL',
  ];

  const escapeCsv = (val: string | number | boolean | undefined) => {
    if (val === undefined || val === null) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const rows = listings.map((l) => [
    escapeCsv(l.id),
    escapeCsv(l.operation),
    escapeCsv(l.type),
    escapeCsv(l.zone),
    escapeCsv(l.address),
    escapeCsv(l.price),
    escapeCsv(l.rooms),
    escapeCsv(l.area),
    escapeCsv(Math.round(l.pricePerM2)),
    escapeCsv(Math.round(l.zoneMedian)),
    escapeCsv(l.deltaVsZone.toFixed(1)),
    escapeCsv(l.hasLift ? 'Sí' : 'No'),
    escapeCsv(l.isExterior ? 'Sí' : 'No'),
    escapeCsv(l.hasTerrace ? 'Sí' : 'No'),
    escapeCsv(l.hasPool ? 'Sí' : 'No'),
    escapeCsv(l.floor),
    escapeCsv(l.source ?? 'idealista'),
    escapeCsv(l.url),
  ]);

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}

export function exportToJson(listings: readonly EnrichedListing[]): string {
  return JSON.stringify(listings, null, 2);
}

