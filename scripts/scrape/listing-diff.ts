import type { Listing } from '../../src/app/core/models/listing.model';

export interface ListingDiff {
  readonly added: readonly Listing[];
  readonly removed: readonly Listing[];
}

/** Compara dos snapshots de una misma zona por `id` para detectar altas y bajas. */
export function computeListingDiff(previous: readonly Listing[], current: readonly Listing[]): ListingDiff {
  const previousIds = new Set(previous.map((l) => l.id));
  const currentIds = new Set(current.map((l) => l.id));

  return {
    added: current.filter((l) => !previousIds.has(l.id)),
    removed: previous.filter((l) => !currentIds.has(l.id)),
  };
}

function formatListing(listing: Listing): string {
  return `[${listing.address} — ${listing.price.toLocaleString('es-ES')} € (${listing.operation})](${listing.url})`;
}

/** Bloque Markdown legible para consola o `$GITHUB_STEP_SUMMARY`. */
export function formatDiffReport(diffsByZone: ReadonlyMap<string, ListingDiff>): string {
  const lines: string[] = ['## 📊 Altas y bajas de hoy'];

  let totalAdded = 0;
  let totalRemoved = 0;
  const zoneSections: string[] = [];

  for (const [zoneName, diff] of diffsByZone) {
    if (diff.added.length === 0 && diff.removed.length === 0) continue;

    totalAdded += diff.added.length;
    totalRemoved += diff.removed.length;

    const section: string[] = [`### ${zoneName}`];

    if (diff.added.length > 0) {
      section.push(`**Nuevos (${diff.added.length}):**`);
      section.push(...diff.added.map((l) => `- ${formatListing(l)}`));
    }

    if (diff.removed.length > 0) {
      section.push(`**Ya no disponibles (${diff.removed.length}):**`);
      section.push(...diff.removed.map((l) => `- ${l.address} — ${l.price.toLocaleString('es-ES')} € (${l.operation})`));
    }

    zoneSections.push(section.join('\n'));
  }

  lines.push(`Total: ${totalAdded} nuevos, ${totalRemoved} ya no disponibles.`);

  if (zoneSections.length === 0) {
    lines.push('\nSin cambios respecto al scrape anterior.');
  } else {
    lines.push('', ...zoneSections);
  }

  return lines.join('\n');
}
