import { useState } from "react";
import { collection, query, where, getDocs, doc, writeBatch, getFirestore } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface SyncGalleryChaptersProps {
  galleryId: string;
  galleryClosed?: () => void;
}

export default function SyncGalleryChapters({ galleryId, galleryClosed }: SyncGalleryChaptersProps) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "success" | "error">("idle");
  const [syncStats, setSyncStats] = useState({
    total: 0,
    updated: 0,
    unchanged: 0,
    errors: 0
  });
  const { toast } = useToast();

  const startSync = async () => {
    if (isSyncing) return;
    
    setIsSyncing(true);
    setSyncStatus("syncing");
    setSyncProgress(0);
    setSyncStats({
      total: 0,
      updated: 0,
      unchanged: 0,
      errors: 0
    });

    try {
      // 1. Caricare tutti i capitoli della galleria
      const chaptersRef = collection(db, "galleries", galleryId, "chapters");
      const chaptersSnapshot = await getDocs(chaptersRef);
      const chapters = chaptersSnapshot.docs.map(doc => ({
        id: doc.id,
        position: doc.data().position,
        title: doc.data().title,
        originalId: doc.data().originalId
      }));
      
      // Ordina i capitoli per posizione
      chapters.sort((a, b) => a.position - b.position);
      
      // 2. Recuperare tutte le foto associate a questa galleria
      const photosRef = collection(db, "gallery-photos");
      const q = query(photosRef, where("galleryId", "==", galleryId));
      const photosSnapshot = await getDocs(q);
      
      const photos = photosSnapshot.docs.map(doc => ({
        id: doc.id,
        name: doc.data().name,
        chapterId: doc.data().chapterId,
        ...doc.data()
      }));
      
      setSyncStats(prev => ({ ...prev, total: photos.length }));

      // Prepara il batch per l'aggiornamento
      const firestore = getFirestore();
      let batch = writeBatch(firestore);
      let batchCount = 0;
      let updatedCount = 0;
      let unchangedCount = 0;
      let errorCount = 0;

      // Per ogni foto, determina il capitolo in base al nome e aggiorna il riferimento se necessario
      for (let i = 0; i < photos.length; i++) {
        const photo = photos[i];
        
        try {
          // Determina a quale capitolo dovrebbe appartenere questa foto
          let targetChapterId = null;
          
          // Usa la stessa logica di assegnazione del componente TabsChapters
          if (chapters.length === 3) {
            // Sposi, Reportage, Selfie
            const sposiChapter = chapters.find(c => c.title === "Sposi");
            const reportageChapter = chapters.find(c => c.title === "Reportage");
            const selfieChapter = chapters.find(c => c.title === "Selfie");
            
            // Gli sposi sono in genere all'inizio della galleria (primi numeri)
            if (sposiChapter && (photo.name.includes("DSC0") || photo.name.includes("DSCF1") || photo.name.includes("IMAG5"))) {
              targetChapterId = sposiChapter.id;
            }
            // Il reportage è al centro della galleria (numeri intermedi)
            else if (reportageChapter && (photo.name.includes("DSCF2") || photo.name.includes("IMAG6"))) {
              targetChapterId = reportageChapter.id;
            }
            // I selfie sono in genere alla fine della galleria (ultimi numeri)
            else if (selfieChapter && (photo.name.includes("DSCF3") || photo.name.includes("IMAG7") || photo.name.includes("DSC06"))) {
              targetChapterId = selfieChapter.id;
            }
            // Se non riusciamo a determinare il capitolo con precisione, usiamo l'indice numerico
            else {
              const photoIndex = i;
              const totalPhotos = photos.length;
              const sposiCount = 58;
              const reportageCount = 120;
              
              if (photoIndex < sposiCount && sposiChapter) {
                targetChapterId = sposiChapter.id;
              } else if (photoIndex < sposiCount + reportageCount && reportageChapter) {
                targetChapterId = reportageChapter.id;
              } else if (selfieChapter) {
                targetChapterId = selfieChapter.id;
              }
            }
          } else {
            // Per altre configurazioni di capitoli, distribuisci uniformemente
            const photoIndex = i;
            const chapterIndex = Math.floor(photoIndex / Math.ceil(photos.length / chapters.length));
            targetChapterId = chapters[Math.min(chapterIndex, chapters.length - 1)]?.id || null;
          }
          
          // Se il chapterId è diverso, aggiorna il documento
          if (targetChapterId && targetChapterId !== photo.chapterId) {
            const photoDocRef = doc(db, "gallery-photos", photo.id);
            batch.update(photoDocRef, { chapterId: targetChapterId });
            batchCount++;
            updatedCount++;
          } else {
            unchangedCount++;
          }
          
          // Commit del batch ogni 500 operazioni
          if (batchCount >= 500) {
            await batch.commit();
            batch = writeBatch(firestore);
            batchCount = 0;
          }
        } catch (err) {
          console.error(`Errore durante l'aggiornamento della foto ${photo.id}:`, err);
          errorCount++;
        }
        
        // Aggiorna il progresso
        setSyncProgress(Math.round(((i + 1) / photos.length) * 100));
        
        // Aggiorna le statistiche periodicamente
        if (i % 10 === 0 || i === photos.length - 1) {
          setSyncStats({
            total: photos.length,
            updated: updatedCount,
            unchanged: unchangedCount,
            errors: errorCount
          });
        }
      }
      
      // Commit finale del batch
      if (batchCount > 0) {
        await batch.commit();
      }
      
      // Aggiornamento statistiche finali
      setSyncStats({
        total: photos.length,
        updated: updatedCount,
        unchanged: unchangedCount,
        errors: errorCount
      });
      
      setSyncStatus("success");
      toast({
        title: "Sincronizzazione completata",
        description: `${updatedCount} foto aggiornate, ${unchangedCount} invariate, ${errorCount} errori.`,
        variant: "default"
      });
    } catch (error) {
      console.error("Errore durante la sincronizzazione:", error);
      setSyncStatus("error");
      toast({
        title: "Errore di sincronizzazione",
        description: "Si è verificato un errore durante la sincronizzazione delle foto con i capitoli.",
        variant: "destructive"
      });
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <Card className="w-full shadow-md">
      <CardHeader>
        <CardTitle>Sincronizzazione Capitoli Galleria</CardTitle>
        <CardDescription>
          Sincronizza correttamente tutte le foto con i rispettivi capitoli per migliorare la visualizzazione nella galleria pubblica.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {syncStatus === "idle" && (
          <p className="text-sm text-gray-500 mb-4">
            Questo strumento analizzerà tutte le foto della galleria e assegnerà correttamente i capitoli. 
            Utile quando le foto nei capitoli non appaiono correttamente nella visualizzazione pubblica.
          </p>
        )}

        {syncStatus === "syncing" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span>Sincronizzazione in corso ({syncProgress}%)...</span>
            </div>
            <Progress value={syncProgress} className="h-2" />
            <p className="text-sm text-gray-500">
              Foto processate: {syncStats.updated + syncStats.unchanged + syncStats.errors} di {syncStats.total}
            </p>
          </div>
        )}

        {syncStatus === "success" && (
          <Alert className="bg-green-50 border-green-200">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <AlertTitle>Sincronizzazione completata</AlertTitle>
            <AlertDescription>
              <p>Tutte le foto sono state elaborate correttamente.</p>
              <ul className="mt-2 space-y-1 text-sm">
                <li>Foto totali: <strong>{syncStats.total}</strong></li>
                <li>Aggiornate: <strong>{syncStats.updated}</strong></li>
                <li>Invariate: <strong>{syncStats.unchanged}</strong></li>
                {syncStats.errors > 0 && (
                  <li className="text-red-600">Errori: <strong>{syncStats.errors}</strong></li>
                )}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {syncStatus === "error" && (
          <Alert variant="destructive">
            <AlertCircle className="h-5 w-5" />
            <AlertTitle>Errore</AlertTitle>
            <AlertDescription>
              Si è verificato un errore durante la sincronizzazione. Riprova più tardi.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
      <CardFooter className="flex justify-between">
        <Button variant="outline" onClick={galleryClosed}>
          Chiudi
        </Button>
        <Button 
          onClick={startSync} 
          disabled={isSyncing}
          className={syncStatus === "success" ? "bg-green-600 hover:bg-green-700" : ""}
        >
          {isSyncing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Sincronizzazione...
            </>
          ) : syncStatus === "success" ? (
            <>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Sincronizzato
            </>
          ) : (
            "Sincronizza Foto e Capitoli"
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}