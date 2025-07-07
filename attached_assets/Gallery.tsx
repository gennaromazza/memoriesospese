import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { collection, query, where, getDocs, doc, getDoc, addDoc, serverTimestamp, orderBy, limit, startAfter } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useStudio } from "@/context/StudioContext";
import { trackGalleryView } from "@/lib/analytics";
import { createUrl, createAbsoluteUrl } from "@/lib/basePath";
import Navigation from "@/components/Navigation";
import ImageLightbox from "@/components/ImageLightbox";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Photo } from "@shared/schema";
import { FloralCorner, FloralDivider, BackgroundDecoration } from '@/components/WeddingIllustrations';
import { WeddingImage, DecorativeImage } from '@/components/WeddingImages';

interface GalleryData {
  id: string;
  name: string;
  date: string;
  location: string;
  description?: string;
  coverImageUrl?: string;
  youtubeUrl?: string;
  hasChapters?: boolean;
}

// Non estendere da Photo ma definiamo i nostri campi
interface PhotoData {
  id: string;
  name: string;
  url: string;
  contentType: string;
  size: number;
  createdAt: any;
  chapterId?: string | null;
  chapterPosition?: number;
}

interface ChapterData {
  id: string;
  title: string;
  description?: string;
  position: number;
}

// Funzione per estrarre l'ID del video da un URL di YouTube
function getYouTubeVideoId(url: string): string {
  try {
    // Supporta vari formati di URL YouTube
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : "";
  } catch (error) {
    console.error("Errore nell'analisi dell'URL di YouTube:", error);
    return "";
  }
}

