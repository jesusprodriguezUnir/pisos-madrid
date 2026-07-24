import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  PRICE_CEILING,
  PRICE_STEP,
  type Listing,
  type ListingFilters,
  type Operation,
  type SortKey,
  type SortState,
  type Source,
  type ViewMode,
} from '../../core/models/listing.model';
import { ListingsService } from '../../core/services/listings.service';
import { FavoritesService } from '../../core/services/favorites.service';
import {
  applyFilters,
  exportToCsv,
  exportToJson,
  median,
  sortListings,
  summarize,
} from '../../core/utils/listing-stats';

export interface MarketZoneStat {
  readonly zone: string;
  readonly ppm2: number;
  readonly min: number;
  readonly count: number;
}

export interface MapCell extends MarketZoneStat {
  readonly heat: number;
  readonly active: boolean;
}

export interface ThermoInfo {
  readonly pct: number;
  readonly color: 'good' | 'bad' | 'neutral';
  readonly label: string;
}

const DEFAULT_FILTERS: ListingFilters = {
  operation: 'venta',
  zones: [],
  minRooms: 2,
  minArea: 60,
  minPrice: 0,
  maxPrice: PRICE_CEILING.venta,
  query: '',
  sources: [],
  types: [],
  requireLift: false,
  requireExterior: false,
  onlyBelowMedian: false,
  onlyFavorites: false,
  hideDismissed: false,
};

const DEFAULT_NEW_LISTING = {
  url: '',
  source: 'idealista' as Source,
  zone: 'Argüelles',
  operation: 'venta' as Operation,
  type: 'Piso',
  address: '',
  price: null as number | null,
  rooms: 2 as number | null,
  area: 75 as number | null,
  floor: 'Planta 3ª exterior con ascensor',
  imageUrl: '',
};

