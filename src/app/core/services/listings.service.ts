import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, forkJoin, from, map, of, switchMap } from 'rxjs';
import type { DistrictIndexEntry, EnrichedListing, Listing, ListingsDataset } from '../models/listing.model';
import { enrich } from '../utils/listing-stats';
import { environment } from '../../../environments/environment';

const INDEX_URL = 'data/districts/index.json';
const districtUrl = (slug: string) => `data/districts/${slug}.json`;

async function fetchListingsFromFirebase(): Promise<Listing[] | null> {
  if (!environment.firebase?.apiKey || environment.firebase.apiKey === 'YOUR_API_KEY') {
    return null; // Firebase no configurado aún, usar fallback JSON local
  }

  const { initializeApp, getApps } = await import('firebase/app');
  const { getFirestore, collection, getDocs } = await import('firebase/firestore');

  const app = getApps().length === 0 ? initializeApp(environment.firebase) : getApps()[0];
  const db = getFirestore(app);

  const snapshot = await getDocs(collection(db, 'listings'));
  if (snapshot.empty) return null;

  return snapshot.docs.map((doc) => doc.data() as Listing);
}

@Injectable({ providedIn: 'root' })
export class ListingsService {
  private readonly http = inject(HttpClient);
  private readonly loadError = signal<string | null>(null);

  private readonly rawListingsSignal = toSignal(
    from(fetchListingsFromFirebase()).pipe(
      switchMap((firebaseListings) => {
        if (firebaseListings && firebaseListings.length > 0) {
          return of(firebaseListings);
        }
        // Fallback a archivos JSON locales de respaldo
        return this.http.get<DistrictIndexEntry[]>(INDEX_URL).pipe(
          switchMap((index) =>
            index.length === 0
              ? of([] as Listing[])
              : forkJoin(
                  index.map((entry) =>
                    this.http
                      .get<ListingsDataset>(districtUrl(entry.slug))
                      .pipe(catchError(() => of(null))),
                  ),
                ).pipe(
                  map((results) =>
                    results
                      .filter((r): r is ListingsDataset => r !== null)
                      .flatMap((d) => d.listings),
                  ),
                ),
          ),
        );
      }),
      catchError((error: unknown) => {
        this.loadError.set(error instanceof Error ? error.message : 'No se pudo cargar el dataset');
        return of([] as Listing[]);
      }),
    ),
    { initialValue: null },
  );

  private readonly addedListings = signal<Listing[]>([]);

  readonly isLoading = computed(() => this.rawListingsSignal() === null && this.loadError() === null);
  readonly error = this.loadError.asReadonly();

  readonly scrapedAt = computed(() => '');

  readonly listings = computed<readonly EnrichedListing[]>(() => {
    const rawListings = this.rawListingsSignal() ?? [];
    const custom = this.addedListings();
    const customIds = new Set(custom.map((l) => l.id));
    const combined = [...custom, ...rawListings.filter((l) => !customIds.has(l.id))];
    return enrich(combined);
  });

  readonly zones = computed(() =>
    [...new Set(this.listings().map((l) => l.zone))].sort((a, b) => a.localeCompare(b, 'es')),
  );

  readonly propertyTypes = computed(() =>
    [...new Set(this.listings().map((l) => l.type).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')),
  );

  async addListing(listing: Listing): Promise<void> {
    // 1. Guardar en Firebase Firestore si está configurado
    if (environment.firebase?.apiKey && environment.firebase.apiKey !== 'YOUR_API_KEY') {
      const { initializeApp, getApps } = await import('firebase/app');
      const { getFirestore, doc, setDoc } = await import('firebase/firestore');

      const app = getApps().length === 0 ? initializeApp(environment.firebase) : getApps()[0];
      const db = getFirestore(app);

      const scrapedAt = new Date().toISOString();
      const docRef = doc(db, 'listings', listing.id);
      await setDoc(docRef, { ...listing, scrapedAt }, { merge: true });
    }

    // 2. Actualizar el estado reactivo local inmediatamente
    this.addedListings.update((current) => [listing, ...current.filter((l) => l.id !== listing.id)]);
  }
}