export default function Gallery() {
  const { id } = useParams();
  const [, navigate] = useLocation();
  const [gallery, setGallery] = useState<GalleryData | null>(null);
  const [photos, setPhotos] = useState<PhotoData[]>([]);
  const [chapters, setChapters] = useState<ChapterData[]>([]);
  const [activeTab, setActiveTab] = useState<string>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [hasMorePhotos, setHasMorePhotos] = useState(true);
  const [loadingMorePhotos, setLoadingMorePhotos] = useState(false);
  const [photosPerPage, setPhotosPerPage] = useState(20); // Carica 20 foto alla volta
  const { toast } = useToast();
  const { studioSettings } = useStudio();

  // Check authentication and fetch gallery data
  // Check if current user is admin
  const [isAdmin, setIsAdmin] = useState(false);
  
  // Assicuriamoci che activeTab sia impostato correttamente quando i capitoli cambiano
  useEffect(() => {
    if (chapters.length > 0 && (!activeTab || activeTab === '')) {
      setActiveTab('all');
    }
  }, [chapters, activeTab]);



  useEffect(() => {
    // Controlla se l'utente è un amministratore
    const checkAdmin = () => {
      const admin = localStorage.getItem('isAdmin') === 'true';
      setIsAdmin(admin);
    };
    
    checkAdmin();
  }, []);
  
  useEffect(() => {
    async function fetchGallery() {
      // Check if user is authenticated for this gallery or is admin
      const isAuth = localStorage.getItem(`gallery_auth_${id}`);
      if (!isAuth && !isAdmin) {
        navigate(createUrl(`/access/${id}`));
        return;
      }

      setIsLoading(true);
      try {
        // Fetch gallery
        const galleriesRef = collection(db, "galleries");
        const q = query(galleriesRef, where("code", "==", id));
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) {
          toast({
            title: "Galleria non trovata",
            description: "La galleria richiesta non esiste o è stata rimossa.",
            variant: "destructive",
          });
          navigate(createUrl("/"));
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
        
        // Fetch chapters if the gallery has them
        if (galleryData.hasChapters) {
          try {
            const chaptersRef = collection(db, "galleries", galleryDoc.id, "chapters");
            const chaptersQuery = query(chaptersRef, orderBy("position", "asc"));
            const chaptersSnapshot = await getDocs(chaptersQuery);
            
            if (!chaptersSnapshot.empty) {
              const chaptersData = chaptersSnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
              })) as ChapterData[];
              
              setChapters(chaptersData);
              console.log(`Caricati ${chaptersData.length} capitoli`);
            }
          } catch (chaptersError) {
            console.error("Errore nel caricamento dei capitoli:", chaptersError);
          }
        }
        
        // Fetch photos for the gallery with pagination
        const photosRef = collection(db, "galleries", galleryDoc.id, "photos");
        let photosQuery;
        
        // Create query based on hasChapters with pagination
        if (galleryData.hasChapters) {
          photosQuery = query(
            photosRef, 
            orderBy("chapterPosition", "asc"),
            limit(photosPerPage)
          );
        } else {
          photosQuery = query(
            photosRef,
            limit(photosPerPage)
          );
        }
        
        const photosSnapshot = await getDocs(photosQuery);
        
        let photosData = photosSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        })) as PhotoData[];
        
        // Controlla se ci sono altre foto da caricare
        setHasMorePhotos(photosData.length >= photosPerPage);
        
        // Se non ci sono foto nella sottocollezione "photos" ma è indicato che ci sono foto (photoCount > 0),
        // potrebbe essere che le foto siano state caricate nello Storage ma i metadati non siano stati salvati
        // in Firestore. In questo caso, tentiamo di recuperare le foto dallo Storage.
        if (photosData.length === 0 && galleryData.photoCount > 0) {
          console.log("Nessuna foto trovata nella sottocollezione, ma photoCount è", galleryData.photoCount);
          console.log("Tentativo di recupero dallo Storage...");
          
          try {
            // Importiamo ciò che serve da firebase/storage
            const { ref, listAll, getDownloadURL, getMetadata } = await import("firebase/storage");
            const { storage } = await import("@/lib/firebase");
            
            // Percorso nella cartella di Storage per questa galleria
            // Controlla prima il percorso diretto alla galleria
            const storageRef = ref(storage, `galleries/${galleryDoc.id}`);
            
            console.log("Verifico percorso Storage:", `galleries/${galleryDoc.id}`);
            
            // Elenca tutti i file nella cartella
            let listResult = await listAll(storageRef);
            
            // Se non ci sono file, prova percorsi alternativi
            if (listResult.items.length === 0) {
              console.log("Nessun file trovato, provo percorsi alternativi");
              
              // Prova con un possibile spazio nel path (come indicato dall'utente)
              const pathWithSpace = ref(storage, `galleries/ ${galleryDoc.id}`);
              console.log("Provo con path con spazio:", `galleries/ ${galleryDoc.id}`);
              try {
                const spaceResult = await listAll(pathWithSpace);
                if (spaceResult.items.length > 0) {
                  console.log("Trovate", spaceResult.items.length, "foto con path con spazio");
                  listResult = spaceResult;
                }
              } catch (e) {
                console.log("Errore con path con spazio:", e);
              }
            }
            
            // Se ancora non ci sono file e l'ID è quello specifico, prova direttamente con il path hardcoded
            if (listResult.items.length === 0 && galleryDoc.id === 'kWraDKOW7MZiM5eHSM11') {
              console.log("Provo con path hardcoded galleries/kWraDKOW7MZiM5eHSM11");
              try {
                const hardCodedRef = ref(storage, `galleries/kWraDKOW7MZiM5eHSM11`);
                const hardCodedResult = await listAll(hardCodedRef);
                if (hardCodedResult.items.length > 0) {
                  console.log("Trovate", hardCodedResult.items.length, "foto con path hardcoded");
                  listResult = hardCodedResult;
                }
              } catch (e) {
                console.log("Errore con path hardcoded:", e);
              }
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
              photosFromStorage.forEach(async (photo) => {
                try {
                  await addDoc(photosRef, {
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
  }, [id]);

  const openLightbox = (index: number) => {
    setCurrentPhotoIndex(index);
    setLightboxOpen(true);
  };

  const closeLightbox = () => {
    setLightboxOpen(false);
  };

  const handleSignOut = () => {
    localStorage.removeItem(`gallery_auth_${id}`);
    navigate(createUrl("/"));
  };
  
  // Funzione per caricare più foto quando l'utente scorre verso il basso
  const loadMorePhotos = useCallback(async () => {
    if (!gallery || !hasMorePhotos || loadingMorePhotos) return;
    
    setLoadingMorePhotos(true);
    try {
      const photosRef = collection(db, "galleries", gallery.id, "photos");
      let photosQuery;
      
      // Create query based on hasChapters with pagination and startAfter
      if (gallery.hasChapters) {
        // Se ci sono capitoli, ordinare per posizione nel capitolo
        // Usa startAfter per caricare dalla foto successiva all'ultima caricata
        if (photos.length > 0) {
          const lastPhoto = photos[photos.length - 1];
          const lastPhotoRef = doc(db, "galleries", gallery.id, "photos", lastPhoto.id);
          const lastPhotoDoc = await getDoc(lastPhotoRef);
          
          photosQuery = query(
            photosRef, 
            orderBy("chapterPosition", "asc"),
            startAfter(lastPhotoDoc),
            limit(photosPerPage)
          );
        } else {
          photosQuery = query(
            photosRef, 
            orderBy("chapterPosition", "asc"),
            limit(photosPerPage)
          );
        }
      } else {
        // Se non ci sono capitoli, usa l'ID come ordinamento predefinito o un altro campo adeguato
        if (photos.length > 0) {
          const lastPhoto = photos[photos.length - 1];
          const lastPhotoRef = doc(db, "galleries", gallery.id, "photos", lastPhoto.id);
          const lastPhotoDoc = await getDoc(lastPhotoRef);
          
          photosQuery = query(
            photosRef,
            startAfter(lastPhotoDoc),
            limit(photosPerPage)
          );
        } else {
          photosQuery = query(
            photosRef,
            limit(photosPerPage)
          );
        }
      }
      
      const photosSnapshot = await getDocs(photosQuery);
      
      if (!photosSnapshot.empty) {
        const newPhotosData = photosSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        })) as PhotoData[];
        
        // Aggiungi le nuove foto all'array esistente
        setPhotos(prevPhotos => [...prevPhotos, ...newPhotosData]);
        
        // Verifica se ci sono ancora altre foto da caricare
        setHasMorePhotos(newPhotosData.length >= photosPerPage);
      } else {
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
  }, [gallery, hasMorePhotos, loadingMorePhotos, photos, photosPerPage, toast]);

  // Effetto per caricare più foto quando l'utente scorre vicino alla fine della pagina
  useEffect(() => {
    const handleScroll = () => {
      // Calcola se l'utente ha scrollato fino a un certo punto vicino al fondo (es. 300px dal fondo)
      if (
        window.innerHeight + window.scrollY >= document.body.offsetHeight - 300 &&
        hasMorePhotos && 
        !loadingMorePhotos &&
        !isLoading
      ) {
        loadMorePhotos();
      }
    };
    
    window.addEventListener('scroll', handleScroll);
    
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, [hasMorePhotos, loadingMorePhotos, isLoading, loadMorePhotos]);
  
  // Display loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-off-white">
        <Navigation galleryOwner="Caricamento..." />
        <div className="py-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <Skeleton className="h-10 w-80 mb-2" />
            <Skeleton className="h-6 w-60 mb-8" />
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8">
              {[...Array(9)].map((_, i) => (
                <Skeleton key={i} className="h-64 rounded-lg" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!gallery) {
    return (
      <div className="min-h-screen bg-off-white flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-blue-gray font-playfair mb-4">
            Galleria non disponibile
          </h2>
          <p className="text-gray-600 mb-6">
            La galleria richiesta non è disponibile o è stata rimossa.
          </p>
          <button
            onClick={() => navigate(createUrl("/"))}
            className="px-4 py-2 rounded-md btn-primary"
          >
            Torna alla Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-off-white">
      <Navigation galleryOwner={gallery.name.split(' - ')[0]} />

      {/* Hero Section */}
      <div className="relative w-full overflow-hidden">
        
        {gallery.coverImageUrl ? (
          <div className="w-full h-64 md:h-96 overflow-hidden">
            <img 
              src={gallery.coverImageUrl} 
              alt={`Copertina per ${gallery.name}`}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
          </div>
        ) : (
          <div className="w-full h-64 md:h-80 bg-gradient-to-b from-sage/20 to-sage/5 flex items-center justify-center relative">
            <div className="md:w-72 w-60 h-auto">
              <DecorativeImage type="standing" alt={`Immagine coppia di sposi per ${gallery.name}`} />
            </div>
          </div>
        )}
        
        <div className={`absolute bottom-0 left-0 right-0 p-6 ${gallery.coverImageUrl ? 'text-white' : ''}`}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h1 className={`text-3xl md:text-4xl font-bold leading-tight font-playfair ${gallery.coverImageUrl ? 'drop-shadow-md text-white' : 'text-blue-gray'}`}>
              {gallery.name}
            </h1>
            <p className={`mt-2 ${gallery.coverImageUrl ? 'text-gray-200 drop-shadow' : 'text-gray-500'}`}>
              {gallery.date} • {gallery.location}
            </p>
          </div>
        </div>
      </div>

      <div className="py-10 pt-6">
        
        {/* Descrizione della galleria se presente */}
        {gallery.description && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-8">
            <div className="bg-white p-6 rounded-lg shadow-sm">
              <p className="text-gray-700 italic">{gallery.description}</p>
            </div>
          </div>
        )}
        
        {/* Video YouTube se presente */}
        {gallery.youtubeUrl && gallery.youtubeUrl.trim() !== "" && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-8">
            <div className="bg-white p-6 rounded-lg shadow-sm">
              <h3 className="text-lg font-semibold mb-4">Video del matrimonio</h3>
              <div className="relative w-full pb-[56.25%]">
                <iframe 
                  src={`https://www.youtube.com/embed/${getYouTubeVideoId(gallery.youtubeUrl)}`}
                  title="Video del matrimonio"
                  className="absolute top-0 left-0 w-full h-full rounded-lg"
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                ></iframe>
              </div>
            </div>
          </div>
        )}
        
        <main>
          <div className="max-w-7xl mx-auto sm:px-6 lg:px-8">
            <div className="px-4 py-4">
              {photos.length === 0 ? (
                <div className="text-center py-12">
                  <div className="flex flex-col items-center">
                    <div className="w-48 h-48 mb-6">
                      <WeddingImage type="heart-balloon" alt="Immagine decorativa di sposi" className="w-full h-auto opacity-40" />
                    </div>
                    <h3 className="text-xl font-playfair text-blue-gray mb-2">
                      Nessuna foto disponibile
                    </h3>
                    <p className="text-gray-500">
                      Non ci sono ancora foto in questa galleria.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  {gallery.hasChapters && chapters.length > 0 ? (
                    <Tabs defaultValue="all" value={activeTab} onValueChange={setActiveTab} className="w-full mb-8">
                      <div className="mb-8 border-b border-sage/20">
                        <TabsList className="relative mb-0 flex overflow-x-auto pb-0 bg-transparent gap-2 scrollbar-thin scrollbar-thumb-sage/20 scrollbar-track-transparent">
                          <TabsTrigger 
                            value="all" 
                            className="flex-shrink-0 text-blue-gray/70 bg-sage/5 data-[state=active]:bg-sage/10 data-[state=active]:text-sage-700 hover:text-sage-700 rounded-t-lg border-b-2 border-transparent data-[state=active]:border-sage-500 transition-all px-6 py-2.5 font-medium"
                          >
                            Tutte le foto ({photos.length})
                          </TabsTrigger>
                          
                          <TabsTrigger 
                            value="unassigned" 
                            className="flex-shrink-0 text-blue-gray/70 bg-sage/5 data-[state=active]:bg-sage/10 data-[state=active]:text-sage-700 hover:text-sage-700 rounded-t-lg border-b-2 border-transparent data-[state=active]:border-sage-500 transition-all px-6 py-2.5 font-medium"
                          >
                            Non assegnate ({photos.filter(p => !p.chapterId).length})
                          </TabsTrigger>
                          
                          {chapters.map(chapter => (
                            <TabsTrigger 
                              key={chapter.id} 
                              value={chapter.id} 
                              className="flex-shrink-0 text-blue-gray/70 bg-sage/5 data-[state=active]:bg-sage/10 data-[state=active]:text-sage-700 hover:text-sage-700 rounded-t-lg border-b-2 border-transparent data-[state=active]:border-sage-500 transition-all px-6 py-2.5 font-medium"
                            >
                              {chapter.title} ({photos.filter(p => p.chapterId === chapter.id).length})
                            </TabsTrigger>
                          ))}
                        </TabsList>
                        <div className="h-0.5 w-full bg-gradient-to-r from-sage/30 via-sage/50 to-sage/30"></div>
                      </div>
                      
                      <TabsContent value="all" className="space-y-6">
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-4 lg:gap-6">
                          {photos.map((photo, index) => (
                            <div
                              key={photo.id}
                              className="gallery-image h-40 sm:h-52 lg:h-64"
                              onClick={() => openLightbox(photos.findIndex(p => p.id === photo.id))}
                            >
                              <img
                                src={photo.url}
                                alt={photo.name || `Foto ${index + 1}`}
                                className="w-full h-full object-cover transition-opacity duration-300 opacity-0 hover:opacity-95"
                                loading="lazy"
                                onLoad={(e) => {
                                  // Imposta l'opacità a 1 quando l'immagine è caricata
                                  (e.target as HTMLImageElement).classList.replace('opacity-0', 'opacity-100');
                                }}
                                style={{ 
                                  backgroundColor: '#f3f4f6',
                                  objectFit: 'cover',
                                }}
                              />
                            </div>
                          ))}
                        </div>
                      </TabsContent>
                      
                      <TabsContent value="unassigned" className="space-y-6">
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-4 lg:gap-6">
                          {photos.filter(p => !p.chapterId).map((photo, index) => (
                            <div
                              key={photo.id}
                              className="gallery-image h-40 sm:h-52 lg:h-64"
                              onClick={() => openLightbox(photos.findIndex(p => p.id === photo.id))}
                            >
                              <img
                                src={photo.url}
                                alt={photo.name || `Foto ${index + 1}`}
                                className="w-full h-full object-cover transition-opacity duration-300 opacity-0 hover:opacity-95"
                                loading="lazy"
                                onLoad={(e) => {
                                  // Imposta l'opacità a 1 quando l'immagine è caricata
                                  (e.target as HTMLImageElement).classList.replace('opacity-0', 'opacity-100');
                                }}
                                style={{ 
                                  backgroundColor: '#f3f4f6',
                                  objectFit: 'cover',
                                }}
                              />
                            </div>
                          ))}
                        </div>
                      </TabsContent>
                      
                      {chapters.map(chapter => (
                        <TabsContent key={chapter.id} value={chapter.id} className="space-y-4">
                          {chapter.description && (
                            <p className="text-blue-gray italic mb-4 md:mb-6 text-sm md:text-base">{chapter.description}</p>
                          )}
                          
                          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-4 lg:gap-6">
                            {photos.filter(p => p.chapterId === chapter.id).map((photo, index) => (
                              <div
                                key={photo.id}
                                className="gallery-image h-40 sm:h-52 lg:h-64"
                                onClick={() => openLightbox(photos.findIndex(p => p.id === photo.id))}
                              >
                                <img
                                  src={photo.url}
                                  alt={photo.name || `Foto ${index + 1}`}
                                  className="w-full h-full object-cover transition-opacity duration-300 opacity-0 hover:opacity-95"
                                  loading="lazy"
                                  onLoad={(e) => {
                                    // Imposta l'opacità a 1 quando l'immagine è caricata
                                    (e.target as HTMLImageElement).classList.replace('opacity-0', 'opacity-100');
                                  }}
                                  style={{ 
                                    backgroundColor: '#f3f4f6',
                                    objectFit: 'cover',
                                  }}
                                />
                              </div>
                            ))}
                          </div>
                          
                          {photos.filter(p => p.chapterId === chapter.id).length === 0 && (
                            <div className="text-center py-8">
                              <div className="flex flex-col items-center">
                                <div className="w-32 h-32 mb-4">
                                  <WeddingImage type="wedding-cake" alt="Immagine decorativa torta nuziale" className="w-full h-auto opacity-30" />
                                </div>
                                <p className="text-gray-500 italic">Nessuna foto in questo capitolo</p>
                              </div>
                            </div>
                          )}
                        </TabsContent>
                      ))}
                    </Tabs>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8">
                      {photos.map((photo, index) => (
                        <div
                          key={photo.id}
                          className="gallery-image h-52 sm:h-64"
                          onClick={() => openLightbox(index)}
                        >
                          <img
                            src={photo.url}
                            alt={photo.name || `Foto ${index + 1}`}
                            className="w-full h-full object-cover transition-opacity duration-300 opacity-0 hover:opacity-95"
                            loading="lazy"
                            onLoad={(e) => {
                              // Imposta l'opacità a 1 quando l'immagine è caricata
                              (e.target as HTMLImageElement).classList.replace('opacity-0', 'opacity-100');
                            }}
                            style={{ 
                              backgroundColor: '#f3f4f6',
                              objectFit: 'cover',
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {/* Pulsante "Carica altre foto" */}
                  {hasMorePhotos && (
                    <div className="w-full flex flex-col items-center mt-8 mb-4">
                      <div className="w-full max-w-xs h-8 opacity-20 mb-4">
                        <FloralDivider />
                      </div>
                      <button
                        onClick={loadMorePhotos}
                        disabled={loadingMorePhotos}
                        className="relative px-6 py-2.5 bg-sage text-white rounded-md shadow-sm hover:bg-sage-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed group"
                      >
                        {loadingMorePhotos ? (
                          <span className="flex items-center">
                            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Caricamento...
                          </span>
                        ) : (
                          <>
                            <span className="relative z-10">Carica altre foto</span>
                            <span className="absolute left-0 top-0 w-full h-full rounded-md overflow-hidden opacity-0 group-hover:opacity-10 transition-opacity">
                              <BackgroundDecoration />
                            </span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </main>
      </div>
      
      {/* Instagram Call to Action */}
      <div className="bg-blue-gray/5 border-t border-blue-gray/10 py-12 mt-10 relative overflow-hidden">
        {/* Decorazioni */}
        <FloralCorner position="bottom-left" className="absolute bottom-0 left-0 w-32 h-32 opacity-10 pointer-events-none" />
        <FloralCorner position="bottom-right" className="absolute bottom-0 right-0 w-32 h-32 opacity-10 pointer-events-none" />
        <div className="absolute inset-0 opacity-5 pointer-events-none">
          <BackgroundDecoration />
        </div>
        
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="w-full max-w-xs mx-auto h-10 opacity-20 mb-8">
            <FloralDivider />
          </div>
          
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="text-center md:text-left flex md:flex-row flex-col items-center gap-6">
              <div className="md:w-32 w-24 h-auto flex-shrink-0 order-1 md:order-none mb-4 md:mb-0">
                <WeddingImage type="flower-bouquet" className="w-full h-auto opacity-70" />
              </div>
              <div>
                <h3 className="text-xl font-playfair text-blue-gray font-medium mb-2">Ti sono piaciute queste foto?</h3>
                <p className="text-gray-600 max-w-lg">
                  Segui il nostro profilo Instagram per vedere altri momenti speciali come quelli del matrimonio e restare aggiornato sui nostri servizi fotografici.
                </p>
              </div>
            </div>
            
            <div className="flex items-center space-x-2">
              <a 
                href={studioSettings.socialLinks.instagram ? 
                  (studioSettings.socialLinks.instagram.startsWith('http') ? 
                    studioSettings.socialLinks.instagram : 
                    `https://instagram.com/${studioSettings.socialLinks.instagram}`) 
                  : '#'} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="group relative flex items-center space-x-2 px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-md hover:from-purple-600 hover:to-pink-600 transition-all shadow-sm overflow-hidden"
              >
                <span className="absolute inset-0 opacity-0 group-hover:opacity-20 transition-opacity">
                  <BackgroundDecoration />
                </span>
                <svg className="w-5 h-5 mr-2 relative z-10" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                </svg>
                <span className="relative z-10">Seguici su Instagram</span>
              </a>
            </div>
          </div>
          
          <div className="mt-12 pt-6 border-t border-gray-200 text-center text-gray-500 text-sm">
            <div className="w-20 h-20 mx-auto mb-4">
              <WeddingImage type="flower-bouquet" className="w-full h-auto opacity-20" />
            </div>
            <p>© {new Date().getFullYear()} {studioSettings.name}. Tutti i diritti riservati.</p>
            <p className="mt-2">
              <span>{studioSettings.address} | Tel: {studioSettings.phone} | Email: {studioSettings.email}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Photo Lightbox */}
      <ImageLightbox
        isOpen={lightboxOpen}
        onClose={closeLightbox}
        photos={photos.map(photo => ({
          id: photo.id,
          name: photo.name,
          url: photo.url,
          size: photo.size || 0,
          contentType: photo.contentType,
          createdAt: photo.createdAt || new Date()
        }))}
        initialIndex={currentPhotoIndex}
      />
    </div>
  );
}
