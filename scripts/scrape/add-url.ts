import { parse } from 'node-html-parser';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import type { Listing, Operation, Source } from '../../src/app/core/models/listing.model';
import { ZONES } from './config';
import { toInt, splitTitle } from './parser';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'user-agent': USER_AGENT,
        'accept-language': 'es-ES,es;q=0.9',
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function matchZone(text: string): string {
  const normalized = text.toLowerCase();
  for (const zone of ZONES) {
    if (normalized.includes(zone.name.toLowerCase()) || normalized.includes(zone.slug)) {
      return zone.name;
    }
  }
  return 'Argüelles';
}

export async function addListingFromUrl(inputUrl: string, customParams: Partial<Listing> = {}): Promise<Listing> {
  const url = inputUrl.trim();
  const isFotocasa = url.includes('fotocasa.es');
  const source: Source = isFotocasa ? 'fotocasa' : 'idealista';

  // Extraer ID
  const idMatch = /\/(\d{6,12})/.exec(url);
  const id = customParams.id || idMatch?.[1] || `url_${Date.now()}`;

  // Intentar obtener HTML para autoparsear datos del detalle
  const html = await fetchHtml(url);
  
  let type = customParams.type || 'Piso';
  let address = customParams.address || '';
  let price = customParams.price || 0;
  let rooms = customParams.rooms || 2;
  let area = customParams.area || 75;
  let floor = customParams.floor || 'Planta exterior';
  let operation: Operation = customParams.operation || (url.includes('alquiler') ? 'alquiler' : 'venta');
  let zone = customParams.zone || matchZone(url);

  let imageUrl = customParams.imageUrl;

  if (html) {
    const root = parse(html);
    const titleText = root.querySelector('h1, title')?.text?.trim() ?? '';
    const fullText = root.text;

    if (!imageUrl) {
      const ogImg = root.querySelector('meta[property="og:image"], meta[name="og:image"]')?.getAttribute('content');
      const firstImg = root.querySelector('.main-image img, .multimedia img, picture img, img')?.getAttribute('src');
      let found = ogImg || firstImg;
      if (found && found.startsWith('//')) found = `https:${found}`;
      if (found && !found.startsWith('data:')) imageUrl = found;
    }

    if (titleText) {
      const parsed = splitTitle(titleText);
      if (!address) address = parsed.address;
      if (!customParams.type && parsed.type) type = parsed.type;
    }

    if (!zone || zone === 'Argüelles') {
      zone = matchZone(titleText + ' ' + url);
    }

    if (!price) {
      const priceText = root.querySelector('.info-data_price, .item-price, [class*="price"]')?.text;
      price = toInt(priceText);
    }

    if (!rooms) {
      const roomsMatch = /(\d+)\s*(?:hab|dorm)/i.exec(fullText);
      if (roomsMatch) rooms = toInt(roomsMatch[1]);
    }

    if (!area) {
      const areaMatch = /(\d+)\s*m[²2]/i.exec(fullText);
      if (areaMatch) area = toInt(areaMatch[1]);
    }

    if (!floor) {
      const floorMatch = /(planta\s*\d*|bajo|entreplanta|ático|semisótano)[^,.\n]*/i.exec(fullText);
      if (floorMatch) floor = floorMatch[0].trim();
    }
  }

  // Fallbacks si falta algún campo obligatorio
  if (!address) {
    address = `Inmueble en ${zone}`;
  }
  if (!price) {
    price = operation === 'venta' ? 350000 : 1200;
  }

  const listing: Listing = {
    id,
    zone,
    operation,
    type,
    address,
    price,
    rooms,
    area,
    floor,
    url,
    source,
    ...(imageUrl ? { imageUrl } : {}),
  };

  // Guardar en Firestore
  const serviceAccountPath = process.env['FIREBASE_SERVICE_ACCOUNT'] ?? './serviceAccountKey.json';
  if (existsSync(serviceAccountPath)) {
    if (getApps().length === 0) {
      initializeApp({ credential: cert(serviceAccountPath) });
    }
    const db = getFirestore();
    const scrapedAt = new Date().toISOString();
    await db.collection('listings').doc(listing.id).set({ ...listing, scrapedAt }, { merge: true });
    console.log(`✅ Inmueble [${listing.id}] guardado en Firestore: ${listing.address} (${listing.price.toLocaleString('es-ES')} €)`);
    if (listing.imageUrl) {
      console.log(`  🖼️ Imagen de portada extraída: ${listing.imageUrl}`);
    } else {
      console.log('  ⚠ No se detectó imagen de portada para este enlace.');
    }
  } else {
    console.warn('⚠ serviceAccountKey.json no encontrado. Se omitió la escritura en Firestore.');
  }

  // Guardar también en el fichero JSON local del distrito correspondiente
  const matchedZone = ZONES.find(
    (z) => z.name.toLowerCase() === listing.zone.toLowerCase() || z.slug === listing.zone.toLowerCase(),
  );
  const slug = matchedZone?.slug || listing.zone.toLowerCase().replace(/\s+/g, '-');
  const localJsonPath = `./public/data/districts/${slug}.json`;

  if (existsSync(localJsonPath)) {
    try {
      const content = await readFile(localJsonPath, 'utf-8');
      const dataset = JSON.parse(content);
      const idx = dataset.listings.findIndex((l: Listing) => l.id === listing.id);
      const updatedListings = [...dataset.listings];
      if (idx >= 0) {
        updatedListings[idx] = listing;
      } else {
        updatedListings.unshift(listing);
      }
      dataset.listings = updatedListings;
      dataset.total = updatedListings.length;
      const { writeFile } = await import('node:fs/promises');
      await writeFile(localJsonPath, JSON.stringify(dataset, null, 2), 'utf-8');
      console.log(`📁 Fichero local '${localJsonPath}' actualizado.`);
    } catch {
      console.warn(`⚠ No se pudo actualizar el archivo local ${localJsonPath}`);
    }
  }

  return listing;
}

// Ejecución CLI si se llama directamente
if (process.argv[2]) {
  const urlArg = process.argv[2];
  addListingFromUrl(urlArg)
    .then((result) => console.log('\nResultado:', JSON.stringify(result, null, 2)))
    .catch((err) => console.error('❌ Error al añadir inmueble:', err));
}
