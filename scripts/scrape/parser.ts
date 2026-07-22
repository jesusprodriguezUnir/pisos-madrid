import { parse } from 'node-html-parser';
import type { Listing, Operation } from '../../src/app/core/models/listing.model';
import { CRITERIA, IDEALISTA_BASE_URL as BASE_URL, OPERATIONS } from './config';

/** Extrae el primer entero de un texto, ignorando separadores de millar y símbolos. */
export function toInt(text: string | undefined): number {
  if (!text) return 0;
  const digits = text.replace(/[^\d]/g, '');
  return digits ? Number.parseInt(digits, 10) : 0;
}

export function extractId(href: string): string | null {
  return /\/inmueble\/(\d+)\//.exec(href)?.[1] ?? null;
}

/** "Piso en Calle de Maudes, Ríos Rosas, Madrid" -> tipo + dirección. */
export function splitTitle(title: string): { type: string; address: string } {
  const [type = 'Piso'] = title.split(' en ');
  const address = title.replace(/^[^ ]+ en /, '').replace(/,\s*Madrid$/, '');
  return { type, address: address.trim() };
}

/**
 * Parsea un listado de resultados de idealista.
 *
 * El marcado del portal cambia sin aviso: `article.item` y las clases
 * `item-link` / `item-price` / `item-detail` son el contrato frágil de todo
 * esto. Si el scraper devuelve 0 anuncios con HTTP 200, empieza mirando aquí.
 */
export function parseListingsPage(html: string, zone: string, operation: Operation): Listing[] {
  const root = parse(html);
  const listings: Listing[] = [];

  for (const article of root.querySelectorAll('article.item')) {
    const link = article.querySelector('.item-link');
    const href = link?.getAttribute('href');
    if (!link || !href) continue;

    const id = extractId(href);
    if (!id) continue;

    const details = article.querySelectorAll('.item-detail').map((node) => node.text.trim());
    const rooms = toInt(details.find((d) => /hab/.test(d)));
    const area = toInt(details.find((d) => /m²/.test(d)));
    const price = toInt(article.querySelector('.item-price')?.text);
    const floor = details.find((d) => /planta|bajo|entreplanta|ático|semi/i.test(d)) ?? '';

    if (rooms < CRITERIA.minRooms || area < CRITERIA.minArea) continue;
    if (price <= 0 || price > OPERATIONS[operation].maxPrice) continue;

    const { type, address } = splitTitle(link.text.trim());

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
      url: `${BASE_URL}${href}`,
      source: 'idealista',
    });
  }

  return listings;
}
