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
  hasChapters?: boolean;
}

export interface PhotoData {
  id: string;
  name: string;
  url: string;
  contentType: string;
  size: number;
  createdAt: any;
  chapterId?: string | null;
  chapterPosition?: number;
}

export interface ChapterData {
  id: string;
  title: string;
  description?: string;
  position: number;
}

export function useGalleryData(galleryCode: string) {
  const [gallery, setGallery] = useState<GalleryData | null>(null);
  const [photos, setPhotos] = useState<PhotoData[]>([]);
  const [chapters, setChapters] = useState<ChapterData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasMorePhotos, setHasMorePhotos] = useState(true);
  const [loadingMorePhotos, setLoadingMorePhotos] = useState(false);
  const [photosPerPage, setPhotosPerPage] = useState(50); // Aumentato a 50 foto per volta per caricamento più veloce
  const [totalPhotoCount, setTotalPhotoCount] = useState(0); // Conteggio totale foto
  const [loadedPhotoCount, setLoadedPhotoCount] = useState(0); // Conteggio foto caricate
  const [loadingProgress, setLoadingProgress] = useState(0); // Percentuale di caricamento
  const { toast } = useToast();

  // Funzione per caricare le foto della galleria
  const loadPhotos = async (galleryId: string, galleryData: any) => {
    // Utilizza la collezione gallery-photos per cercare le foto
    const photosRef = collection(db, "gallery-photos");

    // Prima determiniamo il numero totale di foto per questa galleria
    try {
      const countQuery = query(
        photosRef,
        where("galleryId", "==", galleryId)
      );
      const countSnapshot = await getDocs(countQuery);
      const actualPhotoCount = countSnapshot.docs.length;
      
      setTotalPhotoCount(actualPhotoCount);
      console.log(`Conteggio totale foto nella galleria: ${actualPhotoCount}`);
      
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
      
      // Carichiamo tutte le foto
      const allPhotosSnapshot = await getDocs(countQuery);
      
      // Converti i documenti in oggetti PhotoData
      let photosData = allPhotosSnapshot.docs.map((doc, index) => {
        const data = doc.data();
        
        // Aggiorna il progresso di caricamento
        if (index % 10 === 0) { // Aggiorna il progresso ogni 10 foto per performance
          const progress = Math.round((index / actualPhotoCount) * 100);
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

      // Ordina le foto per capitolo e posizione se la galleria ha capitoli
      if (galleryData.hasChapters && photosData.length > 0) {
        // Ottieni l'ordine dei capitoli
        const chaptersRef = collection(db, "galleries", galleryId, "chapters");
        const chaptersQuery = query(chaptersRef, orderBy("position", "asc"));
        const chaptersSnapshot = await getDocs(chaptersQuery);
        const chapterOrder = new Map(
          chaptersSnapshot.docs.map((doc, index) => [doc.id, index])
        );

        photosData.sort((a, b) => {
          // Prima ordina per posizione del capitolo
          const posA = chapterOrder.get(a.chapterId || '') ?? Number.MAX_VALUE;
          const posB = chapterOrder.get(b.chapterId || '') ?? Number.MAX_VALUE;
          if (posA !== posB) return posA - posB;
          
          // Poi per posizione nel capitolo
          return (a.chapterPosition || 0) - (b.chapterPosition || 0);
        });
      }

      // Non c'è bisogno di paginare il caricamento iniziale poiché carichiamo tutto subito
      setHasMorePhotos(false);
      
      // Settiamo le foto
      setPhotos(photosData);
    } catch (error) {
      console.error("Errore durante il recupero delle foto:", error);
      // In caso di errore, proviamo comunque a caricare dallo Storage
      await checkAndLoadFromStorage(galleryId, galleryCode);
    }
  };
  
  // Funzione helper per verificare e caricare dallo storage se necessario
  const checkAndLoadFromStorage = async (galleryId: string, galleryCode: string) => {
    console.log("Tentativo di recupero dallo Storage...");

    try {
      // Importiamo ciò che serve da firebase/storage
      const { ref, listAll, getDownloadURL, getMetadata } = await import("firebase/storage");
      const { storage } = await import("@/lib/firebase");

      // Usa direttamente l'ID della galleria come riferimento principale
      console.log("Tentativo di recupero delle foto per galleryId:", galleryId);

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

        // Per ogni file, recupera l'URL di download e i metadati
        const photoPromises = listResult.items.map(async (itemRef) => {
          const url = await getDownloadURL(itemRef);
          const metadata = await getMetadata(itemRef);

          // Crea oggetto foto
          return {
            id: itemRef.name, // Usa il nome del file come ID
            name: itemRef.name,
            url: url,
            contentType: metadata.contentType || 'image/jpeg',
            size: metadata.size || 0,
            createdAt: metadata.timeCreated || new Date().toISOString()
          };
        });

        // Attendiamo tutte le promise
        const photosFromStorage = await Promise.all(photoPromises);

        // Aggiorniamo i dati delle foto
        if (photosFromStorage.length > 0) {
          photosData = photosFromStorage;
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
    }

    setPhotos(photosData);
  };

  // Carica i dati della galleria
  useEffect(() => {
    if (!galleryCode) {
      setIsLoading(false);
      return;
    }

    async function fetchGallery() {
      setIsLoading(true);
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
      const lastPhoto = photos[photos.length - 1];
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
    loadMorePhotos
  };
}