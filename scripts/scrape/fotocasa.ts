import { chromium, type Browser } from 'playwright';
import type { Listing, Operation } from '../../src/app/core/models/listing.model';
import { buildFotocasaUrl, type ZoneConfig } from './config';
import { parseFotocasaCards, type RawFotocasaCard } from './fotocasa-parser';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

/**
 * fotocasa renderiza el listado con JavaScript (ver nota en fotocasa-parser.ts),
 * así que hace falta un navegador real. `browser` se crea una vez y se
 * reutiliza para todo el scrape porque lanzar Chromium por página es lento.
 */
export async function withFotocasaBrowser<T>(fn: (browser: Browser) => Promise<T>): Promise<T> {
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
  });
  try {
    return await fn(browser);
  } finally {
    await browser.close();
  }
}

async function extractCards(browser: Browser, url: string): Promise<RawFotocasaCard[] | null> {
  const page = await browser.newPage({
    userAgent: USER_AGENT,
    locale: 'es-ES',
    viewport: { width: 1366, height: 900 },
    extraHTTPHeaders: {
      'accept-language': 'es-ES,es;q=0.9,en;q=0.8',
      'sec-ch-ua': '"Not/A)Brand";v="8", "Chromium";v="126", "Google Chrome";v="126"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
    },
  });

  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    if (!response || response.status() === 404) return null;
    if (response.status() === 403 || response.status() === 429) {
      throw new Error(
        `Bloqueado por fotocasa (HTTP ${response.status()}) en ${url}. ` +
          'Probablemente protección anti-bot: sube CRITERIA.delayMs o ejecuta el scraper desde una IP residencial.',
      );
    }

    // Intentar cerrar el banner de cookies si está presente
    try {
      const cookieBtn = page
        .locator(
          '#didomi-notice-agree-button, button[id*="didomi"], button:has-text("Aceptar"), button:has-text("Aceptar y cerrar")',
        )
        .first();
      if (await cookieBtn.isVisible({ timeout: 2_500 })) {
        await cookieBtn.click();
        await page.waitForTimeout(1_000);
      }
    } catch {
      // Ignorar si no aparece el diálogo de consentimiento
    }

    // Los anuncios se pintan tras cargar; esperamos al primer enlace de detalle
    // en vez de a un selector de tarjeta concreto (más robusto, ver fotocasa-parser.ts).
    const anchorSelector = 'a[href*="/vivienda/"], a[href*="/inmueble/"]';
    try {
      await page.waitForSelector(anchorSelector, { timeout: 10_000 });
    } catch {
      return []; // página cargó pero sin anuncios (zona vacía o bloqueo silencioso)
    }

    return await page.$$eval(anchorSelector, (anchors) =>
      anchors.map((a) => {
        let container: Element = a;
        for (let i = 0; i < 10 && container.parentElement; i++) {
          container = container.parentElement;
          const text = container.textContent ?? '';
          if ((/€/.test(text) || /hab|dorm|m[²2]/i.test(text)) && text.length > 20 && text.length < 3_000) {
            break;
          }
        }
        return {
          href: a.getAttribute('href') ?? '',
          text: container.textContent ?? '',
          title: a.textContent?.trim() ?? '',
        };
      }),
    );
  } finally {
    await page.close();
  }
}

export async function scrapeFotocasaZone(
  browser: Browser,
  zone: ZoneConfig,
  operation: Operation,
  maxPages: number,
  delayMs: number,
  onPageResult: (page: number, count: number) => void,
): Promise<Listing[]> {
  const listings: Listing[] = [];
  const seen = new Set<string>();

  for (let page = 1; page <= maxPages; page++) {
    const url = buildFotocasaUrl(zone, operation, page);
    const cards = await extractCards(browser, url);

    if (cards === null) break; // 404: no hay más páginas

    const parsed = parseFotocasaCards(cards, zone.name, operation);
    const fresh = parsed.filter((l) => !seen.has(l.id));
    fresh.forEach((l) => seen.add(l.id));
    listings.push(...fresh);
    onPageResult(page, parsed.length);

    if (parsed.length === 0) break;
    if (page < maxPages) await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  return listings;
}
