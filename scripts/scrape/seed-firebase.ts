import { readFile } from 'node:fs/promises';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { existsSync } from 'node:fs';
import type { DistrictIndexEntry, Listing, ListingsDataset } from '../../src/app/core/models/listing.model';
import { OUTPUT_DIR, OUTPUT_INDEX_PATH } from './config';

async function seedFirebase() {
  const serviceAccountPath = process.env['FIREBASE_SERVICE_ACCOUNT'] ?? './serviceAccountKey.json';
  
  if (!existsSync(serviceAccountPath)) {
    console.error('❌ Error: No se encontró el archivo serviceAccountKey.json en la raíz del proyecto.');
    process.exit(1);
  }

  if (getApps().length === 0) {
    initializeApp({
      credential: cert(serviceAccountPath),
    });
  }

  const db = getFirestore();
  console.log('📖 Leyendo todos los archivos JSON locales en public/data/districts/...');

  const indexRaw = await readFile(OUTPUT_INDEX_PATH, 'utf-8');
  const index: DistrictIndexEntry[] = JSON.parse(indexRaw);

  const allListings: Listing[] = [];
  const seenIds = new Set<string>();

  for (const entry of index) {
    try {
      const content = await readFile(`${OUTPUT_DIR}/${entry.slug}.json`, 'utf-8');
      const dataset: ListingsDataset = JSON.parse(content);
      
      for (const listing of dataset.listings) {
        if (!seenIds.has(listing.id)) {
          seenIds.add(listing.id);
          allListings.push(listing);
        }
      }
      console.log(`  ✓ Cargado ${entry.name}: ${dataset.listings.length} anuncios`);
    } catch {
      console.warn(`  ⚠ No se pudo leer ${entry.slug}.json`);
    }
  }

  console.log(`\nSubiendo un total de ${allListings.length} inmuebles únicos a Firebase Firestore...`);

  const collectionRef = db.collection('listings');
  const scrapedAt = new Date().toISOString();
  const BATCH_SIZE = 450;

  for (let i = 0; i < allListings.length; i += BATCH_SIZE) {
    const chunk = allListings.slice(i, i + BATCH_SIZE);
    const batch = db.batch();

    for (const listing of chunk) {
      const docRef = collectionRef.doc(listing.id);
      batch.set(docRef, { ...listing, scrapedAt }, { merge: true });
    }

    await batch.commit();
    console.log(`  ✓ Subido lote ${Math.floor(i / BATCH_SIZE) + 1} (${chunk.length} inmuebles)`);
  }

  console.log(`\n🎉 ¡Éxito! Se han importado ${allListings.length} pisos a la colección 'listings' de Firestore.`);
}

seedFirebase().catch((err: unknown) => {
  console.error('❌ Error en el proceso de migración:', err);
  process.exit(1);
});
