import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { existsSync } from 'node:fs';

const NUDA_PROPIEDAD_RE = /nuda\s*propiedad|nuda-propiedad|nudapropiedad/i;

async function cleanNudaPropiedad() {
  const serviceAccountPath = process.env['FIREBASE_SERVICE_ACCOUNT'] ?? './serviceAccountKey.json';

  if (!existsSync(serviceAccountPath)) {
    console.error('❌ Error: No se encontró serviceAccountKey.json');
    process.exit(1);
  }

  if (getApps().length === 0) {
    initializeApp({
      credential: cert(serviceAccountPath),
    });
  }

  const db = getFirestore();
  console.log('🔍 Escaneando la colección "listings" en Firebase Firestore en busca de pisos con nuda propiedad...');

  const snapshot = await db.collection('listings').get();
  if (snapshot.empty) {
    console.log('La colección está vacía.');
    return;
  }

  let deletedCount = 0;
  const batch = db.batch();

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const text = `${data['address'] ?? ''} ${data['type'] ?? ''} ${data['floor'] ?? ''} ${data['url'] ?? ''}`;
    
    if (NUDA_PROPIEDAD_RE.test(text)) {
      console.log(`  ❌ Eliminando inmueble con nuda propiedad: [${doc.id}] ${data['address']} (${data['zone']})`);
      batch.delete(doc.ref);
      deletedCount++;
    }
  }

  if (deletedCount > 0) {
    await batch.commit();
    console.log(`\n✅ Se han eliminado ${deletedCount} inmuebles de nuda propiedad de Firestore.`);
  } else {
    console.log('\n✅ No se encontró ningún inmueble de nuda propiedad en la base de datos.');
  }
}

cleanNudaPropiedad().catch(console.error);
