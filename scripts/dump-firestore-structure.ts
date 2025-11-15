
/**
 * Script per dumpare la struttura completa di Firestore
 * Usa le credenziali Firebase Admin da environment variable
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';

// Inizializza Firebase Admin (pattern dal progetto)
function initializeFirebaseAdmin() {
  const existingApps = getApps();
  if (existingApps.length > 0) {
    console.log('✅ Firebase Admin già inizializzato');
    return existingApps[0];
  }

  const serviceAccountBase64 = process.env.FIREBASE_ADMIN_CREDENTIALS;
  
  if (!serviceAccountBase64) {
    throw new Error('❌ FIREBASE_ADMIN_CREDENTIALS non configurato');
  }

  const serviceAccountJson = Buffer.from(serviceAccountBase64, 'base64').toString('utf-8');
  const serviceAccount = JSON.parse(serviceAccountJson);

  return initializeApp({
    credential: cert(serviceAccount),
    storageBucket: `${serviceAccount.project_id}.firebasestorage.app`
  });
}

async function dumpStructure() {
  console.log('🚀 Inizio dump struttura Firestore...');
  
  initializeFirebaseAdmin();
  const db = getFirestore();

  const output: any[] = [];
  const collections = await db.listCollections();

  console.log(`📋 Trovate ${collections.length} collezioni`);

  for (const col of collections) {
    const colName = col.id;
    console.log(`  📦 Analizzando collezione: ${colName}`);

    const snapshot = await col.limit(1).get();
    let sampleDoc = null;

    snapshot.forEach((doc) => {
      sampleDoc = { id: doc.id, data: doc.data() };
    });

    output.push({
      collection: colName,
      documentCount: (await col.count().get()).data().count,
      sample: sampleDoc || "(collezione vuota)",
    });
  }

  const outputPath = 'firestore_structure.json';
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

  console.log(`\n✅ File generato: ${outputPath}`);
  console.log(`📊 Collezioni trovate: ${collections.length}`);
}

dumpStructure().catch(error => {
  console.error('❌ Errore:', error);
  process.exit(1);
});
