import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, forkJoin, map, of, switchMap } from 'rxjs';
import type { DistrictIndexEntry, EnrichedListing, Listing, ListingsDataset } from '../models/listing.model';
import { enrich } from '../utils/listing-stats';

const INDEX_URL = 'data/districts/index.json';
const districtUrl = (slug: string) => `data/districts/${slug}.json`;

/**
 * Fuente única de verdad del dataset. Carga el índice de distritos y, a
 * partir de él, un JSON por distrito (cada uno puede combinar anuncios de
 * idealista y fotocasa) — ver `scripts/scrape/index.ts`. Se combinan todos
 * en un único signal enriquecido.
 *
 * Nota: se usa `HttpClient` + `toSignal` en lugar de `httpResource()` porque
 * este último sigue marcado como experimental en Angular 22. La migración,
 * cuando se estabilice, afecta solo a este fichero.
 */
@Injectable({ providedIn: 'root' })
export class ListingsService {
  private readonly http = inject(HttpClient);

  private readonly loadError = signal<string | null>(null);

  private readonly datasets = toSignal(
    this.http.get<DistrictIndexEntry[]>(INDEX_URL).pipe(
      switchMap((index) =>
        index.length === 0
          ? of([] as ListingsDataset[])
          : forkJoin(
              index.map((entry) =>
                this.http
                  .get<ListingsDataset>(districtUrl(entry.slug))
                  .pipe(catchError(() => of(null))),
              ),
            ).pipe(map((results) => results.filter((r): r is ListingsDataset => r !== null))),
      ),
      catchError((error: unknown) => {
        this.loadError.set(error instanceof Error ? error.message : 'No se pudo cargar el dataset');
        return of([] as ListingsDataset[]);
      }),
    ),
    { initialValue: null },
  );

  readonly isLoading = computed(() => this.datasets() === null && this.loadError() === null);
  readonly error = this.loadError.asReadonly();

  readonly scrapedAt = computed(() =>
    (this.datasets() ?? []).reduce((latest, d) => (d.scrapedAt > latest ? d.scrapedAt : latest), ''),
  );

  readonly listings = computed<readonly EnrichedListing[]>(() => {
    const datasets = this.datasets() ?? [];
    const listings: Listing[] = datasets.flatMap((d) => d.listings);
    return enrich(listings);
  });

  readonly zones = computed(() =>
    [...new Set(this.listings().map((l) => l.zone))].sort((a, b) => a.localeCompare(b, 'es')),
  );

  readonly propertyTypes = computed(() =>
    [...new Set(this.listings().map((l) => l.type).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')),
  );
}
