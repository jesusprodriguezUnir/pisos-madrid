import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { existsSync } from 'node:fs';

async function testFirebase() {
  const serviceAccountPath = './serviceAccountKey.json';
  if (!existsSync(serviceAccountPath)) {
    console.error('❌ No se encontró serviceAccountKey.json');
    return;
  }

  console.log('Conectando a Firebase Firestore...');
  initializeApp({
    credential: cert(serviceAccountPath),
  });

  const db = getFirestore();
  const testRef = db.collection('_test_connection').doc('ping');
  
  await testRef.set({
    connected: true,
    timestamp: new Date().toISOString(),
    message: '¡Conexión exitosa desde pisos-madrid!',
  });

  const snap = await testRef.get();
  console.log('✅ Documento leído de Firestore:', snap.data());

  // Limpiar test doc
  await testRef.delete();
  console.log('✅ Test de Firestore completado con éxito.');
}

testFirebase().catch(console.error);
