import { Injectable, signal } from '@angular/core';

const FAVORITES_KEY = 'pm_favorites';
const DISMISSED_KEY = 'pm_dismissed';

@Injectable({ providedIn: 'root' })
export class FavoritesService {
  private readonly favoritesSignal = signal<ReadonlySet<string>>(this.loadSet(FAVORITES_KEY));
  private readonly dismissedSignal = signal<ReadonlySet<string>>(this.loadSet(DISMISSED_KEY));

  readonly favorites = this.favoritesSignal.asReadonly();
  readonly dismissed = this.dismissedSignal.asReadonly();

  toggleFavorite(id: string): void {
    const current = new Set(this.favoritesSignal());
    const dismissed = new Set(this.dismissedSignal());

    if (current.has(id)) {
      current.delete(id);
    } else {
      current.add(id);
      // Remove from dismissed if present
      if (dismissed.has(id)) {
        dismissed.delete(id);
        this.saveSet(DISMISSED_KEY, dismissed);
        this.dismissedSignal.set(dismissed);
      }
    }

    this.saveSet(FAVORITES_KEY, current);
    this.favoritesSignal.set(current);
  }

  toggleDismissed(id: string): void {
    const current = new Set(this.dismissedSignal());
    const favorites = new Set(this.favoritesSignal());

    if (current.has(id)) {
      current.delete(id);
    } else {
      current.add(id);
      // Remove from favorites if present
      if (favorites.has(id)) {
        favorites.delete(id);
        this.saveSet(FAVORITES_KEY, favorites);
        this.favoritesSignal.set(favorites);
      }
    }

    this.saveSet(DISMISSED_KEY, current);
    this.dismissedSignal.set(current);
  }

  isFavorite(id: string): boolean {
    return this.favoritesSignal().has(id);
  }

  isDismissed(id: string): boolean {
    return this.dismissedSignal().has(id);
  }

  private loadSet(key: string): Set<string> {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return new Set();
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? new Set(parsed) : new Set();
    } catch {
      return new Set();
    }
  }

  private saveSet(key: string, set: Set<string>): void {
    try {
      localStorage.setItem(key, JSON.stringify([...set]));
    } catch {
      // Storage unavailable or quota exceeded
    }
  }
}
