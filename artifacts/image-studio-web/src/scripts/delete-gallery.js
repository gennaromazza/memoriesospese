// Script per eliminare definitivamente una galleria problematica

import { db, storage } from '../lib/firebase';
import { doc, collection, query, where, getDocs, deleteDoc, writeBatch, getDoc } from 'firebase/firestore';
import { ref, listAll, deleteObject } from 'firebase/storage';

// ID della galleria da eliminare (passato come parametro o codice fisso)
const galleryCodeToDelete = "BARTOLOMEO-05-2025"; // Codice galleria da eliminare

async function deleteGalleryCompletely() {
  console.log(`Tentativo di eliminazione completa della galleria: ${galleryCodeToDelete}`);
  
  try {
    // 1. Trova la galleria in base al codice
    let galleryDoc;
    let galleryId;
    
    const galleryQuery = query(
      collection(db, "galleries"),
      where("code", "==", galleryCodeToDelete)
    );
    
    const querySnapshot = await getDocs(galleryQuery);
    if (querySnapshot.empty) {
      console.error("Nessuna galleria trovata con questo codice");
      return;
    }
    
    galleryDoc = querySnapshot.docs[0];
    galleryId = galleryDoc.id;
    
    console.log(`Trovata galleria con ID: ${galleryId}`);
    
    // 2. Elimina le foto dalla collezione gallery-photos
    await deleteBatchedDocuments("gallery-photos", "galleryId", galleryId);
    
    // 3. Elimina eventuali documenti nella sottocollezione photos (per sicurezza)
    try {
      const photosCollection = collection(db, "galleries", galleryId, "photos");
      const photosSnapshot = await getDocs(photosCollection);
      
      const batch = writeBatch(db);
      let count = 0;
      
      photosSnapshot.forEach((photoDoc) => {
        batch.delete(photoDoc.ref);
        count++;
      });
      
      if (count > 0) {
        await batch.commit();
        console.log(`Eliminati ${count} documenti dalla sottocollezione photos`);
      }
    } catch (err) {
      console.error("Errore nell'eliminazione della sottocollezione photos:", err);
    }
    
    // 4. Elimina i file da Storage
    try {
      // Controlla tutti i possibili percorsi di storage
      const storagePaths = [
        `gallery-photos/${galleryId}`,
        `galleries/${galleryId}/photos`,
        `galleries/${galleryId}`,
        `galleries/covers/${galleryCodeToDelete}_cover`
      ];
      
      for (const path of storagePaths) {
        try {
          const storageRef = ref(storage, path);
          const filesList = await listAll(storageRef);
          
          console.log(`Trovati ${filesList.items.length} file in ${path}`);
          
          // Elimina tutti i file nella directory
          for (const fileRef of filesList.items) {
            try {
              await deleteObject(fileRef);
              console.log(`Eliminato file: ${fileRef.fullPath}`);
            } catch (fileErr) {
              console.error(`Errore nell'eliminazione del file ${fileRef.fullPath}:`, fileErr);
            }
          }
          
          // Elimina tutte le sottodirectory ricorsivamente
          for (const dirRef of filesList.prefixes) {
            await deleteStorageFolder(dirRef);
          }
        } catch (storageErr) {
          console.warn(`Errore o percorso non trovato in ${path}:`, storageErr);
        }
      }
    } catch (storageErr) {
      console.error("Errore generale nell'eliminazione dei file:", storageErr);
    }
    
    // 5. Infine, elimina il documento della galleria
    await deleteDoc(doc(db, "galleries", galleryId));
    console.log(`✓ Galleria ${galleryId} eliminata completamente`);
    
  } catch (error) {
    console.error("Errore durante l'eliminazione della galleria:", error);
  }
}

// Funzione ricorsiva per eliminare cartelle di storage
async function deleteStorageFolder(folderRef) {
  try {
    const filesList = await listAll(folderRef);
    
    // Elimina tutti i file nella directory
    for (const fileRef of filesList.items) {
      try {
        await deleteObject(fileRef);
        console.log(`Eliminato file: ${fileRef.fullPath}`);
      } catch (fileErr) {
        console.error(`Errore nell'eliminazione del file ${fileRef.fullPath}:`, fileErr);
      }
    }
    
    // Elimina ricorsivamente le sottodirectory
    for (const dirRef of filesList.prefixes) {
      await deleteStorageFolder(dirRef);
    }
  } catch (error) {
    console.error(`Errore nell'eliminazione della cartella ${folderRef.fullPath}:`, error);
  }
}

// Funzione per eliminare documenti in batch
async function deleteBatchedDocuments(collectionName, fieldName, fieldValue) {
  try {
    const collectionRef = collection(db, collectionName);
    const q = query(collectionRef, where(fieldName, "==", fieldValue));
    
    let totalDeleted = 0;
    let batchSize = 0;
    
    do {
      // Firestore ha un limite di 500 documenti per batch, lo limitiamo a 20 per sicurezza
      const snapshot = await getDocs(q);
      const docsToDelete = snapshot.docs.slice(0, 20);
      batchSize = docsToDelete.length;
      
      if (batchSize === 0) break;
      
      const batch = writeBatch(db);
      docsToDelete.forEach(docSnapshot => {
        batch.delete(docSnapshot.ref);
      });
      
      await batch.commit();
      totalDeleted += batchSize;
      console.log(`Eliminato un gruppo di ${batchSize} documenti da ${collectionName}`);
      
      // Attendiamo un po' per evitare troppi writes simultanei
      await new Promise(resolve => setTimeout(resolve, 1000));
    } while (batchSize > 0);
    
    console.log(`Totale documenti eliminati da ${collectionName}: ${totalDeleted}`);
  } catch (error) {
    console.error(`Errore nell'eliminazione dei documenti da ${collectionName}:`, error);
  }
}

// Esecuzione dello script
deleteGalleryCompletely().then(() => {
  console.log("Operazione completata");
}).catch(err => {
  console.error("Errore nell'esecuzione dello script:", err);
});