import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import type { Listing } from '../../src/app/core/models/listing.model';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

function getDb() {
  if (getApps().length === 0) {
    const serviceAccountPath = process.env['FIREBASE_SERVICE_ACCOUNT'] ?? './serviceAccountKey.json';
    
    if (existsSync(serviceAccountPath)) {
      // Usar archivo de clave de servicio local si existe
      initializeApp({
        credential: cert(serviceAccountPath),
      });
    } else if (process.env['FIREBASE_PROJECT_ID']) {
      // Usar variables de entorno si se ejecutan en CI/CD (GitHub Actions)
      initializeApp({
        projectId: process.env['FIREBASE_PROJECT_ID'],
      });
    } else {
      console.warn(
        '  ⚠   Firebase admin no está configurado (falta serviceAccountKey.json o FIREBASE_PROJECT_ID). Se omitirá el guardado en Firestore.',
      );
      return null;
    }
  }
  return getFirestore();
}

/**
 * Sincroniza la lista de inmuebles extraídos en Firestore:
 * 1. Upsert de todos los anuncios actuales con timestamp actual.
 * 2. Borrado de los anuncios antiguos que ya no están presentes en la oferta actual.
 */
export async function syncListingsToFirebase(listings: readonly Listing[]): Promise<void> {
  const db = getDb();
  if (!db) return;

  const scrapedAt = new Date().toISOString();
  const collectionRef = db.collection('listings');

  console.log(`\nSincronizando ${listings.length} inmuebles con Firebase Firestore...`);

  // Firestore limita los batch a 500 operaciones
  const BATCH_SIZE = 450;
  for (let i = 0; i < listings.length; i += BATCH_SIZE) {
    const chunk = listings.slice(i, i + BATCH_SIZE);
    const batch = db.batch();

    for (const listing of chunk) {
      const docRef = collectionRef.doc(listing.id);
      batch.set(docRef, { ...listing, scrapedAt }, { merge: true });
    }

    await batch.commit();
  }

  // Eliminar documentos antiguos de scrapes anteriores
  const oldDocsSnapshot = await collectionRef.where('scrapedAt', '<', scrapedAt).get();

  if (!oldDocsSnapshot.empty) {
    console.log(`  Borrando ${oldDocsSnapshot.size} inmuebles que ya no están disponibles...`);
    const deleteBatch = db.batch();
    oldDocsSnapshot.docs.forEach((doc) => deleteBatch.delete(doc.ref));
    await deleteBatch.commit();
  }

  console.log('✅ Sincronización con Firestore completada.');
}
