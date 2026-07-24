import { existsSync } from 'node:fs';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

function printUsage() {
  console.log(`Uso:\n  npm run add:listing-images -- <listingId> <imageUrl1> [imageUrl2 ...]\n\nEjemplo:\n  npm run add:listing-images -- listing-123 https://cdn.example.com/1.jpg https://cdn.example.com/2.jpg`);
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

async function addListingImages() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    return;
  }

  const [listingId, ...imageUrls] = args;

  if (!listingId || imageUrls.length === 0) {
    printUsage();
    process.exit(1);
  }

  const db = getDb();
  const collectionRef = db.collection('listing_images');
  const createdAt = new Date().toISOString();

  for (const [index, imageUrl] of imageUrls.entries()) {
    const docId = `${listingId}_${index + 1}`;
    const isPrimary = index === 0;

    await collectionRef.doc(docId).set(
      {
        id: docId,
        listingId,
        imageUrl,
        isPrimary,
        createdAt,
      },
      { merge: true },
    );

    console.log(`✅ Imagen añadida para ${listingId}: ${imageUrl}`);
  }

  console.log(`\n🎉 Proceso completado: ${imageUrls.length} imagen(es) asociadas a ${listingId}.`);
}

addListingImages().catch((error: unknown) => {
  console.error('❌ Error al añadir las imágenes:', error);
  process.exit(1);
});
