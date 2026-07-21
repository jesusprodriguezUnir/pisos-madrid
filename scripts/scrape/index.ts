import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Listing, ListingsDataset, Operation } from '../../src/app/core/models/listing.model';
import { CRITERIA, OPERATIONS, OUTPUT_PATH, ZONES, buildUrl } from './config';
import { parseListingsPage } from './parser';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchPage(url: string): Promise<string | null> {
  const response = await fetch(url, {
    headers: {
      'user-agent': USER_AGENT,
      'accept-language': 'es-ES,es;q=0.9',
      accept: 'text/html,application/xhtml+xml',
    },
  });

  if (response.status === 404) return null;

  if (response.status === 403 || response.status === 429) {
    throw new Error(
      `Bloqueado por idealista (HTTP ${response.status}) en ${url}. ` +
        'Probablemente DataDome: sube CRITERIA.delayMs o ejecuta el scraper desde una IP residencial.',
    );
  }

  if (!response.ok) throw new Error(`HTTP ${response.status} en ${url}`);

  return response.text();
}

async function scrape(): Promise<Listing[]> {
  const seen = new Set<string>();
  const listings: Listing[] = [];

  for (const zone of ZONES) {
    for (const operation of Object.keys(OPERATIONS) as Operation[]) {
      for (let page = 1; page <= CRITERIA.maxPages; page++) {
        const url = buildUrl(zone, operation, page);
        const html = await fetchPage(url);

        if (html === null) {
          console.warn(`  404  ${zone.name} / ${operation} / p${page} — ¿slug incorrecto?`);
          break;
        }

        const parsed = parseListingsPage(html, zone.name, operation);
        const fresh = parsed.filter((l) => !seen.has(l.id));
        fresh.forEach((l) => seen.add(l.id));
        listings.push(...fresh);

        console.log(
          `  ok   ${zone.name} / ${operation} / p${page} — ${parsed.length} anuncios (${fresh.length} nuevos)`,
        );

        // Sin más resultados: no tiene sentido pedir la página siguiente.
        if (parsed.length === 0) break;

        await sleep(CRITERIA.delayMs);
      }
    }
  }

  return listings;
}

async function main(): Promise<void> {
  console.log(`Scrapeando ${ZONES.length} zonas × 2 operaciones × ${CRITERIA.maxPages} páginas…`);
  const listings = await scrape();

  if (listings.length === 0) {
    throw new Error(
      'El scraper no devolvió ningún anuncio. Revisa los selectores en scripts/scrape/parser.ts ' +
        'antes de sobrescribir el dataset existente.',
    );
  }

  const dataset: ListingsDataset = {
    source: 'idealista.com',
    scrapedAt: new Date().toISOString(),
    total: listings.length,
    listings,
  };

  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(dataset, null, 1)}\n`, 'utf-8');

  console.log(`\n${listings.length} anuncios escritos en ${OUTPUT_PATH}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
