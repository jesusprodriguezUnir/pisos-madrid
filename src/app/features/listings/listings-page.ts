import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  PRICE_CEILING,
  PRICE_STEP,
  type ListingFilters,
  type Operation,
  type SortKey,
  type SortState,
} from '../../core/models/listing.model';
import { ListingsService } from '../../core/services/listings.service';
import { applyFilters, sortListings, summarize } from '../../core/utils/listing-stats';

const DEFAULT_FILTERS: ListingFilters = {
  operation: 'venta',
  zones: [],
  minRooms: 2,
  minArea: 60,
  maxPrice: PRICE_CEILING.venta,
  query: '',
  requireLift: false,
  requireExterior: false,
  onlyBelowMedian: false,
};

@Component({
  selector: 'app-listings-page',
  imports: [FormsModule, DecimalPipe, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './listings-page.html',
  styleUrl: './listings-page.css',
})
export class ListingsPage {
  private readonly service = inject(ListingsService);

  protected readonly isLoading = this.service.isLoading;
  protected readonly error = this.service.error;
  protected readonly zones = this.service.zones;
  protected readonly scrapedAt = this.service.scrapedAt;
  protected readonly totalCount = computed(() => this.service.listings().length);

  protected readonly operations: readonly Operation[] = ['venta', 'alquiler'];

  protected readonly filters = signal<ListingFilters>(DEFAULT_FILTERS);
  protected readonly sort = signal<SortState>({ key: 'pricePerM2', direction: 1 });

  protected readonly rows = computed(() =>
    sortListings(applyFilters(this.service.listings(), this.filters()), this.sort()),
  );
  protected readonly summary = computed(() => summarize(this.rows()));

  protected readonly priceCeiling = computed(() => PRICE_CEILING[this.filters().operation]);
  protected readonly priceStep = computed(() => PRICE_STEP[this.filters().operation]);
  protected readonly priceUnit = computed(() =>
    this.filters().operation === 'venta' ? '€' : '€/mes',
  );

  protected setOperation(operation: Operation): void {
    this.filters.update((f) => ({ ...f, operation, maxPrice: PRICE_CEILING[operation] }));
  }

  protected toggleZone(zone: string): void {
    this.filters.update((f) => ({
      ...f,
      zones: f.zones.includes(zone) ? f.zones.filter((z) => z !== zone) : [...f.zones, zone],
    }));
  }

  protected patch<K extends keyof ListingFilters>(key: K, value: ListingFilters[K]): void {
    this.filters.update((f) => ({ ...f, [key]: value }));
  }

  protected toggleFlag(key: 'requireLift' | 'requireExterior' | 'onlyBelowMedian'): void {
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

  protected deltaClass(delta: number): string {
    if (delta < -8) return 'delta-good';
    if (delta > 8) return 'delta-bad';
    return 'delta-neutral';
  }

  protected asNumber(value: string): number {
    return Number(value);
  }
}
