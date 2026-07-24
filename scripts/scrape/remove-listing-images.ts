import { existsSync } from 'node:fs';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

function printUsage() {
  console.log(`Uso:\n  npm run remove:listing-images -- <listingId>\n\nEjemplo:\n  npm run remove:listing-images -- listing-123`);
}

function getDb() {
  if (getApps().length === 0) {
    const serviceAccountPath = process.env['FIREBASE_SERVICE_ACCOUNT'] ?? './serviceAccountKey.json';

    if (existsSync(serviceAccountPath)) {
      initializeApp({
        credential: cert(serviceAccountPath),
      });
    } else if (process.env['FIREBASE_PROJECT_ID']) {
      initializeApp({
        projectId: process.env['FIREBASE_PROJECT_ID'],
      });
    } else {
      throw new Error('No se encontró serviceAccountKey.json ni FIREBASE_PROJECT_ID.');
    }
  }

  return getFirestore();
}

async function removeListingImages() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    return;
  }

  const [listingId] = args;

  if (!listingId) {
    printUsage();
    process.exit(1);
  }

  const db = getDb();
  const snapshot = await db.collection('listing_images').where('listingId', '==', listingId).get();

  if (snapshot.empty) {
    console.log(`ℹ️ No se encontraron imágenes para el inmueble ${listingId}.`);
    return;
  }

  const batch = db.batch();
  snapshot.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();

  console.log(`🗑️ Se eliminaron ${snapshot.size} imagen(es) asociadas a ${listingId}.`);
}

removeListingImages().catch((error: unknown) => {
  console.error('❌ Error al eliminar las imágenes:', error);
  process.exit(1);
});
