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
  code?: string; // Aggiunto il codice galleria necessario per la condivisione
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
  const [photosPerPage, setPhotosPerPage] = useState(100); // Aumentato a 100 foto per volta per visualizzare più immagini
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

      let validPath = null;
      let allItems: any[] = [];

      // Prova tutti i percorsi possibili
      for (const path of possiblePaths) {
        if (validPath) break;

        try {
          console.log("Verifico percorso Storage:", path);
          const pathRef = ref(storage, path);
          const result = await listAll(pathRef);

          if (result.items.length > 0) {
            console.log(`Trovate ${result.items.length} foto nel percorso ${path}`);
            validPath = path;
            allItems = [...result.items];
            
            // Verifica anche se ci sono sottocartelle con più foto
            for (const prefix of result.prefixes) {
              try {
                console.log(`Verifica sottocartella: ${prefix.fullPath}`);
                const subResult = await listAll(prefix);
                console.log(`Trovate ${subResult.items.length} foto nella sottocartella ${prefix.fullPath}`);
                allItems = [...allItems, ...subResult.items];
              } catch (subErr) {
                console.warn(`Errore nell'elencare la sottocartella ${prefix.fullPath}:`, subErr);
              }
            }
            
            break;
          }
        } catch (e) {
          console.log(`Percorso ${path} non valido:`, e);
        }
      }

      // Se non abbiamo ancora trovato foto, termina
      if (!validPath || allItems.length === 0) {
        console.log("Nessuna foto trovata dopo tutti i tentativi di percorso");
        return false;
      }

      console.log(`Trovate in totale ${allItems.length} foto da caricare`);
      setTotalPhotoCount(allItems.length);

      // Limita il numero totale di foto da caricare inizialmente
      // Carica tutte le foto disponibili senza limiti
      console.log(`Preparazione del caricamento di ${allItems.length} foto...`);
      const photoPromises = allItems.map(async (itemRef, index) => {
        // Aggiorna il progresso ogni 5 foto
        if (index % 5 === 0) {
          setLoadingProgress(Math.round((index / allItems.length) * 100));
          setLoadedPhotoCount(index);
        }

        const url = await getDownloadURL(itemRef);
        const metadata = await getMetadata(itemRef);

        // Crea oggetto foto
        return {
          id: itemRef.name,
          name: itemRef.name,
          url: url,
          contentType: metadata.contentType || 'image/jpeg',
          size: metadata.size || 0,
          createdAt: metadata.timeCreated ? new Date(metadata.timeCreated) : new Date(),
          galleryId: galleryId
        };
      });

      const photoData = await Promise.all(photoPromises);
      
      // Ordina le foto per data di creazione (più recenti prima)
      photoData.sort((a, b) => {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

      // Una volta recuperati dati e foto dallo storage, aggiorna Firestore 
      // per sincronizzare i dati per le future visite
      try {
        for (const photo of photoData) {
          // Verifica se la foto esiste già nel database
          const existingPhotosQuery = query(
            collection(db, "photos"),
            where("url", "==", photo.url)
          );
          const existingPhotosSnapshot = await getDocs(existingPhotosQuery);

          if (existingPhotosSnapshot.empty) {
            // Aggiungi la foto al database se non esiste già
            await addDoc(collection(db, "photos"), {
              ...photo,
              createdAt: serverTimestamp()
            });
          }
        }

        // Aggiorna anche il conteggio delle foto nella galleria
        await updateDoc(doc(db, "galleries", galleryId), {
          photoCount: photoData.length,
          updatedAt: serverTimestamp()
        });

        console.log(`${photoData.length} foto sincronizzate con successo da Storage a Firestore`);

      } catch (dbError) {
        console.error("Errore nella sincronizzazione con Firestore:", dbError);
      }

      // Aggiorna lo stato con le foto trovate
      setPhotos(photoData);
      setHasMorePhotos(false); // Non ci sono altre foto da caricare
      setLoadingProgress(100);
      setLoadedPhotoCount(photoData.length);
      
      return photoData.length > 0;
    } catch (error) {
      console.error("Errore nel recupero dallo Storage:", error);
      return false;
    }
  };

  // Funzione per caricare le foto dalla galleria
  const loadPhotos = async (galleryId: string, galleryData: any) => {
    try {
      // Imposta il conteggio totale delle foto se disponibile nella galleria
      if (galleryData.photoCount) {
        setTotalPhotoCount(galleryData.photoCount);
      }

      console.log(`Caricamento foto per galleria ${galleryId} - Conteggio previsto: ${galleryData.photoCount || 'sconosciuto'}`);

      // Utilizziamo la collezione gallery-photos per trovare tutte le foto
      const photosRef = collection(db, "gallery-photos");
      const q = query(
        photosRef, 
        where("galleryId", "==", galleryId)
      );

      const querySnapshot = await getDocs(q);
      console.log(`Trovate ${querySnapshot.size} foto nel database per galleria ${galleryId}`);

      // Carica le foto dal database se disponibili
      let photosList: PhotoData[] = [];
      if (!querySnapshot.empty) {
        // Creiamo un set per tenere traccia dei nomi file già aggiunti (per evitare duplicati)
        const uniquePhotoNames = new Set<string>();
        
        querySnapshot.forEach((doc) => {
          const photoData = doc.data();
          const photoName = photoData.name || "";
          
          // Se il nome della foto non è già presente, aggiungila all'elenco
          if (!uniquePhotoNames.has(photoName)) {
            uniquePhotoNames.add(photoName);
            photosList.push({
              id: doc.id,
              name: photoData.name || "",
              url: photoData.url || "",
              contentType: photoData.contentType || "image/jpeg",
              size: photoData.size || 0,
              createdAt: photoData.createdAt,
              galleryId: photoData.galleryId
            });
          }
        });
      }

      // CORREZIONE DEL BUG: Controlla sempre lo storage per foto aggiuntive
      // Questo risolve il problema delle foto aggiunte che non vengono visualizzate
      console.log(`Database: ${photosList.length} foto, Previste: ${galleryData.photoCount || 0}`);
      
      // Se il numero di foto nel database è inferiore a quello previsto, sincronizza con lo storage
      const expectedPhotoCount = galleryData.photoCount || 0;
      if (photosList.length < expectedPhotoCount || querySnapshot.empty) {
        console.log("Sincronizzazione con Firebase Storage necessaria...");
        const foundInStorage = await checkAndLoadFromStorage(galleryId, galleryCode);
        
        if (foundInStorage) {
          // Dopo la sincronizzazione, ricarica dal database per ottenere tutte le foto
          const refreshQuery = await getDocs(q);
          photosList = []; // Reset della lista
          const refreshedPhotoNames = new Set<string>();
          
          refreshQuery.forEach((doc) => {
            const photoData = doc.data();
            const photoName = photoData.name || "";
            
            if (!refreshedPhotoNames.has(photoName)) {
              refreshedPhotoNames.add(photoName);
              photosList.push({
                id: doc.id,
                name: photoData.name || "",
                url: photoData.url || "",
                contentType: photoData.contentType || "image/jpeg",
                size: photoData.size || 0,
                createdAt: photoData.createdAt,
                galleryId: photoData.galleryId
              });
            }
          });
          
          console.log(`Dopo sincronizzazione: ${photosList.length} foto caricate`);
        }
        
        if (photosList.length === 0) {
          setHasMorePhotos(false);
          return;
        }
      }

      // Se abbiamo caricato meno foto del previsto, significa che non ce ne sono altre
      setHasMorePhotos(photosList.length >= photosPerPage);
      setPhotos(photosList);
      setLoadedPhotoCount(photosList.length);
      
      // Calcola la percentuale di foto caricate rispetto al totale
      if (galleryData.photoCount) {
        setLoadingProgress(Math.round((photosList.length / galleryData.photoCount) * 100));
      } else {
        setLoadingProgress(100); // Se non conosciamo il totale, consideriamo completato
      }
    } catch (error) {
      console.error("Error loading photos:", error);
      toast({
        title: "Errore",
        description: "Si è verificato un errore nel caricamento delle foto.",
        variant: "destructive",
      });
    }
  };

  // Effetto per caricare i dati della galleria quando cambia il codice
  useEffect(() => {
    setIsLoading(true);
    setPhotos([]); // Reset delle foto quando cambia la galleria
    setHasMorePhotos(true);
    setLoadingProgress(0);
    setLoadedPhotoCount(0);

    async function fetchGallery() {
      if (!galleryCode) {
        setIsLoading(false);
        return;
      }

      try {
        console.log("Caricamento galleria con codice:", galleryCode);
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
          youtubeUrl: galleryData.youtubeUrl || ""
        });
        
        console.log("Funzionalità capitoli rimossa");

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
      const lastPhoto = photos[photos.length - 1];
      
      // Se non abbiamo una foto precedente, usciamo
      if (!lastPhoto || !lastPhoto.createdAt) {
        setHasMorePhotos(false);
        setLoadingMorePhotos(false);
        return;
      }

      const photosRef = collection(db, "photos");
      const q = query(
        photosRef,
        where("galleryId", "==", gallery.id),
        orderBy("createdAt", "desc"),
        startAfter(lastPhoto.createdAt),
        limit(photosPerPage)
      );

      const querySnapshot = await getDocs(q);
      const newPhotos: PhotoData[] = [];

      querySnapshot.forEach((doc) => {
        const photoData = doc.data();
        newPhotos.push({
          id: doc.id,
          name: photoData.name || "",
          url: photoData.url || "",
          contentType: photoData.contentType || "image/jpeg",
          size: photoData.size || 0,
          createdAt: photoData.createdAt,
          galleryId: photoData.galleryId
        });
      });

      // Se abbiamo trovato meno foto del numero richiesto, significa che non ce ne sono altre
      if (newPhotos.length < photosPerPage) {
        setHasMorePhotos(false);
      }

      // Aggiunge le nuove foto all'array esistente
      setPhotos(prevPhotos => [
        ...prevPhotos,
        ...newPhotos
      ]);

      // Aggiorna il conteggio delle foto caricate
      setLoadedPhotoCount(prev => prev + newPhotos.length);
      
      // Aggiorna la percentuale di caricamento
      if (gallery.photoCount) {
        const newLoadedCount = photos.length + newPhotos.length;
        setLoadingProgress(Math.round((newLoadedCount / gallery.photoCount) * 100));
      }
    } catch (error) {
      console.error("Error loading more photos:", error);
      toast({
        title: "Errore",
        description: "Si è verificato un errore nel caricamento di altre foto.",
        variant: "destructive",
      });
    } finally {
      setLoadingMorePhotos(false);
    }
  }, [gallery, hasMorePhotos, loadingMorePhotos, photos, photosPerPage]);

  // Traccia la visita alla galleria
  useEffect(() => {
    if (gallery) {
      trackGalleryView(gallery.id, gallery.name);
    }
  }, [gallery]);

  return { 
    gallery, 
    photos, 
    isLoading, 
    hasMorePhotos, 
    loadingMorePhotos,
    loadMorePhotos,
    totalPhotoCount,
    loadedPhotoCount,
    loadingProgress
  };
}