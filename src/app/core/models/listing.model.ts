/**
 * Modelo de dominio. Deliberadamente libre de dependencias de Angular:
 * lo consume tanto la aplicación web como el scraper de Node.
 */

export type Operation = 'venta' | 'alquiler';

export type Source = 'idealista' | 'fotocasa';

/** Registro tal y como se persiste en `public/data/districts/{slug}.json`. */
export interface Listing {
  readonly id: string;
  readonly zone: string;
  readonly operation: Operation;
  /** Piso, Ático, Dúplex, Estudio... */
  readonly type: string;
  readonly address: string;
  /** Euros totales en venta; euros/mes en alquiler. */
  readonly price: number;
  readonly rooms: number;
  /** Superficie construida en m². */
  readonly area: number;
  /** Texto original del portal: "3ª planta exterior con ascensor". */
  readonly floor: string;
  readonly url: string;
  /** Portal de origen. Opcional por compatibilidad con datasets anteriores a la integración de Fotocasa. */
  readonly source?: Source;
}

/** Listing + métricas derivadas. Se calcula en cliente, nunca se persiste. */
export interface EnrichedListing extends Listing {
  readonly pricePerM2: number;
  /** Mediana de €/m² del par (zona, operación) al que pertenece. */
  readonly zoneMedian: number;
  /** Desviación porcentual respecto a `zoneMedian`. Negativo = por debajo. */
  readonly deltaVsZone: number;
  readonly hasLift: boolean;
  readonly isExterior: boolean;
}

/** Entrada de `public/data/districts/index.json`: qué ficheros de distrito existen. */
export interface DistrictIndexEntry {
  readonly name: string;
  readonly slug: string;
}

export interface ListingsDataset {
  readonly source: string;
  /** ISO 8601. */
  readonly scrapedAt: string;
  readonly total: number;
  readonly listings: readonly Listing[];
}

export interface ListingFilters {
  readonly operation: Operation;
  readonly zones: readonly string[];
  readonly minRooms: number;
  readonly minArea: number;
  readonly maxPrice: number;
  readonly query: string;
  readonly requireLift: boolean;
  readonly requireExterior: boolean;
  readonly onlyBelowMedian: boolean;
}

export type SortKey =
  'address' | 'zone' | 'rooms' | 'area' | 'price' | 'pricePerM2' | 'deltaVsZone';

export interface SortState {
  readonly key: SortKey;
  readonly direction: 1 | -1;
}

/** Techo de precio por operación, alineado con los criterios de búsqueda. */
export const PRICE_CEILING: Readonly<Record<Operation, number>> = {
  venta: 550_000,
  alquiler: 1_800,
};

export const PRICE_STEP: Readonly<Record<Operation, number>> = {
  venta: 5_000,
  alquiler: 25,
};
