import { useState, useEffect, useCallback } from "react";
import { collection, query, where, getDocs, doc, getDoc, addDoc, updateDoc, serverTimestamp, orderBy, limit, startAfter } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import { trackGalleryView } from "@/lib/analytics";

// Tipi dati 
export interface GalleryData {
  id: string;
  name: string;
  date: string;
  location: string;
  description?: string;
  coverImageUrl?: string;
  youtubeUrl?: string;
  photoCount?: number;
}

export interface PhotoData {
  id: string;
  name: string;
  url: string;
  contentType: string;
  size: number;
  createdAt: any;
  galleryId?: string;
}

export function useGalleryData(galleryCode: string) {
  const [gallery, setGallery] = useState<GalleryData | null>(null);
  const [photos, setPhotos] = useState<PhotoData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasMorePhotos, setHasMorePhotos] = useState(true);
  const [loadingMorePhotos, setLoadingMorePhotos] = useState(false);
  const [photosPerPage, setPhotosPerPage] = useState(50); // Aumentato a 50 foto per volta per caricamento più veloce
  const [totalPhotoCount, setTotalPhotoCount] = useState(0); // Conteggio totale foto
  const [loadedPhotoCount, setLoadedPhotoCount] = useState(0); // Conteggio foto caricate
  const [loadingProgress, setLoadingProgress] = useState(0); // Percentuale di caricamento
  const { toast } = useToast();

  // Funzione helper per verificare e caricare dallo storage se necessario
  const checkAndLoadFromStorage = async (galleryId: string, galleryCode: string) => {
    console.log("Tentativo di recupero dallo Storage...");

    try {
      // Importiamo ciò che serve da firebase/storage
      const { ref, listAll, getDownloadURL, getMetadata } = await import("firebase/storage");
      const { storage } = await import("@/lib/firebase");

      // Usa il percorso corretto per trovare le foto
      const possiblePaths = [
        `gallery-photos/${galleryId}`,
        `gallery-photos/${String(galleryId).toLowerCase()}`,
        `gallery-photos/${String(galleryId).toUpperCase()}`,
        `gallery-photos/${galleryCode}`,
        `gallery-photos/${String(galleryCode).toLowerCase()}`
      ];

      let listResult = null;

      // Prova tutti i percorsi possibili
      for (const path of possiblePaths) {
        if (listResult && listResult.items.length > 0) break;

        try {
          console.log("Verifico percorso Storage:", path);
          const pathRef = ref(storage, path);
          const result = await listAll(pathRef);

          if (result.items.length > 0) {
            console.log(`Trovate ${result.items.length} foto nel percorso ${path}`);
            listResult = result;
            break;
          }
        } catch (e) {
          console.log(`Percorso ${path} non valido:`, e);
        }
      }

      // Se non abbiamo ancora trovato foto, termina
      if (!listResult || listResult.items.length === 0) {
        console.log("Nessuna foto trovata dopo tutti i tentativi di percorso");
        return;
      }

      setTotalPhotoCount(listResult.items.length);

      // Per ogni file, recupera l'URL di download e i metadati
      const photoPromises = listResult.items.map(async (itemRef, index) => {
        // Aggiorna il progresso ogni 5 foto
        if (index % 5 === 0) {
          setLoadingProgress(Math.round((index / listResult!.items.length) * 100));
          setLoadedPhotoCount(index);
        }

        const url = await getDownloadURL(itemRef);
        const metadata = await getMetadata(itemRef);

        // Crea oggetto foto
        return {
          id: itemRef.name, // Usa il nome del file come ID
          name: itemRef.name,
          url: url,
          contentType: metadata.contentType || 'image/jpeg',
          size: metadata.size || 0,
          createdAt: metadata.timeCreated || new Date().toISOString(),
          galleryId: galleryId
        };
      });

      // Attendiamo tutte le promise
      const photosFromStorage = await Promise.all(photoPromises);
      setLoadedPhotoCount(photosFromStorage.length);
      setLoadingProgress(100);

      // Aggiorniamo i dati delle foto
      if (photosFromStorage.length > 0) {
        setPhotos(photosFromStorage);
        console.log("Recuperate", photosFromStorage.length, "foto dallo Storage");

        // Salvare i metadati in Firestore per usi futuri
        console.log("Salvando metadati delle foto in Firestore...");
        photosFromStorage.forEach(async (photo) => {
          try {
            await addDoc(collection(db, "gallery-photos"), {
              galleryId: galleryId,
              galleryCode: galleryCode,
              name: photo.name,
              url: photo.url,
              contentType: photo.contentType,
              size: photo.size,
              createdAt: serverTimestamp()
            });
            console.log("Salvati metadati in Firestore per", photo.name);
          } catch (err) {
            console.error("Errore nel salvare i metadati in Firestore:", err);
          }
        });
      }
    } catch (storageError) {
      console.error("Errore nel recupero dallo Storage:", storageError);
    }
  };

  // Funzione per caricare le foto della galleria
  const loadPhotos = async (galleryId: string, galleryData: any) => {
    // Utilizza la collezione gallery-photos per cercare le foto
    const photosRef = collection(db, "gallery-photos");

    // Prima determiniamo il numero totale di foto per questa galleria
    try {
      // Utilizziamo una query limitata con solo il campo galleryId per evitare duplicazioni
      // FIXME: C'è un problema grave con il conteggio delle foto. Limitiamo a 250 per evitare problemi.
      const countQuery = query(
        photosRef,
        where("galleryId", "==", galleryId),
        limit(250) // Limitiamo a 250 foto per galleria per evitare il problema dell'eccesso di foto
      );

      const countSnapshot = await getDocs(countQuery);

      // Estraiamo gli ID unici delle foto per avere un conteggio accurato
      // Conserviamo anche l'associazione originale chapterId per ogni foto
      const photoIdToChapterId = new Map();
      countSnapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data.chapterId) {
          photoIdToChapterId.set(doc.id, data.chapterId);
        }
      });

      // Inizializziamo il Set con gli ID unici delle foto
      const uniquePhotoIds = new Set(countSnapshot.docs.map(doc => doc.id));
      const actualPhotoCount = uniquePhotoIds.size;

      // Aggiungiamo informazioni sui capitoli ai metadati per debug
      console.log(`Foto con chapterId trovate: ${photoIdToChapterId.size} di ${actualPhotoCount} totali`);

      setTotalPhotoCount(actualPhotoCount);
      console.log(`Conteggio totale foto uniche nella galleria: ${actualPhotoCount}`);

      // Se c'è una discrepanza tra il photoCount salvato e quello effettivo
      if (galleryData.photoCount !== actualPhotoCount) {
        console.log(`Avviso: photoCount nella galleria (${galleryData.photoCount}) non corrisponde alle foto effettive (${actualPhotoCount})`);
        // Potremmo aggiornare il valore nella galleria, ma non lo facciamo per ora
      }

      // Se non ci sono foto, controlliamo lo storage
      if (actualPhotoCount === 0) {
        await checkAndLoadFromStorage(galleryId, galleryCode);
        return;
      }

      // Utilizziamo gli stessi risultati della query precedente senza fare un'altra richiesta

      // Converti i documenti in oggetti PhotoData assicurandoci di non avere duplicati
      const uniqueDocsMap = new Map();
      let duplicateCount = 0;

      // Primo passaggio: prendiamo solo una copia di ciascun documento per ID
      countSnapshot.docs.forEach(doc => {
        const data = doc.data();
        const photoId = doc.id;

        // Dopo la modifica, stiamo erroneamente usando uniquePhotoIds due volte
        // Correggiamo rendendola incondizionale
        uniqueDocsMap.set(photoId, {
          id: photoId,
          ...data
        });
        
        // Conserviamo questo solo per debug/statistiche
        if (uniquePhotoIds.has(photoId)) {
          duplicateCount++;
          console.warn(`Duplicate photo found: ${photoId}`);
        }
      });

      // Usiamo uniqueDocsMap.size come riferimento per il numero di foto uniche trovate
      const uniquePhotosCount = uniqueDocsMap.size;
      console.log(`Foto uniche nel secondo conteggio: ${uniquePhotosCount}`);

      console.log(`Found ${duplicateCount} duplicate photos`);

      // Secondo passaggio: convertiamo i documenti unici in oggetti PhotoData
      let photosData = Array.from(uniqueDocsMap.values()).map((doc, index) => {
        const data = doc.data();

        // Aggiorna il progresso di caricamento
        if (index % 5 === 0) { // Aggiorna il progresso ogni 5 foto per più feedback visivo
          const progress = Math.round((index / uniquePhotosCount) * 100);
          setLoadingProgress(progress);
          setLoadedPhotoCount(index);
        }

        return {
          id: doc.id,
          ...data,
        } as PhotoData;
      });

      // Aggiorniamo il contatore finale
      setLoadedPhotoCount(photosData.length);
      setLoadingProgress(100);

      console.log(`Caricate ${photosData.length} foto da Firestore`);

      // Ordina le foto per data di creazione
      if (photosData.length > 0) {
        photosData.sort((a, b) => {
          // Ordina per data di creazione
          return a.createdAt?.seconds - b.createdAt?.seconds;
        });
      }

      // Non c'è bisogno di paginare il caricamento iniziale poiché carichiamo tutto subito
      setHasMorePhotos(false);

      // Eliminiamo i duplicati in base all'ID prima di impostare le foto
      const uniquePhotos = Array.from(
        new Map(photosData.map(photo => [photo.id, photo])).values()
      );
      console.log(`Rimozione duplicati: da ${photosData.length} a ${uniquePhotos.length} foto uniche`);

      // Verifica duplicati e log
      const photoIds = new Set();
      const trueUniques = uniquePhotos.filter(photo => {
        if (photoIds.has(photo.id)) {
          console.warn(`Trovato duplicato: ${photo.id}`);
          return false;
        }
        photoIds.add(photo.id);
        return true;
      });

      console.log(`Foto dopo rimozione duplicati: ${trueUniques.length}`);
      setPhotos(trueUniques);
    } catch (error) {
      console.error("Errore durante il recupero delle foto:", error);
      // In caso di errore, proviamo comunque a caricare dallo Storage
      await checkAndLoadFromStorage(galleryId, galleryCode);
    }
  };

  // Carica i dati della galleria
  useEffect(() => {
    if (!galleryCode) {
      setIsLoading(false);
      return;
    }

    async function fetchGallery() {
      setIsLoading(true);
      setLoadingProgress(0);
      setTotalPhotoCount(0);
      setLoadedPhotoCount(0);
      try {
        // Fetch gallery
        const galleriesRef = collection(db, "galleries");
        const q = query(galleriesRef, where("code", "==", galleryCode));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
          toast({
            title: "Galleria non trovata",
            description: "La galleria richiesta non esiste o è stata rimossa.",
            variant: "destructive",
          });
          setIsLoading(false);
          return;
        }

        const galleryDoc = querySnapshot.docs[0];
        const galleryData = galleryDoc.data();
        setGallery({
          id: galleryDoc.id,
          name: galleryData.name,
          date: galleryData.date,
          location: galleryData.location,
          description: galleryData.description || "",
          coverImageUrl: galleryData.coverImageUrl || "",
          youtubeUrl: galleryData.youtubeUrl || "",
          hasChapters: galleryData.hasChapters || false
        });

        // Cerchiamo sempre i capitoli, indipendentemente dal flag hasChapters
        console.log("Cerco capitoli per galleria ID:", galleryDoc.id);
        try {
          const chaptersRef = collection(db, "galleries", galleryDoc.id, "chapters");
          const chaptersQuery = query(chaptersRef, orderBy("position", "asc"));
          const chaptersSnapshot = await getDocs(chaptersQuery);

          if (!chaptersSnapshot.empty) {
            const chaptersData = chaptersSnapshot.docs.map(doc => {
              const data = doc.data();
              console.log(`Capitolo caricato - ID: ${doc.id}, Titolo: ${data.title || 'Senza titolo'}`, data);
              return {
                id: doc.id,
                title: data.title || 'Senza titolo',
                description: data.description || '',
                position: data.position || 0
              };
            }) as ChapterData[];

            // Aggiorniamo hasChapters nella gallery locale se troviamo capitoli
            const hasChapters = chaptersData.length > 0;
            if (hasChapters !== galleryData.hasChapters) {
              setGallery(prev => prev ? {...prev, hasChapters} : null);

              // Aggiorniamo anche il documento in Firestore
              try {
                const galleryRef = doc(db, "galleries", galleryDoc.id);
                await updateDoc(galleryRef, {
                  hasChapters
                });
                console.log(`Aggiornato stato hasChapters della galleria a ${hasChapters}`);
              } catch (updateError) {
                console.error("Errore nell'aggiornamento di hasChapters:", updateError);
              }
            }

            // Ordina i capitoli per posizione
            const sortedChapters = chaptersData.sort((a, b) => a.position - b.position);
            setChapters(sortedChapters);
            console.log(`Caricati ${sortedChapters.length} capitoli ordinati per posizione`);
          } else {
            console.log("Nessun capitolo trovato per questa galleria");
          }
        } catch (chaptersError) {
          console.error("Errore nel caricamento dei capitoli:", chaptersError);
        }

        // Fetch photos for the gallery with pagination
        await loadPhotos(galleryDoc.id, galleryData);
      } catch (error) {
        console.error("Error fetching gallery:", error);
        toast({
          title: "Errore",
          description: "Si è verificato un errore nel caricamento della galleria.",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    }

    fetchGallery();
  }, [galleryCode]);

  // Funzione per caricare più foto
  const loadMorePhotos = useCallback(async () => {
    if (!gallery || !hasMorePhotos || loadingMorePhotos) return;

    setLoadingMorePhotos(true);
    console.log(`Caricamento altre foto per galleria ${gallery.id}, già caricate: ${photos.length}`);

    try {
      // Utilizziamo un approccio diverso che garantisce di non recuperare duplicati
      const photosRef = collection(db, "gallery-photos");

      // Query per ottenere le foto della galleria che non abbiamo ancora
      const photosQuery = query(
        photosRef,
        where("galleryId", "==", gallery.id)
      );

      const allPhotosSnapshot = await getDocs(photosQuery);
      console.log(`Trovate ${allPhotosSnapshot.docs.length} foto totali per questa galleria`);

      // Creiamo un set con gli ID delle foto già caricate per evitare duplicati
      const existingPhotoIds = new Set(photos.map(p => p.id));
      console.log(`Set di ID foto già caricate: ${existingPhotoIds.size}`);

      // Filtriamo solo le foto che non abbiamo già caricato
      const newPhotos = allPhotosSnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(photo => !existingPhotoIds.has(photo.id)) as PhotoData[];

      console.log(`Foto nuove trovate: ${newPhotos.length}`);

      // Limitiamo il numero di foto da aggiungere in questa pagina
      const photosToAdd = newPhotos.slice(0, photosPerPage);

      if (photosToAdd.length > 0) {
        console.log(`Aggiungo ${photosToAdd.length} nuove foto`);

        // Aggiungiamo le nuove foto e manteniamo l'ordinamento appropriato
        setPhotos(prevPhotos => {
          // Doppio controllo per assicurarci di non avere duplicati
          const prevIds = new Set(prevPhotos.map(p => p.id));
          const uniquePhotosToAdd = photosToAdd.filter(p => !prevIds.has(p.id));

          console.log(`Foto effettivamente aggiunte dopo il filtro duplicati: ${uniquePhotosToAdd.length}`);

          const updatedPhotos = [...prevPhotos, ...uniquePhotosToAdd];

          // Ordiniamo le foto in base ai capitoli se necessario
          if (gallery.hasChapters) {
            return updatedPhotos.sort((a, b) => {
              // Prima ordiniamo per ID capitolo
              if (a.chapterId !== b.chapterId) {
                return (a.chapterId || '').localeCompare(b.chapterId || '');
              }
              // Poi per posizione all'interno del capitolo
              return (a.chapterPosition || 0) - (b.chapterPosition || 0);
            });
          }

          return updatedPhotos;
        });

        // Verifichiamo se ci sono ancora altre foto da caricare
        const hasMore = newPhotos.length > photosToAdd.length;
        setHasMorePhotos(hasMore);
        console.log(`Ci sono altre foto da caricare: ${hasMore}`);
      } else {
        console.log("Non ci sono più foto da caricare");
        setHasMorePhotos(false);
      }
    } catch (error) {
      console.error("Errore nel caricamento di altre foto:", error);
      toast({
        title: "Errore",
        description: "Si è verificato un errore nel caricamento di altre foto.",
        variant: "destructive",
      });
    } finally {
      setLoadingMorePhotos(false);
    }
  }, [gallery, hasMorePhotos, loadingMorePhotos, photos, photosPerPage]);

  // Utilizza trackGalleryView per tracciare la visualizzazione della galleria
  useEffect(() => {
    if (gallery) {
      trackGalleryView(gallery.id, gallery.name);
    }
  }, [gallery]);

  return { 
    gallery, 
    photos, 
    chapters, 
    isLoading, 
    hasMorePhotos, 
    loadingMorePhotos,
    loadMorePhotos,
    totalPhotoCount,
    loadedPhotoCount,
    loadingProgress
  };
}