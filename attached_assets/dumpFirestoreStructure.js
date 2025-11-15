import admin from "firebase-admin";
import fs from "fs";

// === 1. Inserisci la tua chiave Admin Firebase ===
// Vai su Firebase -> Impostazioni -> Account di servizio -> Genera nuova chiave privata
// Carica il file JSON su Replit (es. serviceAccount.json)
import serviceAccount from "./serviceAccount.json" assert { type: "json" };

// === 2. Inizializza Admin SDK ===
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function dumpStructure() {
  const output = [];

  const collections = await db.listCollections();

  for (const col of collections) {
    const colName = col.id;

    const snapshot = await col.limit(1).get();
    let sampleDoc = null;

    snapshot.forEach((doc) => {
      sampleDoc = { id: doc.id, data: doc.data() };
    });

    output.push({
      collection: colName,
      sample: sampleDoc || "(collezione vuota)",
    });
  }

  fs.writeFileSync("firestore_structure.json", JSON.stringify(output, null, 2));

  console.log("🔥 File generato: firestore_structure.json");
}

dumpStructure();
