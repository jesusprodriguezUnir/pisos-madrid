import { mkdir, readFile, writeFile } from 'node:fs/promises';
import type { Listing, ListingsDataset, Operation } from '../../src/app/core/models/listing.model';
import { CRITERIA, OPERATIONS, OUTPUT_DIR, OUTPUT_INDEX_PATH, ZONES, buildIdealistaUrl } from './config';
import { parseListingsPage } from './parser';
import { scrapeFotocasaZone, withFotocasaBrowser } from './fotocasa';
import { computeListingDiff, formatDiffReport, type ListingDiff } from './listing-diff';

async function readPreviousListings(slug: string): Promise<Listing[]> {
  try {
    const raw = await readFile(`${OUTPUT_DIR}/${slug}.json`, 'utf-8');
    return (JSON.parse(raw) as ListingsDataset).listings as Listing[];
  } catch {
    return [];
  }
}

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchIdealistaPage(url: string): Promise<string | null> {
  const response = await fetch(url, {
    headers: {
      'user-agent': USER_AGENT,
      'accept-language': 'es-ES,es;q=0.9,en;q=0.8',
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'sec-ch-ua': '"Not/A)Brand";v="8", "Chromium";v="126", "Google Chrome";v="126"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'sec-fetch-dest': 'document',
      'sec-fetch-mode': 'navigate',
      'sec-fetch-site': 'none',
      'sec-fetch-user': '?1',
    },
  });

  if (response.status === 404) return null;

  if (response.status === 403 || response.status === 429) {
    throw new Error(
      `Bloqueado por idealista (HTTP ${response.status}) en ${url}. Probablemente DataDome.`,
    );
  }

  if (!response.ok) throw new Error(`HTTP ${response.status} en ${url}`);

  return response.text();
}

async function scrapeIdealistaZone(zone: (typeof ZONES)[number], operation: Operation): Promise<Listing[]> {
  const seen = new Set<string>();
  const listings: Listing[] = [];

  for (let page = 1; page <= CRITERIA.maxPages; page++) {
    const url = buildIdealistaUrl(zone, operation, page);
    try {
      const html = await fetchIdealistaPage(url);

      if (html === null) {
        console.warn(`  404  idealista  ${zone.name} / ${operation} / p${page} — ¿slug incorrecto?`);
        break;
      }

      const parsed = parseListingsPage(html, zone.name, operation);
      const fresh = parsed.filter((l) => !seen.has(l.id));
      fresh.forEach((l) => seen.add(l.id));
      listings.push(...fresh);

      console.log(
        `  ok   idealista  ${zone.name} / ${operation} / p${page} — ${parsed.length} anuncios (${fresh.length} nuevos)`,
      );

      if (parsed.length === 0) break;
      await sleep(CRITERIA.delayMs);
    } catch (err) {
      console.warn(`  ⚠   idealista  ${zone.name} / ${operation}: ${(err as Error).message}`);
      break;
    }
  }

  return listings;
}

async function main(): Promise<void> {
  console.log(
    `Scrapeando ${ZONES.length} distritos × 2 operaciones × 2 portales × ${CRITERIA.maxPages} páginas…`,
  );

  await mkdir(OUTPUT_DIR, { recursive: true });

  let zonesWritten = 0;
  const diffsByZone = new Map<string, ListingDiff>();

  await withFotocasaBrowser(async (browser) => {
    for (const zone of ZONES) {
      const listings: Listing[] = [];

      for (const operation of Object.keys(OPERATIONS) as Operation[]) {
        listings.push(...(await scrapeIdealistaZone(zone, operation)));

        listings.push(
          ...(await scrapeFotocasaZone(
            browser,
            zone,
            operation,
            CRITERIA.maxPages,
            CRITERIA.delayMs,
            (page, count) =>
              console.log(`  ok   fotocasa   ${zone.name} / ${operation} / p${page} — ${count} anuncios`),
          )),
        );
      }

      if (listings.length === 0) {
        console.warn(
          `  ⚠   ${zone.name}: 0 anuncios en ambos portales — no se sobrescribe ${zone.slug}.json`,
        );
        continue;
      }

      const previousListings = await readPreviousListings(zone.slug);
      diffsByZone.set(zone.name, computeListingDiff(previousListings, listings));

      const dataset: ListingsDataset = {
        source: 'idealista.com + fotocasa.es',
        scrapedAt: new Date().toISOString(),
        total: listings.length,
        listings,
      };

      await writeFile(`${OUTPUT_DIR}/${zone.slug}.json`, `${JSON.stringify(dataset, null, 1)}\n`, 'utf-8');
      zonesWritten++;
      console.log(`  ${listings.length} anuncios escritos en ${OUTPUT_DIR}/${zone.slug}.json`);
    }
  });

  if (zonesWritten === 0) {
    throw new Error(
      'El scraper no devolvió ningún anuncio en ningún distrito. Revisa los selectores en ' +
        'scripts/scrape/parser.ts y scripts/scrape/fotocasa-parser.ts antes de asumir que no hay oferta.',
    );
  }

  // El índice se reescribe siempre a partir de ZONES, incluso si algún distrito
  // no tuvo anuncios nuevos esta vez: la app necesita saber qué ficheros existen.
  const index = ZONES.map((zone) => ({ name: zone.name, slug: zone.slug }));
  await writeFile(OUTPUT_INDEX_PATH, `${JSON.stringify(index, null, 1)}\n`, 'utf-8');

  console.log(`\n${zonesWritten}/${ZONES.length} distritos actualizados.`);

  const report = formatDiffReport(diffsByZone);
  console.log(`\n${report}`);

  if (process.env['GITHUB_STEP_SUMMARY']) {
    await writeFile(process.env['GITHUB_STEP_SUMMARY'], `\n${report}\n`, { flag: 'a' });
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
