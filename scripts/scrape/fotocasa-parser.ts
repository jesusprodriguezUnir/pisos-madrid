import type { Listing, Operation } from '../../src/app/core/models/listing.model';
import { CRITERIA, OPERATIONS } from './config';
import { splitTitle, toInt } from './parser';

/**
 * fotocasa renderiza el listado con JavaScript: no hay HTML servido con los
 * anuncios (ver `fotocasa.ts`, que usa Playwright para extraerlos ya
 * renderizados). Por eso, a diferencia de `parseListingsPage` de idealista,
 * esta función no recibe HTML crudo sino los pares {href, text} de cada
 * tarjeta ya localizados en el DOM real.
 */
export interface RawFotocasaCard {
  readonly href: string;
  /** Texto concatenado de la tarjeta completa (precio, habitaciones, m², planta...). */
  readonly text: string;
  /** Texto del propio enlace/título: "Piso en Calle de Alberto Aguilera, Argüelles". */
  readonly title: string;
}

const ID_RE = /\/(\d{6,12})(?:\/d)?(?:\?.*)?$/;
const ROOMS_RE = /(\d+)\s*(?:hab|dorm|habitaci[oó]n|dormitorio)/i;
const AREA_RE = /(\d+)\s*m[²2]/i;
const PRICE_RE = /(?:([\d.,]+)\s*€|€\s*([\d.,]+))/;
const FLOOR_RE = /(planta|bajo|entreplanta|ático|semis[oó]tano|principal)[^,.\n]*/i;

export function extractFotocasaId(href: string): string | null {
  return ID_RE.exec(href)?.[1] ?? null;
}

/**
 * Parsea las tarjetas ya extraídas del DOM renderizado de fotocasa.
 *
 * Selectores best-effort: la extracción en `fotocasa.ts` se apoya en el
 * patrón de URL de detalle (`/comprar|alquiler/vivienda/.../{id}/d`), que sí
 * se verificó contra fotocasa.es, en vez de en clases CSS concretas —
 * fotocasa usa clases generadas (`re-*`) que cambian sin aviso. Si esto
 * empieza a devolver 0 anuncios con páginas que sí cargan, revisa aquí.
 */
export function parseFotocasaCards(
  cards: readonly RawFotocasaCard[],
  zone: string,
  operation: Operation,
): Listing[] {
  const listings: Listing[] = [];
  const seen = new Set<string>();

  for (const card of cards) {
    const id = extractFotocasaId(card.href);
    if (!id || seen.has(id)) continue;

    // Descartar nuda propiedad
    if (/nuda\s*propiedad|nuda-propiedad/i.test(card.text) || /nuda\s*propiedad|nuda-propiedad/i.test(card.title)) continue;

    const rooms = toInt(ROOMS_RE.exec(card.text)?.[1]);
    const area = toInt(AREA_RE.exec(card.text)?.[1]);
    const priceMatch = PRICE_RE.exec(card.text);
    const price = toInt(priceMatch?.[1] ?? priceMatch?.[2]);
    const floor = FLOOR_RE.exec(card.text)?.[0]?.trim() ?? '';

    if (rooms < CRITERIA.minRooms || area < CRITERIA.minArea) continue;
    if (price <= 0 || price > OPERATIONS[operation].maxPrice) continue;

    seen.add(id);
    const { type, address } = card.title.includes(' en ')
      ? splitTitle(card.title.replace(/,\s*Madrid Capital$/, ''))
      : { type: 'Piso', address: zone };

    listings.push({
      id,
      zone,
      operation,
      type,
      address,
      price,
      rooms,
      area,
      floor,
      url: card.href.startsWith('http') ? card.href : `https://www.fotocasa.es${card.href}`,
      source: 'fotocasa',
    });
  }

  return listings;
}
