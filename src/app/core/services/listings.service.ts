import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import type { EnrichedListing, ListingsDataset } from '../models/listing.model';
import { enrich } from '../utils/listing-stats';

const DATA_URL = 'data/pisos.json';

const EMPTY_DATASET: ListingsDataset = {
  source: 'idealista.com',
  scrapedAt: '',
  total: 0,
  listings: [],
};

/**
 * Fuente única de verdad del dataset. Carga el JSON estático una sola vez y
 * expone la versión enriquecida como signal.
 *
 * Nota: se usa `HttpClient` + `toSignal` en lugar de `httpResource()` porque
 * este último sigue marcado como experimental en Angular 20. La migración,
 * cuando se estabilice, afecta solo a este fichero.
 */
@Injectable({ providedIn: 'root' })
export class ListingsService {
  private readonly http = inject(HttpClient);

  private readonly loadError = signal<string | null>(null);

  private readonly dataset = toSignal(
    this.http.get<ListingsDataset>(DATA_URL).pipe(
      catchError((error: unknown) => {
        this.loadError.set(error instanceof Error ? error.message : 'No se pudo cargar el dataset');
        return of(EMPTY_DATASET);
      }),
    ),
    { initialValue: null },
  );

  readonly isLoading = computed(() => this.dataset() === null && this.loadError() === null);
  readonly error = this.loadError.asReadonly();

  readonly scrapedAt = computed(() => this.dataset()?.scrapedAt ?? '');

  readonly listings = computed<readonly EnrichedListing[]>(() => {
    const data = this.dataset();
    return data ? enrich(data.listings) : [];
  });

  readonly zones = computed(() =>
    [...new Set(this.listings().map((l) => l.zone))].sort((a, b) => a.localeCompare(b, 'es')),
  );
}

export const listingsDataUrl = DATA_URL;
