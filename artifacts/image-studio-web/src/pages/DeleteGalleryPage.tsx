import { useState } from "react";
import { db, storage } from '../lib/firebase';
import { doc, collection, query, where, getDocs, deleteDoc, writeBatch, getDoc } from 'firebase/firestore';
import { ref, listAll, deleteObject } from 'firebase/storage';
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Loader2, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function DeleteGalleryPage() {
  const [isDeleting, setIsDeleting] = useState(false);
  const [galleryCode, setGalleryCode] = useState("BARTOLOMEO-05-2025");
  const [logs, setLogs] = useState<string[]>([]);
  const { toast } = useToast();

  // Funzione per aggiungere un log
  const addLog = (message: string) => {
    setLogs(prev => [...prev, message]);
  };

  // Funzione ricorsiva per eliminare cartelle di storage
  async function deleteStorageFolder(folderRef: any) {
    try {
      const filesList = await listAll(folderRef);
      
      // Elimina tutti i file nella directory
      for (const fileRef of filesList.items) {
        try {
          await deleteObject(fileRef);
          addLog(`Eliminato file: ${fileRef.fullPath}`);
        } catch (fileErr) {
          addLog(`Errore nell'eliminazione del file ${fileRef.fullPath}`);
        }
      }
      
      // Elimina ricorsivamente le sottodirectory
      for (const dirRef of filesList.prefixes) {
        await deleteStorageFolder(dirRef);
      }
    } catch (error) {
      addLog(`Errore nell'eliminazione della cartella ${folderRef.fullPath}`);
    }
  }

  // Funzione per eliminare documenti in batch
  async function deleteBatchedDocuments(collectionName: string, fieldName: string, fieldValue: string) {
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
        addLog(`Eliminato un gruppo di ${batchSize} documenti da ${collectionName}`);
        
        // Attendiamo un po' per evitare troppi writes simultanei
        await new Promise(resolve => setTimeout(resolve, 1000));
      } while (batchSize > 0);
      
      addLog(`Totale documenti eliminati da ${collectionName}: ${totalDeleted}`);
    } catch (error) {
      addLog(`Errore nell'eliminazione dei documenti da ${collectionName}`);
    }
  }

  // Funzione principale per eliminare la galleria
  const deleteGalleryCompletely = async () => {
    if (!galleryCode) {
      toast({
        title: "Errore",
        description: "Inserisci il codice della galleria da eliminare",
        variant: "destructive"
      });
      return;
    }
    
    if (!confirm(`Sei sicuro di voler eliminare definitivamente la galleria ${galleryCode}? Questa azione è irreversibile!`)) {
      return;
    }
    
    setIsDeleting(true);
    setLogs([]);
    addLog(`Tentativo di eliminazione completa della galleria: ${galleryCode}`);
    
    try {
      // 1. Trova la galleria in base al codice
      let galleryDoc;
      let galleryId;
      
      const galleryQuery = query(
        collection(db, "galleries"),
        where("code", "==", galleryCode)
      );
      
      const querySnapshot = await getDocs(galleryQuery);
      if (querySnapshot.empty) {
        addLog("Nessuna galleria trovata con questo codice");
        toast({
          title: "Errore",
          description: "Nessuna galleria trovata con questo codice",
          variant: "destructive"
        });
        setIsDeleting(false);
        return;
      }
      
      galleryDoc = querySnapshot.docs[0];
      galleryId = galleryDoc.id;
      
      addLog(`Trovata galleria con ID: ${galleryId}`);
      
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
          addLog(`Eliminati ${count} documenti dalla sottocollezione photos`);
        }
      } catch (err) {
        addLog("Errore nell'eliminazione della sottocollezione photos");
      }
      
      // 4. Elimina i file da Storage
      try {
        // Controlla tutti i possibili percorsi di storage
        const storagePaths = [
          `gallery-photos/${galleryId}`,
          `galleries/${galleryId}/photos`,
          `galleries/${galleryId}`,
          `galleries/covers/${galleryCode}_cover`
        ];
        
        for (const path of storagePaths) {
          try {
            const storageRef = ref(storage, path);
            const filesList = await listAll(storageRef);
            
            addLog(`Trovati ${filesList.items.length} file in ${path}`);
            
            // Elimina tutti i file nella directory
            for (const fileRef of filesList.items) {
              try {
                await deleteObject(fileRef);
                addLog(`Eliminato file: ${fileRef.fullPath}`);
              } catch (fileErr) {
                addLog(`Errore nell'eliminazione del file ${fileRef.fullPath}`);
              }
            }
            
            // Elimina tutte le sottodirectory ricorsivamente
            for (const dirRef of filesList.prefixes) {
              await deleteStorageFolder(dirRef);
            }
          } catch (storageErr) {
            addLog(`Errore o percorso non trovato in ${path}`);
          }
        }
      } catch (storageErr) {
        addLog("Errore generale nell'eliminazione dei file");
      }
      
      // 5. Infine, elimina il documento della galleria
      await deleteDoc(doc(db, "galleries", galleryId));
      addLog(`✓ Galleria ${galleryId} eliminata completamente`);
      
      toast({
        title: "Eliminazione completata",
        description: `La galleria ${galleryCode} è stata eliminata con successo`
      });
    } catch (error) {
      addLog("Errore durante l'eliminazione della galleria");
      toast({
        title: "Errore",
        description: "Si è verificato un errore durante l'eliminazione della galleria",
        variant: "destructive"
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="container max-w-2xl mx-auto py-10">
      <Card>
        <CardHeader>
          <CardTitle>Eliminazione galleria problematica</CardTitle>
          <CardDescription>
            Usa questa pagina per eliminare completamente una galleria che non si riesce a cancellare con i normali controlli.
            Verranno eliminati tutti i documenti e i file associati alla galleria.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="galleryCode">Codice galleria da eliminare</Label>
            <Input 
              id="galleryCode" 
              value={galleryCode} 
              onChange={(e) => setGalleryCode(e.target.value)}
              placeholder="Codice galleria (es. NOME-MM-YYYY)"
              disabled={isDeleting}
            />
          </div>
          
          {logs.length > 0 && (
            <div className="space-y-2">
              <Label>Log operazioni</Label>
              <div className="bg-muted p-3 rounded-md h-60 overflow-y-auto text-sm">
                {logs.map((log, index) => (
                  <div key={index} className="py-1 border-b border-gray-100 last:border-0">
                    {log}
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
        <CardFooter>
          <Button
            variant="destructive"
            onClick={deleteGalleryCompletely}
            disabled={isDeleting || !galleryCode}
            className="flex items-center"
          >
            {isDeleting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Eliminazione in corso...
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4 mr-2" />
                Elimina galleria
              </>
            )}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}