@Component({
  selector: 'app-listings-page',
  imports: [FormsModule, DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './listings-page.html',
  styleUrl: './listings-page.css',
})
export class ListingsPage {
  private readonly service = inject(ListingsService);
  protected readonly favoritesService = inject(FavoritesService);

  protected readonly isLoading = this.service.isLoading;
  protected readonly error = this.service.error;
  protected readonly zones = this.service.zones;
  protected readonly propertyTypes = this.service.propertyTypes;

  protected readonly operations: readonly Operation[] = ['venta', 'alquiler'];
  protected readonly availableSources: readonly Source[] = ['idealista', 'fotocasa'];
  protected readonly roomOptions: readonly number[] = [2, 3, 4];
  protected readonly Math = Math;

  protected readonly filters = signal<ListingFilters>(this.loadFiltersFromUrl());
  protected readonly sort = signal<SortState>({ key: 'pricePerM2', direction: 1 });
  protected readonly viewMode = signal<ViewMode>('cards');

  // Estado del Modal de Añadir Inmueble
  protected readonly showAddModal = signal<boolean>(false);
  protected readonly isSaving = signal<boolean>(false);
  protected readonly addModalError = signal<string | null>(null);
  protected readonly newListing = signal({ ...DEFAULT_NEW_LISTING });

  // Paginación
  protected readonly pageSize = signal<number>(24);
  protected readonly pageIndex = signal<number>(0);

  protected readonly favoritesCount = computed(() => this.favoritesService.favorites().size);
  protected readonly dismissedCount = computed(() => this.favoritesService.dismissed().size);

  protected readonly rows = computed(() =>
    sortListings(
      applyFilters(this.service.listings(), this.filters(), {
        favoritesSet: this.favoritesService.favorites(),
        dismissedSet: this.favoritesService.dismissed(),
      }),
      this.sort(),
    ),
  );

  protected readonly summary = computed(() => summarize(this.rows()));

  // Vista "Chollos": ranking de las mejores oportunidades del conjunto filtrado (todas las zonas/páginas).
  protected readonly rankRows = computed(() =>
    [...this.rows()].sort((a, b) => a.deltaVsZone - b.deltaVsZone).slice(0, 12),
  );

  // KPIs del hero: recuentos globales (no afectados por filtros, solo por la operación activa).
  protected readonly heroKpis = computed(() => {
    const all = this.service.listings();
    const opAll = all.filter((l) => l.operation === this.filters().operation);
    const zonesWith = new Set(opAll.map((l) => l.zone));
    return [
      { value: all.length.toLocaleString('es-ES'), label: 'inmuebles' },
      { value: String(zonesWith.size), label: 'barrios' },
      {
        value: Math.round(median(opAll.map((l) => l.pricePerM2))).toLocaleString('es-ES'),
        label: '€/m² mediano',
      },
      { value: String(opAll.filter((l) => l.deltaVsZone <= -10).length), label: 'chollos' },
    ];
  });

  // Panorama de mercado: mediana de €/m² por barrio para la operación activa.
  private readonly marketByZone = computed<MarketZoneStat[]>(() => {
    const opAll = this.service.listings().filter((l) => l.operation === this.filters().operation);
    const byZone = new Map<string, typeof opAll>();
    for (const l of opAll) {
      const bucket = byZone.get(l.zone);
      if (bucket) bucket.push(l);
      else byZone.set(l.zone, [l]);
    }
    return [...byZone.entries()].map(([zone, listings]) => ({
      zone,
      ppm2: Math.round(median(listings.map((l) => l.pricePerM2))),
      min: Math.min(...listings.map((l) => l.price)),
      count: listings.length,
    }));
  });

  protected readonly marketRows = computed(() =>
    [...this.marketByZone()].sort((a, b) => b.ppm2 - a.ppm2),
  );

  protected readonly mapCells = computed<MapCell[]>(() => {
    const stats = this.marketByZone();
    const values = stats.map((s) => s.ppm2);
    const lo = Math.min(...values, 0);
    const hi = Math.max(...values, 0);
    const activeZones = new Set(this.filters().zones);
    return [...stats]
      .sort((a, b) => a.zone.localeCompare(b.zone, 'es'))
      .map((s) => ({
        ...s,
        heat: hi > lo ? (s.ppm2 - lo) / (hi - lo) : 0.5,
        active: activeZones.has(s.zone),
      }));
  });

  // Comparador: hasta 3 inmuebles lado a lado.
  protected readonly compareIds = signal<readonly string[]>([]);

  protected readonly compareRows = computed(() => {
    const byId = new Map(this.service.listings().map((l) => [l.id, l] as const));
    return this.compareIds()
      .map((id) => byId.get(id))
      .filter((l): l is NonNullable<typeof l> => l !== undefined);
  });

  protected readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.rows().length / this.pageSize())),
  );

  protected readonly paginatedRows = computed(() => {
    const start = this.pageIndex() * this.pageSize();
    return this.rows().slice(start, start + this.pageSize());
  });

  protected readonly priceCeiling = computed(() => PRICE_CEILING[this.filters().operation]);
  protected readonly priceStep = computed(() => PRICE_STEP[this.filters().operation]);
  protected readonly priceUnit = computed(() =>
    this.filters().operation === 'venta' ? '€' : '€/mes',
  );

  protected readonly activeFiltersCount = computed(() => {
    const f = this.filters();
    let count = 0;
    if (f.zones.length > 0) count++;
    if (f.sources.length > 0) count++;
    if (f.types.length > 0) count++;
    if (f.minRooms > 2) count++;
    if (f.minArea > 60) count++;
    if (f.minPrice > 0) count++;
    if (f.maxPrice < PRICE_CEILING[f.operation]) count++;
    if (f.query.trim()) count++;
    if (f.requireLift) count++;
    if (f.requireExterior) count++;
    if (f.onlyBelowMedian) count++;
    if (f.onlyFavorites) count++;
    if (f.hideDismissed) count++;
    return count;
  });

  constructor() {
    effect(() => {
      // Sync url & reset page index when filters change
      const currentFilters = this.filters();
      this.pageIndex.set(0);
      this.syncFiltersToUrl(currentFilters);
    });
  }

  protected setOperation(operation: Operation): void {
    this.filters.update((f) => ({
      ...f,
      operation,
      minPrice: 0,
      maxPrice: PRICE_CEILING[operation],
    }));
  }

  protected toggleZone(zone: string): void {
    this.filters.update((f) => ({
      ...f,
      zones: f.zones.includes(zone) ? f.zones.filter((z) => z !== zone) : [...f.zones, zone],
    }));
  }

  protected toggleSource(source: Source): void {
    this.filters.update((f) => ({
      ...f,
      sources: f.sources.includes(source)
        ? f.sources.filter((s) => s !== source)
        : [...f.sources, source],
    }));
  }

  protected toggleType(type: string): void {
    this.filters.update((f) => ({
      ...f,
      types: f.types.includes(type) ? f.types.filter((t) => t !== type) : [...f.types, type],
    }));
  }

  protected patch<K extends keyof ListingFilters>(key: K, value: ListingFilters[K]): void {
    this.filters.update((f) => ({ ...f, [key]: value }));
  }

  protected toggleFlag(
    key: 'requireLift' | 'requireExterior' | 'onlyBelowMedian' | 'onlyFavorites' | 'hideDismissed',
  ): void {
    this.filters.update((f) => ({ ...f, [key]: !f[key] }));
  }

  protected reset(): void {
    this.filters.set(DEFAULT_FILTERS);
    this.sort.set({ key: 'pricePerM2', direction: 1 });
  }

  protected sortBy(key: SortKey): void {
    this.sort.update((s) => ({
      key,
      direction: s.key === key ? ((s.direction * -1) as 1 | -1) : 1,
    }));
  }

  protected setViewMode(mode: ViewMode): void {
    this.viewMode.set(mode);
  }

  protected setPage(page: number): void {
    if (page >= 0 && page < this.totalPages()) {
      this.pageIndex.set(page);
    }
  }

  protected setPageSize(size: number): void {
    this.pageSize.set(size);
    this.pageIndex.set(0);
  }

  protected exportData(format: 'csv' | 'json'): void {
    const data = this.rows();
    const content = format === 'csv' ? exportToCsv(data) : exportToJson(data);
    const mime = format === 'csv' ? 'text/csv;charset=utf-8;' : 'application/json;charset=utf-8;';
    const filename = `pisos_madrid_${this.filters().operation}_${new Date().toISOString().slice(0, 10)}.${format}`;

    const blob = new Blob([content], { type: mime });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  protected deltaClass(delta: number): string {
    if (delta < -8) return 'delta-good';
    if (delta > 8) return 'delta-bad';
    return 'delta-neutral';
  }

  protected thermo(delta: number): ThermoInfo {
    const clamped = Math.max(-25, Math.min(25, delta));
    const pct = ((clamped + 25) / 50) * 100;
    const rounded = Math.round(delta);
    const label = rounded === 0 ? '0 %' : `${rounded > 0 ? '+' : '−'}${Math.abs(rounded)} %`;
    return {
      pct,
      color:
        this.deltaClass(delta) === 'delta-good'
          ? 'good'
          : this.deltaClass(delta) === 'delta-bad'
            ? 'bad'
            : 'neutral',
      label,
    };
  }

  protected toggleCompare(id: string): void {
    this.compareIds.update((current) =>
      current.includes(id)
        ? current.filter((x) => x !== id)
        : current.length >= 3
          ? current
          : [...current, id],
    );
  }

  protected clearCompare(): void {
    this.compareIds.set([]);
  }

  protected isComparing(id: string): boolean {
    return this.compareIds().includes(id);
  }

  protected compareExtras(listing: { hasLift: boolean; isExterior: boolean }): string {
    const extras = [listing.hasLift ? 'Ascensor' : '', listing.isExterior ? 'Exterior' : ''].filter(
      (extra) => extra !== '',
    );
    return extras.length > 0 ? extras.join(', ') : '—';
  }

  protected asNumber(value: string): number {
    return Number(value);
  }

  private loadFiltersFromUrl(): ListingFilters {
    if (typeof window === 'undefined') return DEFAULT_FILTERS;
    try {
      const params = new URLSearchParams(window.location.search);
      if ([...params.keys()].length === 0) return DEFAULT_FILTERS;

      const op = (params.get('operation') as Operation) || 'venta';
      const zones = params.get('zones') ? params.get('zones')!.split(',') : [];
      const minRooms = params.has('minRooms') ? Number(params.get('minRooms')) : 2;
      const minArea = params.has('minArea') ? Number(params.get('minArea')) : 60;
      const minPrice = params.has('minPrice') ? Number(params.get('minPrice')) : 0;
      const maxPrice = params.has('maxPrice') ? Number(params.get('maxPrice')) : PRICE_CEILING[op];
      const query = params.get('query') || '';
      const sources = params.get('sources') ? (params.get('sources')!.split(',') as Source[]) : [];
      const types = params.get('types') ? params.get('types')!.split(',') : [];
      const requireLift = params.get('requireLift') === 'true';
      const requireExterior = params.get('requireExterior') === 'true';
      const onlyBelowMedian = params.get('onlyBelowMedian') === 'true';
      const onlyFavorites = params.get('onlyFavorites') === 'true';
      const hideDismissed = params.get('hideDismissed') === 'true';

      return {
        operation: op,
        zones,
        minRooms,
        minArea,
        minPrice,
        maxPrice,
        query,
        sources,
        types,
        requireLift,
        requireExterior,
        onlyBelowMedian,
        onlyFavorites,
        hideDismissed,
      };
    } catch {
      return DEFAULT_FILTERS;
    }
  }

  private syncFiltersToUrl(filters: ListingFilters): void {
    if (typeof window === 'undefined') return;
    try {
      const params = new URLSearchParams();
      if (filters.operation !== 'venta') params.set('operation', filters.operation);
      if (filters.zones.length > 0) params.set('zones', filters.zones.join(','));
      if (filters.minRooms !== 2) params.set('minRooms', String(filters.minRooms));
      if (filters.minArea !== 60) params.set('minArea', String(filters.minArea));
      if (filters.minPrice > 0) params.set('minPrice', String(filters.minPrice));
      if (filters.maxPrice < PRICE_CEILING[filters.operation])
        params.set('maxPrice', String(filters.maxPrice));
      if (filters.query.trim()) params.set('query', filters.query.trim());
      if (filters.sources.length > 0) params.set('sources', filters.sources.join(','));
      if (filters.types.length > 0) params.set('types', filters.types.join(','));
      if (filters.requireLift) params.set('requireLift', 'true');
      if (filters.requireExterior) params.set('requireExterior', 'true');
      if (filters.onlyBelowMedian) params.set('onlyBelowMedian', 'true');
      if (filters.onlyFavorites) params.set('onlyFavorites', 'true');
      if (filters.hideDismissed) params.set('hideDismissed', 'true');

      const search = params.toString();
      const newUrl = search ? `${window.location.pathname}?${search}` : window.location.pathname;
      window.history.replaceState(null, '', newUrl);
    } catch {
      // Ignore
    }
  }

  protected openAddModal(): void {
    const activeZone = this.filters().zones[0] || this.zones()[0] || 'Argüelles';
    this.newListing.set({
      ...DEFAULT_NEW_LISTING,
      zone: activeZone,
      operation: this.filters().operation,
    });
    this.addModalError.set(null);
    this.showAddModal.set(true);
  }

  protected closeAddModal(): void {
    this.showAddModal.set(false);
    this.addModalError.set(null);
  }

  protected onUrlChange(url: string): void {
    this.newListing.update((form) => {
      let source = form.source;
      if (url.includes('fotocasa.es')) {
        source = 'fotocasa';
      } else if (url.includes('idealista.com')) {
        source = 'idealista';
      }
      return { ...form, url, source };
    });
  }

  protected updateNewListing<K extends keyof typeof DEFAULT_NEW_LISTING>(
    key: K,
    value: (typeof DEFAULT_NEW_LISTING)[K],
  ): void {
    this.newListing.update((form) => ({ ...form, [key]: value }));
  }

  protected async submitNewListing(): Promise<void> {
    const form = this.newListing();
    if (!form.address.trim() || !form.price || !form.area || !form.rooms) {
      this.addModalError.set(
        'Por favor, completa los campos obligatorios: dirección, precio, m² y habitaciones.',
      );
      return;
    }

    this.isSaving.set(true);
    this.addModalError.set(null);

    try {
      let id = '';
      if (form.url) {
        const idMatch = /\/(\d{6,12})/.exec(form.url);
        if (idMatch) id = idMatch[1];
      }
      if (!id) {
        id = `manual_${Date.now()}`;
      }

      const listing: Listing = {
        id,
        zone: form.zone,
        operation: form.operation,
        type: form.type || 'Piso',
        address: form.address.trim(),
        price: Number(form.price),
        rooms: Number(form.rooms),
        area: Number(form.area),
        floor: form.floor.trim(),
        url: form.url.trim() || `https://www.idealista.com/inmueble/${id}/`,
        source: form.source,
        ...(form.imageUrl.trim() ? { imageUrl: form.imageUrl.trim() } : {}),
      };

      await this.service.addListing(listing);
      this.closeAddModal();
    } catch (err: unknown) {
      this.addModalError.set(
        err instanceof Error ? err.message : 'Error al guardar el inmueble en la base de datos',
      );
    } finally {
      this.isSaving.set(false);
    }
  }

  protected onImageError(event: Event): void {
    const imgEl = event.target as HTMLImageElement;
    if (imgEl) {
      imgEl.style.display = 'none';
      const parent = imgEl.parentElement;
      if (parent && !parent.querySelector('.card-photo-label')) {
        const span = document.createElement('span');
        span.className = 'card-photo-label';
        span.textContent = 'Foto no disponible';
        parent.appendChild(span);
        parent.classList.add('grayscale');
      }
    }
  }
}
