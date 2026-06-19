import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
  memo, // Import memo for PhotoCard
} from "react";
import { useParams, useLocation } from "wouter";
import { createUrl } from "@/lib/basePath";
import { useStudio } from "@/context/StudioContext";
import Navigation from "@/components/Navigation";
import "@/styles/themes/natale.css";
import "@/styles/themes/carnevale.css";
import "@/styles/themes/san-valentino.css";
import "@/styles/themes/pasqua.css";
import "@/styles/themes/halloween.css";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import ImageLightbox from "@/components/ImageLightbox";
import { MasonryColumns } from "@/components/gallery/MasonryColumns";
import SelectionConfirmModal, { SelectedPhoto, PhotoWithNote } from "@/components/SelectionConfirmModal";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import GalleryHeader from "@/components/gallery/GalleryHeader";
import YouTubeEmbed from "@/components/gallery/YouTubeEmbed";
import GalleryFooter from "@/components/gallery/GalleryFooter";
import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import GalleryService from "@/lib/galleries";
import PhotoService, { Photo } from "@/lib/photos"; // 🔧 Import Photo type per allineamento tipi
import { queryClient } from "@/lib/queryClient";
import GalleryFilter, {
  FilterCriteria,
} from "@/components/gallery/GalleryFilter";
import GuestUpload from "@/components/GuestUpload";
import { GalleryActions } from "@/components/gallery/GalleryActions";
import VoiceMemoUpload from "@/components/VoiceMemoUpload";
import VoiceMemosList from "@/components/VoiceMemosList";
import InteractionPanel from "@/components/InteractionPanel";
import LazyInteractionPanel from "@/components/LazyInteractionPanel";
import { GalleryInteractionsProvider } from "@/context/GalleryInteractionsContext";
import SocialActivityPanel from "@/components/SocialActivityPanel";
import RegistrationCTA from "@/components/RegistrationCTA";
import { useGalleryRefresh } from "@/hooks/useGalleryRefresh";
import { useFirebaseAuth } from "@/context/FirebaseAuthContext";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useGalleryPreload } from "@/hooks/useGalleryPreload";
import { imageCache } from "@/lib/imageCache";
import { GalleryPreloadBanner } from "@/components/gallery/GalleryPreloadBanner";
import { useUserInfo } from "@/hooks/useUserInfo";
import { Edit3, BookOpen, Info, ChevronDown, ChevronRight, ChevronUp, X, Expand, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { PrettyCountdown } from "@/components/PrettyCountdown";
import { convertFirestoreTimestamp } from "@/lib/firebase";
import CoupleStoryBook from "@/components/CoupleStoryBook";
import StoryUploadForm from "@/components/StoryUploadForm";
import StoryService from "@/lib/storyService";
import { ChapterService } from "@/lib/chapters";
import { Chapter } from "@/lib/galleries";
import { GalleryOnboardingSpotlight } from "@/components/GalleryOnboardingSpotlight";
import { formatPhoneForWhatsApp } from "@shared/phone-utils";

// Memoized PhotoCard component for optimization with lazy loading
const PhotoCard = memo(({ 
  photo, 
  index, 
  onClick, 
  isSelected = false,
  isSelectionMode = false,
  assignedProducts = [],
  isUnlimitedCompleted = false,
  isDisliked = false,
  isDislikeMode = false,
}: { 
  photo: Photo, 
  index: number, 
  onClick: (index: number) => void,
  isSelected?: boolean,
  isSelectionMode?: boolean,
  assignedProducts?: string[],
  isUnlimitedCompleted?: boolean,
  isDisliked?: boolean,
  isDislikeMode?: boolean,
}) => {
  const handleClick = useCallback(() => onClick(index), [onClick, index]);
  
  // Mostra bordino: durante selezione attiva O per selezione libera completata
  const showBorder = isSelected && (isSelectionMode || isUnlimitedCompleted);

  // Le prime 12 foto coprono tipicamente il primo viewport (4 colonne × 3 righe).
  // Le carichiamo eager con priorità alta per minimizzare il "vuoto" iniziale.
  const isAboveTheFold = index < 12;

  // Stato di caricamento gestito in React (niente mutazioni DOM imperative).
  // - placeholder: aspect-ratio 3/4 e img cropped, evita reflow durante il download
  // - loaded: rimuove aspect-ratio e ripristina h-auto naturale
  // - errored: rimuove placeholder e mostra fallback (icona)
  const [isLoaded, setIsLoaded] = React.useState(false);
  const [isErrored, setIsErrored] = React.useState(false);
  const imgRef = React.useRef<HTMLImageElement | null>(null);

  // Chiusura della race "immagine in cache": se l'<img> è già completo prima che
  // React attacchi onLoad (cache HTTP, BFCache), forza isLoaded=true al mount.
  React.useLayoutEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    if (img.complete && img.naturalHeight > 0) {
      setIsLoaded(true);
    } else if (img.complete && img.naturalHeight === 0) {
      // immagine "complete" ma rotta
      setIsErrored(true);
    }
  }, []);

  const showPlaceholder = !isLoaded && !isErrored;

  return (
      <div
        className={`gallery-image cursor-pointer relative group overflow-hidden rounded-lg ${
          showPlaceholder ? '' : 'shadow-md hover:shadow-lg'
        } ${
          showBorder 
            ? 'ring-4 ring-sage ring-offset-2 shadow-xl' 
            : isDisliked
              ? 'ring-4 ring-red-500 ring-offset-2'
              : ''
        } ${
          // Skeleton "vivo" finché la foto non carica: comunica attività
          // invece di apparire come un buco nella griglia.
          showPlaceholder ? 'photo-skeleton' : ''
        }`}
        onClick={handleClick}
        // Riserviamo spazio (3/4) finché la foto non è caricata: evita CLS e
        // l'effetto "ribilanciamento a blocchi" delle colonne masonry.
        style={showPlaceholder ? { aspectRatio: '3 / 4' } : undefined}
      >
        <img
          ref={imgRef}
          src={photo.thumbnailUrl || photo.url}
          alt={photo.name || `Foto ${index + 1}`}
          className={`w-full ${showPlaceholder ? 'h-full object-cover opacity-0' : 'h-auto opacity-100'} transition-opacity duration-150 hover:opacity-95 ${
            showBorder ? 'brightness-105' : isDisliked ? 'opacity-60' : ''
          }`}
          loading={isAboveTheFold ? 'eager' : 'lazy'}
          // decoding=async non blocca mai il main thread (sync invece può causare jank)
          decoding="async"
          fetchpriority={isAboveTheFold ? 'high' : 'auto'}
          title={
            photo.createdAt
              ? new Date(photo.createdAt).toLocaleString("it-IT")
              : ""
          }
          style={{ backgroundColor: 'transparent' }}
          onLoad={() => setIsLoaded(true)}
          onError={() => setIsErrored(true)}
        />
        
        {/* Overlay rosso per foto escluse in modalità dislike */}
        {isDisliked && isDislikeMode && (
          <>
            <div className="absolute inset-0 bg-red-500/30 z-10" />
            <div className="absolute top-2 right-2 z-20">
              <span className="bg-red-600 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
                ESCLUSA
              </span>
            </div>
          </>
        )}
        
        {/* Badge SELEZIONATA - visibile quando foto è selezionata in modalità selezione attiva (non dislike) */}
        {isSelected && isSelectionMode && !isDislikeMode && (
          <div className="absolute top-2 right-2 z-10">
            <span className="bg-sage text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              SELEZIONATA
            </span>
          </div>
        )}
        
        {/* Badge foto scelta - visibile solo per selezione libera completata */}
        {isSelected && isUnlimitedCompleted && !isSelectionMode && (
          <div className="absolute top-2 right-2 z-10">
            <span className="bg-sage/90 text-white text-xs font-bold px-2 py-1 rounded-full shadow flex items-center gap-1">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </span>
          </div>
        )}
        
        {/* Indicatore prodotti assegnati (multi-product mode) */}
        {assignedProducts.length > 0 && isSelectionMode && (
          <div className="absolute bottom-2 left-2 right-2 z-10 flex flex-wrap gap-1">
            {assignedProducts.map((productIdx) => {
              const colorIndex = parseInt(productIdx) % 6;
              const colors = ['bg-sage', 'bg-terracotta', 'bg-blue-gray', 'bg-dark-sage', 'bg-mint text-blue-gray', 'bg-cream text-blue-gray border border-beige'];
              return (
                <span 
                  key={productIdx}
                  className={`${colors[colorIndex]} text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow`}
                >
                  P{parseInt(productIdx) + 1}
                </span>
              );
            })}
          </div>
        )}
      </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparator: re-render solo se cambiano ID, index, isSelected o assignedProducts
  if (
    prevProps.photo.id !== nextProps.photo.id ||
    prevProps.photo.url !== nextProps.photo.url ||
    prevProps.photo.thumbnailUrl !== nextProps.photo.thumbnailUrl ||
    prevProps.index !== nextProps.index ||
    prevProps.isSelected !== nextProps.isSelected ||
    prevProps.isSelectionMode !== nextProps.isSelectionMode ||
    prevProps.isUnlimitedCompleted !== nextProps.isUnlimitedCompleted ||
    prevProps.isDisliked !== nextProps.isDisliked ||
    prevProps.isDislikeMode !== nextProps.isDislikeMode
  ) return false;
  // Confronto array O(n) per assignedProducts (evita JSON.stringify in hot path)
  const a = prevProps.assignedProducts || [];
  const b = nextProps.assignedProducts || [];
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
});

PhotoCard.displayName = 'PhotoCard';


export default function Gallery() {
  const { id } = useParams();
  const [, navigate] = useLocation();
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [lightboxSourcePhotos, setLightboxSourcePhotos] = useState<any[] | null>(null);
  const { studioSettings } = useStudio();
  const { user, isAuthenticated } = useFirebaseAuth();
  const isAdmin = useIsAdmin();
  const userInfo = useUserInfo();
  const { toast } = useToast();
  const galleryPreload = useGalleryPreload();

  // 🔒 Stato per tracciare quando l'accesso viene validato (trigger reattivo)
  const [accessValidatedTrigger, setAccessValidatedTrigger] = useState(0);
  const hasDetectedAccessRef = useRef(false);

  // 🔐 AUTO-BYPASS: Se l'utente è admin, imposta automaticamente il token di accesso
  useEffect(() => {
    if (isAdmin && id) {
      const authKey = `gallery_auth_${id}`;
      if (!localStorage.getItem(authKey)) {
        console.log('✅ Admin bypass: accesso automatico alla galleria', id);
        localStorage.setItem(authKey, 'true');
        setAccessValidatedTrigger(prev => prev + 1); // Trigger re-render
      }
    }
  }, [isAdmin, id]);

  const GALLERY_PAGE_SIZE = 50;

  // Stato per i filtri
  const [filters, setFilters] = useState<FilterCriteria>({
    startDate: undefined,
    endDate: undefined,
    startTime: undefined,
    endTime: undefined,
    sortOrder: "newest",
  });

  // Stato per tracciare se i filtri sono attivi
  const [areFiltersActive, setAreFiltersActive] = useState(false);

  // Stato per il tab attivo (foto del fotografo, ospiti, vocali segreti o storia)
  const [activeTab, setActiveTab] = useState<
    "photographer" | "guests" | "voice-memos" | "story"
  >("photographer");

  // Hook per il refresh intelligente dei dati
  const {
    refreshPhotos,
    refreshGallery,
  } = useGalleryRefresh(id);

  // Stato per triggare il refresh dei voice memos
  const [refreshTrigger, setRefreshTrigger] = useState(0);


  // Stati per gestire la storia della coppia
  const [showStoryUpload, setShowStoryUpload] = useState(false);
  
  // 📚 Stato per gestire i capitoli collassati (oggetto per garantire re-render)
  const [collapsedChapters, setCollapsedChapters] = useState<Record<string, boolean>>({});
  
  // ⏱️ Stima tempo di caricamento basata su connessione
  const [loadingTimeEstimate, setLoadingTimeEstimate] = useState<string | null>(null);

  // 🔧 React Query: Carica galleria per code con fallback a ID
  const {
    data: galleryData,
    isLoading: isLoadingGallery,
    error: galleryError
  } = useQuery({
    queryKey: ['gallery', id],
    queryFn: () => GalleryService.getGalleryByCodeWithFallback(id || ''),
    enabled: !!id,
    retry: 2,
    staleTime: 30000 // Cache 30 secondi
  });

  // 🔒 Verifica se l'utente ha l'accesso validato alla galleria
  const hasValidAccess = useMemo(() => {
    if (!id) return false;
    // Admin ha sempre accesso
    if (isAdmin) return true;
    // Se la galleria non richiede password, l'accesso è libero
    if (galleryData && !galleryData.hasPassword) return true;
    // Altrimenti verifica se c'è il token di autenticazione nel localStorage
    return !!localStorage.getItem(`gallery_auth_${id}`);
  }, [id, isAdmin, galleryData, accessValidatedTrigger]);

  // ⚡ PERF Round 3: Paginazione Firestore con useInfiniteQuery.
  // Prima: 1 query scaricava TUTTI i metadati (es. 272 documenti) prima di mostrare qualsiasi cosa.
  // Ora: scarica 50 foto alla volta dal database, mostrando le prime quasi istantaneamente.
  // Pagine successive vengono caricate automaticamente quando l'utente scrolla verso il basso.
  const {
    data: infiniteData,
    isLoading: isLoadingPhotos,
    error: photosError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['gallery-all-photos', galleryData?.id],
    queryFn: async ({ pageParam }) => {
      if (!galleryData?.id) return { photos: [] as Photo[], lastDocument: null, hasMore: false };
      return PhotoService.getGalleryPhotosPaginated(galleryData.id, GALLERY_PAGE_SIZE, pageParam);
    },
    initialPageParam: undefined as any,
    getNextPageParam: (lastPage) => lastPage.hasMore ? lastPage.lastDocument ?? undefined : undefined,
    enabled: !!galleryData?.id && hasValidAccess,
    retry: 2,
    staleTime: 5 * 60 * 1000,
  });

  // ℹ️ In questa versione dei types di TanStack l'overload di useInfiniteQuery
  // non infersce la forma delle pagine: fissiamo qui la forma nota (solo tipi,
  // nessun effetto a runtime) così conteggi/merge restano type-safe.
  const photoPages =
    ((infiniteData as unknown as { pages?: Array<{ photos: Photo[] }> })?.pages) ?? [];

  // 🧮 Totale foto già caricate dalla paginazione (per capire se ne mancano).
  const pagedPhotoCount = useMemo(
    () => photoPages.reduce((sum, p) => sum + p.photos.length, 0),
    [photoPages]
  );

  // 🩹 RICONCILIAZIONE COMPLETEZZA: la query paginata ordina per `createdAt` e
  // Firestore SCARTA i documenti privi di quel campo (es. foto importate dallo
  // script esterno). Quando la paginazione è finita ma risultano meno foto del
  // totale dichiarato dalla galleria (`photoCount`), recuperiamo l'elenco
  // completo (senza orderBy, così nessuna foto viene esclusa) e uniamo quelle
  // mancanti. Il gate su `photoCount` evita di raddoppiare le letture sulle
  // gallerie sane (dove la paginazione ha già caricato tutto).
  const expectedPhotoCount = galleryData?.photoCount ?? 0;
  const needsReconciliation =
    !!galleryData?.id &&
    hasValidAccess &&
    !hasNextPage &&
    !isLoadingPhotos &&
    expectedPhotoCount > pagedPhotoCount;

  const {
    data: reconciledPhotos,
    isFetching: isReconciling,
    refetch: refetchReconcile,
  } = useQuery({
    queryKey: ['gallery-photos-complete', galleryData?.id],
    queryFn: async () => {
      if (!galleryData?.id) return [] as Photo[];
      return PhotoService.getGalleryPhotosComplete(galleryData.id);
    },
    enabled: needsReconciliation,
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });

  const { photos, guestPhotos } = useMemo(() => {
    const paged = photoPages.flatMap(p => p.photos);
    let all = paged;
    // Unisci le foto recuperate dalla riconciliazione (solo quelle non già
    // presenti, per id o per nome) preservando l'ordine della paginazione.
    if (reconciledPhotos?.length) {
      const seenIds = new Set(paged.map(p => p.id));
      const seenNames = new Set(paged.map(p => p.name));
      const extras = reconciledPhotos.filter(
        p => !seenIds.has(p.id) && !(p.name && seenNames.has(p.name))
      );
      if (extras.length > 0) all = [...paged, ...extras];
    }
    return {
      photos: all.filter(p => p.uploadedBy !== 'guest'),
      guestPhotos: all.filter(p => p.uploadedBy === 'guest'),
    };
  }, [photoPages, reconciledPhotos]);

  // ✅ Tutte le foto sono caricate? (paginazione finita + eventuale
  // riconciliazione completata). Serve a non salvare selezioni/dislike parziali.
  const arePhotosFullyLoaded =
    !isLoadingPhotos &&
    !hasNextPage &&
    (!needsReconciliation || (reconciledPhotos !== undefined && !isReconciling));

  // ⚡ PERF: Appena i metadati della prima pagina arrivano, pre-scarica le prime 12 thumbnail.
  const firstPagePhotos = photoPages[0]?.photos;
  useEffect(() => {
    if (!firstPagePhotos?.length) return;
    const urls = firstPagePhotos.slice(0, 12).map(p => p.thumbnailUrl || p.url).filter(Boolean);
    void imageCache.preloadImages(urls).catch(() => {});
  }, [firstPagePhotos]);

  // ⚡ HYBRID: Dopo la prima pagina, scarica TUTTE le restanti in background.
  // Così la lightbox e la selezione hanno sempre l'elenco completo delle foto.
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // ⏱️ Calcola stima tempo di caricamento basata sulla connessione
  useEffect(() => {
    if (!galleryData?.photoCount || galleryData.photoCount === 0) {
      setLoadingTimeEstimate(null);
      return;
    }

    const photoCount = galleryData.photoCount;
    
    // Usa Network Information API se disponibile
    const connection = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
    
    // Stima dimensione media foto (circa 300KB per foto compressa)
    const avgPhotoSizeKB = 300;
    const totalSizeMB = (photoCount * avgPhotoSizeKB) / 1024;
    
    // Velocità di download stimata in Mbps
    let downloadSpeedMbps = 10; // Default: connessione media
    
    if (connection?.downlink) {
      downloadSpeedMbps = connection.downlink;
    } else if (connection?.effectiveType) {
      // Stima basata sul tipo di connessione
      switch (connection.effectiveType) {
        case '4g': downloadSpeedMbps = 20; break;
        case '3g': downloadSpeedMbps = 2; break;
        case '2g': downloadSpeedMbps = 0.3; break;
        case 'slow-2g': downloadSpeedMbps = 0.1; break;
        default: downloadSpeedMbps = 10;
      }
    }
    
    // Calcola tempo in secondi (MB / (Mbps / 8)) con margine del 20%
    const timeSeconds = Math.ceil((totalSizeMB / (downloadSpeedMbps / 8)) * 1.2);
    
    if (timeSeconds < 10) {
      setLoadingTimeEstimate("pochi secondi");
    } else if (timeSeconds < 60) {
      setLoadingTimeEstimate(`circa ${Math.ceil(timeSeconds / 10) * 10} secondi`);
    } else {
      const minutes = Math.ceil(timeSeconds / 60);
      setLoadingTimeEstimate(`circa ${minutes} ${minutes === 1 ? 'minuto' : 'minuti'}`);
    }
  }, [galleryData?.photoCount]);

  // 🔧 React Query: Carica storia coppia (enabled solo quando id esiste)
  const {
    data: coupleStory,
    isLoading: storyLoading,
  } = useQuery({
    queryKey: ['coupleStory', id],
    queryFn: () => StoryService.getStoryByGalleryId(id!),
    enabled: !!id,
    retry: 1, // Riprova solo 1 volta (storia può non esistere)
    staleTime: 60000 // Cache 60 secondi (storia cambia raramente)
  });

  // Funzione di refresh che invalida la cache React Query (MOVED dopo galleryData declaration)
  const handleRefreshPhotos = useCallback(async () => {
    if (!galleryData?.id) return;

    // 🔧 FORZA REFETCH di tutte le query foto per gallery corrente
    await queryClient.refetchQueries({ 
      predicate: (query) => {
        if (!Array.isArray(query.queryKey)) return false;
        const [key, id] = query.queryKey;
        // Cattura tutte le query correlate alla gallery corrente
        return typeof key === 'string' && 
               (key === 'gallery-all-photos' || 
                key === 'top-liked-photos' ||
                key.includes('photo')) && 
               id === galleryData.id;
      }
    });

    // Fallback con evento personalizzato per compatibilità
    refreshPhotos();
  }, [galleryData?.id, refreshPhotos]);

  // 🔧 Error handling React Query
  useEffect(() => {
    if (galleryError) {
      console.error('Errore caricamento galleria:', galleryError);
      toast({
        title: "Errore",
        description: "Si è verificato un errore nel caricamento della galleria.",
        variant: "destructive",
      });
    }
    if (photosError) {
      console.error('Errore caricamento foto:', photosError);
      toast({
        title: "Errore",
        description: "Si è verificato un errore nel caricamento delle foto.",
        variant: "destructive",
      });
    }
  }, [galleryError, photosError]);

  // 🔧 Gestione galleria non trovata
  useEffect(() => {
    if (!isLoadingGallery && !galleryError && !galleryData && id) {
      toast({
        title: "Galleria non trovata",
        description: "La galleria richiesta non esiste o non è più disponibile.",
        variant: "destructive",
      });
      // Redirect dopo 2 secondi
      setTimeout(() => {
        navigate(createUrl('/'));
      }, 2000);
    }
  }, [isLoadingGallery, galleryError, galleryData, id, navigate]);

  // Stati per gestire la selezione foto (Tasks 12-15)
  // 🔥 CRITICAL FIX: In multi-product mode, photoAssignments è la SINGLE SOURCE OF TRUTH
  // selectedPhotoIds viene derivato automaticamente da photoAssignments (vedere useMemo sotto)
  const [selectedPhotoIdsLegacy, setSelectedPhotoIdsLegacy] = useState<string[]>([]); // Solo per modalità single-product legacy
  const [photoAssignments, setPhotoAssignments] = useState<Record<string, string[]>>({});
  const [isSubmittingSelection, setIsSubmittingSelection] = useState(false);
  const [showSelectionConfirmModal, setShowSelectionConfirmModal] = useState(false);
  const [selectionNotes, setSelectionNotes] = useState(""); // 📝 Note aggiuntive cliente
  const [pendingPhotoNotes, setPendingPhotoNotes] = useState<Record<string, string>>({}); // 📝 Note per foto singole

  // 🎨 UX Enhancement States
  const [showOnlySelected, setShowOnlySelected] = useState(false); // Filtro solo foto selezionate
  const [showSidebar, setShowSidebar] = useState(false); // Sidebar miniature
  const [showProductSummary, setShowProductSummary] = useState(false); // Sheet riepilogo prodotti
  const [filterByProduct, setFilterByProduct] = useState<number | null>(null); // Filtro per prodotto specifico
  const [showReviewModal, setShowReviewModal] = useState(false); // Modale review selezione prima conferma
  const [reviewLightboxPhoto, setReviewLightboxPhoto] = useState<string | null>(null); // Foto ingrandita nel riepilogo
  const [showResetDialog, setShowResetDialog] = useState(false); // Dialog conferma reset selezione
  const [hideConfirmationBanner, setHideConfirmationBanner] = useState(() => {
    // Recupera preferenza da localStorage
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('gallery-hide-confirmation-banner');
      return saved === 'true';
    }
    return false;
  });

  const [showSelectedPhotosSection, setShowSelectedPhotosSection] = useState(true);

  // 📱 Mobile Product Assignment Dialog
  const [showMobileProductDialog, setShowMobileProductDialog] = useState(false);
  const [selectedPhotoForMobileAssignment, setSelectedPhotoForMobileAssignment] = useState<string | null>(null);

  // Ref per scrollare alla griglia
  const galleryGridRef = useRef<HTMLDivElement>(null);
  
  // Ref per scrollare al bottone di conferma
  const confirmButtonRef = useRef<HTMLDivElement>(null);
  
  // Stato per tracciare se abbiamo già mostrato il toast di completamento
  const [hasShownCompletionToast, setHasShownCompletionToast] = useState(false);

  // Check se gallery è in selection mode
  const isSelectionMode = galleryData?.selectionEnabled || false;

  // Modalità "Non mi piace" (dislike mode)
  const isDislikeMode = isSelectionMode && galleryData?.selectionMode === 'dislike';

  // Stato per foto escluse in modalità dislike
  const [dislikedPhotoIds, setDislikedPhotoIds] = useState<Set<string>>(new Set());

  // 🔥 REFACTORED: Separa correttamente le 3 modalità di selezione
  // ✅ DIFENSIVO: normalizza array vuoto [] come undefined (Firestore può restituire [])
  const productRequirements = (galleryData?.productRequirements?.length ?? 0) > 0
    ? galleryData!.productRequirements
    : undefined;

  // Modalità 1: Single-product con productRequirements (1 prodotto con N foto)
  const isSingleProductRequirement = (productRequirements?.length === 1);

  // Modalità 2: Multi-product con productRequirements (2+ prodotti)
  const isMultiProductMode = (productRequirements?.length ?? 0) > 1;

  // Modalità 3: Legacy (nessun productRequirements, usa requiredPhotoCount diretto)
  const isLegacySingleProductMode = !productRequirements && (galleryData?.requiredPhotoCount ?? 0) > 0;

  // Modalità 4: Selezione Libera (unlimitedSelection - nessun limite foto)
  // Legacy support: se selezione attiva ma requiredPhotoCount è 0 e non ci sono productRequirements, tratta come illimitata
  const isUnlimitedSelection = galleryData?.unlimitedSelection === true || 
    (isSelectionMode && !productRequirements && (galleryData?.requiredPhotoCount || 0) <= 0);

  const selectedPhotoIds = useMemo(() => {
    if (isMultiProductMode) {
      // Multi-product: deriva da photoAssignments (single source of truth)
      return Object.keys(photoAssignments).filter(
        photoId => photoAssignments[photoId] && photoAssignments[photoId].length > 0
      );
    } else {
      // Single-product (sia legacy che con productRequirements): usa lo stato separato
      return selectedPhotoIdsLegacy;
    }
  }, [isMultiProductMode, photoAssignments, selectedPhotoIdsLegacy]);

  // ⚡ PERF: Set O(1) per lookup isSelected nella griglia (evita O(n) .includes per ogni foto)
  const selectedPhotoIdsSet = useMemo(() => new Set(selectedPhotoIds), [selectedPhotoIds]);

  // Calculate total required photos:
  // 1. Single-product requirement: estrai da productRequirements[0]
  // 2. Multi-product: somma tutti i prodotti
  // 3. Legacy: usa requiredPhotoCount diretto
  const requiredPhotoCount = useMemo(() => {
    if (isSingleProductRequirement) {
      // 1 prodotto: estrai numeroFoto dal primo (e unico) prodotto
      return productRequirements![0].prodottoNumeroFoto || 0;
    }
    if (isMultiProductMode) {
      // 2+ prodotti: somma tutti
      return productRequirements!.reduce((sum, p) => sum + (p.prodottoNumeroFoto || 0), 0);
    }
    // Legacy: usa requiredPhotoCount diretto dal galleryData
    return galleryData?.requiredPhotoCount || 0;
  }, [isSingleProductRequirement, isMultiProductMode, productRequirements, galleryData?.requiredPhotoCount]);

  const selectionDeadline = galleryData?.selectionDeadline;
  const selectionStatus = galleryData?.selectionStatus || "pending";

  // 🔍 DEBUG: Log stato modalità selezione (solo in sviluppo, ~20 console.log bloccano il main thread)
  useEffect(() => {
    if (import.meta.env.DEV && galleryData) {
      console.log("🔍 SELECTION MODE -", galleryData.code, "| enabled:", galleryData.selectionEnabled, "| mode:", isSelectionMode);
      if (!galleryData.selectionEnabled) {
        console.error("❌ selectionEnabled è FALSE o undefined");
      }
    }
  }, [galleryData, isSelectionMode]);

  // Check deadline enforcement
  const isDeadlinePassed = useMemo(() => {
    if (!selectionDeadline || !galleryData?.selectionDeadlineEnforced)
      return false;
    const deadline = selectionDeadline.toDate
      ? selectionDeadline.toDate()
      : new Date(selectionDeadline);
    return new Date() > deadline;
  }, [selectionDeadline, galleryData?.selectionDeadlineEnforced]);

  // Sync selectedPhotoIds with galleryData on INITIAL load only
  const [hasInitializedSelection, setHasInitializedSelection] = useState(false);
  const [lastGalleryIdForSelection, setLastGalleryIdForSelection] = useState<
    string | null
  >(null);

  // Reset selection state when gallery ID changes (cross-gallery navigation)
  useEffect(() => {
    if (id && id !== lastGalleryIdForSelection) {
      console.log("🔄 Gallery changed - reset selection state:", {
        from: lastGalleryIdForSelection,
        to: id,
      });
      setSelectedPhotoIdsLegacy([]);
      setPhotoAssignments({});
      setHasInitializedSelection(false);
      setLastGalleryIdForSelection(id);
    }
  }, [id, lastGalleryIdForSelection]);

  // Sync selectedPhotoIds from galleryData after reset (only once per gallery)
  useEffect(() => {
    if (!hasInitializedSelection && galleryData) {
      // Single-product mode (legacy OR productRequirements[0]): sync selectedPhotoIds if they exist
      if (
        (isSingleProductRequirement || isLegacySingleProductMode) &&
        galleryData.selectedPhotoIds &&
        galleryData.selectedPhotoIds.length > 0
      ) {
        console.log(
          "🔄 Sync iniziale selectedPhotoIds da galleryData (single-product):",
          galleryData.selectedPhotoIds.length,
        );
        setSelectedPhotoIdsLegacy(galleryData.selectedPhotoIds);
      }

      // Multi-product mode: sync photoAssignments if they exist
      if (isMultiProductMode && galleryData.photoAssignments && Object.keys(galleryData.photoAssignments).length > 0) {
        console.log(
          "🔄 Sync iniziale photoAssignments da galleryData (multi-product):",
          Object.keys(galleryData.photoAssignments).length,
        );
        setPhotoAssignments(galleryData.photoAssignments as Record<string, string[]>);
      }

      // 🔥 FIX CRITICAL: SEMPRE imposta hasInitializedSelection = true dopo primo load
      // Anche se la galleria è nuova (zero selezioni), questo sblocca auto-save e toggle
      setHasInitializedSelection(true);
      console.log("✅ Inizializzazione galleria completata (single:", isSingleProductRequirement, "multi:", isMultiProductMode, "legacy:", isLegacySingleProductMode, ")");
    }
  }, [galleryData, hasInitializedSelection, isSingleProductRequirement, isLegacySingleProductMode, isMultiProductMode]);

  // 💾 Auto-save selezioni in localStorage (UX Enhancement #2)
  useEffect(() => {
    if (
      !galleryData?.id ||
      selectionStatus === "completed" ||
      !hasInitializedSelection
    )
      return;

    const storageKey = `gallery-selection-${galleryData.id}`;

    // Salva ENTRAMBI selectedPhotoIds E photoAssignments per multi-product
    const hasSelections = selectedPhotoIds.length > 0 || Object.keys(photoAssignments).length > 0;

    if (hasSelections) {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          photoIds: selectedPhotoIds,
          photoAssignments: photoAssignments, // 🔥 FIX: Salva anche le assegnazioni prodotti
          timestamp: new Date().toISOString(),
          count: selectedPhotoIds.length,
        }),
      );
      console.log(
        "💾 Auto-saved selection:",
        selectedPhotoIds.length,
        "photos +",
        Object.keys(photoAssignments).length,
        "assignments",
      );
    } else {
      // Rimuovi localStorage quando la selezione è vuota
      localStorage.removeItem(storageKey);
      console.log("🗑️ Cleared saved selection (empty)");
    }
  }, [
    selectedPhotoIds,
    photoAssignments, // 🔥 FIX: Ascolta anche le modifiche a photoAssignments
    galleryData?.id,
    selectionStatus,
    hasInitializedSelection,
  ]);

  // 🎉 Auto-scroll al bottone conferma quando selezione completata
  useEffect(() => {
    if (!isSelectionMode || selectionStatus === 'completed' || !hasInitializedSelection) return;
    
    // Determina se la selezione è completa in base alla modalità
    let isComplete = false;
    
    if (isMultiProductMode && productRequirements) {
      // Multi-product: verifica che ogni prodotto CON LIMITE abbia il numero richiesto
      // I prodotti senza limite (0 o undefined) sono sempre considerati "ok"
      const productsWithLimits = productRequirements.filter(
        prod => (Number(prod.prodottoNumeroFoto) || 0) > 0
      );
      
      // Se ci sono prodotti con limiti, verifica che siano tutti completati
      if (productsWithLimits.length > 0) {
        isComplete = productRequirements.every((prod, idx) => {
          const requiredCount = Number(prod.prodottoNumeroFoto) || 0;
          // Prodotti senza limite (<=0) sono sempre "completi"
          if (requiredCount <= 0) return true;
          
          const assignedCount = Object.values(photoAssignments).filter(
            assignments => assignments.includes(String(idx))
          ).length;
          return assignedCount >= requiredCount;
        });
      } else {
        // Se tutti i prodotti sono senza limite, considera completo solo se c'è almeno una foto assegnata
        isComplete = Object.keys(photoAssignments).length > 0;
      }
    } else {
      // Single-product (legacy o con productRequirements[0]): verifica count totale
      // Per selezione illimitata, non mostrare toast automatico (l'utente decide quando ha finito)
      if (isUnlimitedSelection) {
        isComplete = false; // Non mostrare mai automaticamente per selezione libera
      } else {
        // FIX: Usa >= per coerenza con validazione
        isComplete = selectedPhotoIds.length >= requiredPhotoCount && requiredPhotoCount > 0;
      }
    }
    
    if (isComplete && !hasShownCompletionToast) {
      setHasShownCompletionToast(true);
      
      // Apri automaticamente il modale di review
      setShowReviewModal(true);
    }
    
    // Reset il flag se un prodotto CON LIMITE scende sotto la quota richiesta
    // (ignoriamo i prodotti illimitati per questo check)
    if (hasShownCompletionToast) {
      let anyLimitedProductIncomplete = false;
      
      if (isMultiProductMode && productRequirements) {
        anyLimitedProductIncomplete = productRequirements.some((prod, idx) => {
          const requiredCount = Number(prod.prodottoNumeroFoto) || 0;
          if (requiredCount <= 0) return false; // Ignora prodotti illimitati
          
          const assignedCount = Object.values(photoAssignments).filter(
            assignments => assignments.includes(String(idx))
          ).length;
          return assignedCount < requiredCount;
        });
      } else {
        anyLimitedProductIncomplete = selectedPhotoIds.length < requiredPhotoCount;
      }
      
      if (anyLimitedProductIncomplete) {
        setHasShownCompletionToast(false);
      }
    }
  }, [selectedPhotoIds.length, requiredPhotoCount, isSelectionMode, selectionStatus, hasInitializedSelection, hasShownCompletionToast, toast, isMultiProductMode, productRequirements, photoAssignments]);

  // 🔄 Restore selezioni da localStorage all'avvio (UX Enhancement #2)
  useEffect(() => {
    if (
      !galleryData?.id ||
      hasInitializedSelection ||
      selectionStatus === "completed"
    )
      return;

    const storageKey = `gallery-selection-${galleryData.id}`;
    const saved = localStorage.getItem(storageKey);

    if (saved) {
      try {
        const { photoIds, photoAssignments: savedAssignments, timestamp, count } = JSON.parse(saved);
        const savedDate = new Date(timestamp);
        const hoursSince =
          (new Date().getTime() - savedDate.getTime()) / (1000 * 60 * 60);

        // Ripristina solo se salvato nelle ultime 24 ore
        if (hoursSince < 24 && (photoIds?.length > 0 || Object.keys(savedAssignments || {}).length > 0)) {
          console.log(
            "🔄 Restored selection from localStorage:",
            count,
            "photos +",
            Object.keys(savedAssignments || {}).length,
            "assignments",
          );

          // 🔥 FIX: Ripristina ENTRAMBI selectedPhotoIds E photoAssignments
          if (photoIds && !isMultiProductMode) setSelectedPhotoIdsLegacy(photoIds); // Solo per legacy
          if (savedAssignments) setPhotoAssignments(savedAssignments); // Multi-product: questo imposta automaticamente selectedPhotoIds via useMemo

          setHasInitializedSelection(true); // ✅ FIX: Marca come inizializzato

          const hasAssignments = savedAssignments && Object.keys(savedAssignments).length > 0;
          toast({
            title: "💾 Selezione ripristinata",
            description: hasAssignments
              ? `Abbiamo recuperato le tue ${count} foto selezionate${Object.keys(savedAssignments).length > 0 ? ' con le assegnazioni ai prodotti' : ''}.`
              : `Abbiamo recuperato le tue ${count} foto selezionate precedentemente.`,
          });
          // Rimuovi entry per evitare restore multipli
          localStorage.removeItem(storageKey);
        } else {
          // Rimuovi dati vecchi
          localStorage.removeItem(storageKey);
          setHasInitializedSelection(true); // ✅ FIX: Marca come inizializzato anche se non c'era nulla
        }
      } catch (e) {
        console.error("Failed to restore selection:", e);
        localStorage.removeItem(storageKey);
        setHasInitializedSelection(true); // ✅ FIX: Marca come inizializzato anche in caso di errore
      }
    } else {
      // Nessun dato salvato, marca come inizializzato
      setHasInitializedSelection(true);
    }
  }, [galleryData?.id, hasInitializedSelection, selectionStatus, toast]);

  // Toggle product assignment for multi-product mode
  const handleToggleProductAssignment = useCallback(
    (photoId: string, productIndex: string) => {
      if (isDeadlinePassed && selectionStatus !== "completed") {
        toast({
          title: "⏰ Scadenza superata",
          description:
            "Il termine per la selezione è scaduto. Contatta lo studio per assistenza.",
          variant: "destructive",
        });
        return;
      }

      if (selectionStatus === "completed") {
        toast({
          title: "✅ Selezione già completata",
          description: "Hai già confermato la tua selezione.",
        });
        return;
      }

      // Get product name and limit for validation
      const prodIndex = parseInt(productIndex);
      const productName = galleryData?.productRequirements?.[prodIndex]?.prodottoNome || 'Prodotto';
      const productLimit = galleryData?.productRequirements?.[prodIndex]?.prodottoNumeroFoto || 0;

      setPhotoAssignments((prev) => {
        const currentAssignments = prev[photoId] || [];
        const isAssigned = currentAssignments.includes(productIndex);

        let newAssignments: string[];
        if (isAssigned) {
          // Remove product from this photo
          newAssignments = currentAssignments.filter((idx) => idx !== productIndex);

          // Toast feedback for removal
          toast({
            title: `📤 Foto rimossa`,
            description: `Rimossa da ${productName}`,
            duration: 2000,
          });
        } else {
          // VALIDATION: Check if product limit is reached before adding
          const currentProductCount = Object.values(prev).filter(
            assignments => assignments.includes(productIndex)
          ).length;

          const isProductUnlimited = productLimit <= 0;

          if (!isProductUnlimited && currentProductCount >= productLimit) {
            toast({
              title: `⚠️ Limite raggiunto`,
              description: `${productName} può avere massimo ${productLimit} foto. Ne hai già ${currentProductCount} assegnate.`,
              variant: 'destructive',
            });
            return prev; // Don't add, return unchanged state
          }

          // Add product to this photo
          newAssignments = [...currentAssignments, productIndex];

          // Toast feedback for assignment
          toast({
            title: `✨ Foto aggiunta`,
            description: `Assegnata a ${productName} (${currentProductCount + 1}/${isProductUnlimited ? '∞' : productLimit})`,
            duration: 2000,
          });
        }

        const updatedPhotoAssignments = { ...prev };
        if (newAssignments.length === 0) {
          // Remove photo entirely if no products assigned
          delete updatedPhotoAssignments[photoId];
          // 🔥 FIX: selectedPhotoIds è derivato automaticamente da photoAssignments via useMemo
        } else {
          updatedPhotoAssignments[photoId] = newAssignments;
          // 🔥 FIX: selectedPhotoIds è derivato automaticamente da photoAssignments via useMemo
        }

        console.log(
          `🏷️ Toggle product ${productIndex} for photo ${photoId}:`,
          isAssigned ? 'removed' : 'added',
          'New assignments:',
          updatedPhotoAssignments[photoId] || []
        );

        return updatedPhotoAssignments;
      });
    },
    [isDeadlinePassed, selectionStatus, toast, galleryData?.productRequirements],
  );

  // Toggle photo selection (legacy mode or when clicking photo directly)
  const handleTogglePhotoSelection = useCallback(
    (photoId: string) => {
      if (isDeadlinePassed && selectionStatus !== "completed") {
        toast({
          title: "⏰ Scadenza superata",
          description:
            "Il termine per la selezione è scaduto. Contatta lo studio per assistenza.",
          variant: "destructive",
        });
        return;
      }

      if (selectionStatus === "completed") {
        toast({
          title: "✅ Selezione già completata",
          description: "Hai già confermato la tua selezione.",
        });
        return;
      }

      // In multi-product mode, don't allow direct photo selection
      if (isMultiProductMode) {
        toast({
          title: "💡 Modalità Multi-Prodotto",
          description: "Clicca sui chip dei prodotti sotto la foto per assegnarla.",
        });
        return;
      }

      // Modalità "Non mi piace": toggle tra le foto escluse
      if (isDislikeMode) {
        setDislikedPhotoIds((prev) => {
          const newSet = new Set(prev);
          if (newSet.has(photoId)) {
            newSet.delete(photoId);
            console.log("✅ Foto ripristinata dal dislike:", photoId);
          } else {
            newSet.add(photoId);
            console.log("✗ Foto marcata come esclusa:", photoId);
          }
          return newSet;
        });
        return;
      }

      // Legacy single-product mode
      setSelectedPhotoIdsLegacy((prev: string[]) => {
        const isSelected = prev.includes(photoId);
        console.log(
          "❤️ Toggle photo:",
          photoId,
          "isSelected:",
          isSelected,
          "current count:",
          prev.length,
        );

        if (isSelected) {
          const newSelection = prev.filter((id: string) => id !== photoId);
          console.log("➖ Rimossa foto. Nuovo count:", newSelection.length);
          return newSelection;
        } else {
          // Selezione illimitata: nessun limite
          if (!isUnlimitedSelection && prev.length >= requiredPhotoCount) {
            toast({
              title: "Limite raggiunto",
              description: `Puoi selezionare massimo ${requiredPhotoCount} foto. Rimuovi una selezione prima di aggiungerne altre.`,
              variant: "destructive",
            });
            console.log("🚫 Limite raggiunto:", requiredPhotoCount);
            return prev;
          }
          const newSelection = [...prev, photoId];
          console.log("➕ Aggiunta foto. Nuovo count:", newSelection.length);
          return newSelection;
        }
      });
    },
    [isDeadlinePassed, selectionStatus, requiredPhotoCount, isUnlimitedSelection, isDislikeMode, galleryData?.productRequirements, toast],
  );

  // Reset all selections
  const handleResetSelection = useCallback(() => {
    // Clear localStorage
    if (galleryData?.id) {
      localStorage.removeItem(`gallery-selection-${galleryData.id}`);
    }
    
    // Reset tutti gli stati di selezione
    setSelectedPhotoIdsLegacy([]);
    setPhotoAssignments({});
    setDislikedPhotoIds(new Set());
    setHasShownCompletionToast(false);
    setShowResetDialog(false);
    
    // Reset anche stati UI correlati
    setShowOnlySelected(false);
    setShowSidebar(false);
    setFilterByProduct(null);
    setShowReviewModal(false);
    
    // Scroll to top della galleria (safe per mobile e desktop)
    requestAnimationFrame(() => {
      try {
        // Prima prova scrollTo standard
        document.documentElement.scrollTo({ top: 0, behavior: 'smooth' });
        document.body.scrollTo({ top: 0, behavior: 'smooth' });
        window.scrollTo({ top: 0, behavior: 'smooth' });
        
        // Poi prova ref se disponibile
        if (galleryGridRef.current) {
          galleryGridRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      } catch (e) {
        // Fallback per browser che non supportano smooth scroll
        window.scrollTo(0, 0);
      }
    });
    
    toast({
      title: "🔄 Selezione resettata",
      description: "Puoi ricominciare la selezione da zero.",
      duration: 3000,
    });
  }, [galleryData?.id, toast]);

  // Confirm selection
  const handleConfirmSelection = useCallback(async () => {
    if (!id) {
      toast({
        title: "❌ Errore",
        description: "ID galleria non trovato.",
        variant: "destructive",
      });
      return;
    }

    // 🛡️ In modalità dislike la selezione finale = tutte le foto NON escluse.
    // Se non sono ancora caricate tutte, salveremmo una selezione PARZIALE
    // (escludendo per errore le foto non ancora caricate). Blocchiamo finché
    // l'elenco non è completo e diamo una spinta al caricamento.
    if (isDislikeMode && !arePhotosFullyLoaded) {
      toast({
        title: "⏳ Attendi un momento",
        description:
          "Stiamo ancora caricando tutte le foto della galleria. Riprova tra qualche secondo per non perdere nessuna esclusione.",
        variant: "destructive",
      });
      if (hasNextPage && !isFetchingNextPage) fetchNextPage();
      // Se la riconciliazione è fallita (es. rete), riprovala: senza questo la
      // conferma resterebbe bloccata all'infinito.
      if (needsReconciliation && !isReconciling) refetchReconcile();
      return;
    }

    // In modalità dislike, non è necessaria nessuna validazione del numero di foto
    // Il cliente può escludere 0 o più foto, non c'è un minimo

    // Multi-Product Validation (solo se NON siamo in modalità dislike)
    if (!isDislikeMode && isMultiProductMode && productRequirements) {
      // Calcola progresso per ogni prodotto
      const productProgress = productRequirements.map((prod, idx) => {
        const assignedCount = Object.values(photoAssignments).filter(
          assignments => assignments.includes(String(idx))
        ).length;
        const requiredCount = Number(prod.prodottoNumeroFoto) || 0;
        const isUnlimited = requiredCount <= 0;

        return {
          prodottoNome: prod.prodottoNome,
          assignedCount,
          requiredCount,
          isUnlimited,
          // FIX BUG 1-2: Prodotti illimitati (requiredCount <= 0) non hanno vincoli
          isMissing: !isUnlimited && assignedCount < requiredCount,
          isExceeded: !isUnlimited && assignedCount > requiredCount
        };
      });

      // FIX BUG 3: NON bloccare se ci sono più foto del necessario
      // Nel multi-product/bundle, avere più foto è permesso (la stessa foto può andare a più prodotti)
      // Rimuoviamo il check isExceeded - il cliente può assegnare quante foto vuole

      // Trova solo prodotti mancanti (con limite che non sono soddisfatti)
      const missingProducts = productProgress.filter(p => p.isMissing);

      if (missingProducts.length > 0) {
        const errorMessage = missingProducts.map(p =>
          `• ${p.prodottoNome}: ${p.assignedCount}/${p.requiredCount} foto`
        ).join('\n');

        toast({
          title: "⚠️ Selezione incompleta",
          description: `Alcuni prodotti non hanno abbastanza foto assegnate:\n\n${errorMessage}\n\nAssegna le foto mancanti prima di confermare.`,
          variant: "destructive",
        });
        return;
      }

      console.log('✅ Validazione multi-prodotto superata - tutti i prodotti hanno le foto richieste');
    }
    // Legacy Single-Product Validation (solo se NON siamo in modalità dislike)
    else if (!isDislikeMode && requiredPhotoCount > 0) {
      // FIX BUG 4: Permettere >= invece di ==
      if (selectedPhotoIds.length < requiredPhotoCount) {
        toast({
          title: "⚠️ Selezione incompleta",
          description: `Devi selezionare almeno ${requiredPhotoCount} foto (${selectedPhotoIds.length}/${requiredPhotoCount} selezionate).`,
          variant: "destructive",
        });
        return;
      }
    }

    try {
      setIsSubmittingSelection(true);

      // Update gallery with selected photos
      const { GalleryService } = await import("@/lib/galleries");

      // IMPORTANTE: usare galleryData.id (Firestore doc ID) non id (gallery code)
      if (!galleryData?.id) {
        throw new Error("Gallery ID non disponibile");
      }

      // Converti photoAssignments in formato JSON puro per Firestore
      const photoAssignmentsData = isMultiProductMode
        ? Object.fromEntries(
            Object.entries(photoAssignments).filter(([_, value]) => value && value.length > 0)
          )
        : null;

      // 📸 Snapshot: se la selezione era già completata, salva uno snapshot prima di sovrascrivere
      const existingSnapshots = galleryData.selectionSnapshots || [];
      if (galleryData.selectionStatus === 'completed') {
        const snapshotIndex = existingSnapshots.length + 1;
        const snapshot = {
          id: Date.now().toString(),
          createdAt: new Date().toISOString(),
          label: `Revisione ${snapshotIndex}`,
          photoAssignments: galleryData.photoAssignments || null,
          selectedPhotoIds: galleryData.selectedPhotoIds || [],
          selectionNotes: galleryData.selectionNotes || '',
          createdBy: 'client' as const,
        };
        await GalleryService.updateGallery(galleryData.id, {
          selectionSnapshots: [...existingSnapshots, snapshot],
        } as any);
      }

      // In modalità dislike: la selezione positiva sono tutte le foto NON escluse
      const finalSelectedPhotoIds = isDislikeMode
        ? photos.map(p => p.id).filter(photoId => !dislikedPhotoIds.has(photoId))
        : selectedPhotoIds;

      const updateData: any = {
        selectedPhotoIds: finalSelectedPhotoIds,
        selectionStatus: "completed",
        selectionNotes: selectionNotes.trim(), // 📝 Salva sempre note cliente (anche se vuote per permettere cancellazione)
      };

      // Aggiungi photoAssignments solo se esiste e non è vuoto
      if (photoAssignmentsData && Object.keys(photoAssignmentsData).length > 0) {
        updateData.photoAssignments = photoAssignmentsData;
      }

      await GalleryService.updateGallery(galleryData.id, updateData);

      // Send email notification to admin (Task 17) - solo se user autenticato
      if (user) {
        try {
          // Get Firebase ID token for authentication
          const token = await user.getIdToken();

          // Build product assignments for email if multi-product mode
          const productAssignments = (isMultiProductMode && productRequirements)
            ? productRequirements.map((prod, idx) => {
                const assignedCount = Object.values(photoAssignments).filter(
                  assignments => assignments.includes(String(idx))
                ).length;

                return {
                  prodottoNome: prod.prodottoNome,
                  assignedCount,
                  requiredCount: prod.prodottoNumeroFoto
                };
              })
            : undefined;

          await fetch("/api/email/selection-completed", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              galleryId: id,
              galleryName: galleryData?.name || "Galleria",
              clienteName: user.displayName || user.email || "Cliente",
              photoCount: finalSelectedPhotoIds.length,
              workspaceUrl: `${window.location.origin}/admin/gallery/${id}/manage`,
              productAssignments // NEW: multi-product support
            }),
          });
        } catch (emailError) {
          console.error("⚠️ Errore invio email admin:", emailError);
        }
      }

      toast({
        title: "✅ Selezione confermata!",
        description: isDislikeMode
          ? `Hai escluso ${dislikedPhotoIds.size} foto. Salviamo le ${finalSelectedPhotoIds.length} restanti. Riceverai presto il tuo album!`
          : isMultiProductMode
            ? "Le tue foto sono state assegnate ai prodotti. Riceverai presto il tuo album!"
            : `Le tue ${requiredPhotoCount} foto sono state confermate. Riceverai presto il tuo album!`,
      });

      // Refresh gallery data
      await refreshGallery();

      // Auto-reload page to show updated state
      setTimeout(() => {
        window.location.reload();
      }, 1500); // Delay to show toast message
    } catch (error) {
      console.error("Errore conferma selezione:", error);
      toast({
        title: "❌ Errore",
        description: "Errore durante la conferma della selezione. Riprova.",
        variant: "destructive",
      });
    } finally {
      setIsSubmittingSelection(false);
    }
  }, [
    id,
    user,
    selectedPhotoIds,
    selectionNotes,
    requiredPhotoCount,
    galleryData,
    toast,
    refreshGallery,
    isDislikeMode,
    dislikedPhotoIds,
    photos,
    arePhotosFullyLoaded,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    needsReconciliation,
    isReconciling,
    refetchReconcile,
  ]);

  // 📝 Conferma selezione con note (per Selezione Libera)
  const handleConfirmSelectionWithNotes = useCallback(async (photoNotes: Record<string, string>) => {
    if (!id) {
      toast({
        title: "❌ Errore",
        description: "ID galleria non trovato.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsSubmittingSelection(true);

      const { GalleryService } = await import("@/lib/galleries");

      if (!galleryData?.id) {
        throw new Error("Gallery ID non disponibile");
      }

      // 📸 Snapshot: se la selezione era già completata, salva uno snapshot prima di sovrascrivere
      const existingSnapshots = galleryData.selectionSnapshots || [];
      if (galleryData.selectionStatus === 'completed') {
        const snapshotIndex = existingSnapshots.length + 1;
        const snapshot = {
          id: Date.now().toString(),
          createdAt: new Date().toISOString(),
          label: `Revisione ${snapshotIndex}`,
          photoAssignments: galleryData.photoAssignments || null,
          selectedPhotoIds: galleryData.selectedPhotoIds || [],
          selectionNotes: galleryData.selectionNotes || '',
          createdBy: 'client' as const,
        };
        await GalleryService.updateGallery(galleryData.id, {
          selectionSnapshots: [...existingSnapshots, snapshot],
        } as any);
      }

      const updateData: any = {
        selectedPhotoIds,
        selectionStatus: "completed",
        selectionNotes: selectionNotes.trim(),
        photoNotes: Object.keys(photoNotes).length > 0 ? photoNotes : null, // 📝 Note individuali per foto
      };

      await GalleryService.updateGallery(galleryData.id, updateData);

      // Send email notification to admin
      if (user) {
        try {
          const token = await user.getIdToken();

          await fetch("/api/email/selection-completed", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              galleryId: id,
              galleryName: galleryData?.name || "Galleria",
              clienteName: user.displayName || user.email || "Cliente",
              photoCount: selectedPhotoIds.length,
              workspaceUrl: `${window.location.origin}/admin/gallery/${id}/manage`,
              hasPhotoNotes: Object.keys(photoNotes).length > 0, // Indica se ci sono note
            }),
          });
        } catch (emailError) {
          console.error("⚠️ Errore invio email admin:", emailError);
        }
      }

      toast({
        title: "✅ Selezione confermata!",
        description: `Le tue ${selectedPhotoIds.length} foto sono state confermate${Object.keys(photoNotes).length > 0 ? ' con le tue note' : ''}. Riceverai presto il tuo album!`,
      });

      await refreshGallery();

      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (error) {
      console.error("Errore conferma selezione:", error);
      toast({
        title: "❌ Errore",
        description: "Errore durante la conferma della selezione. Riprova.",
        variant: "destructive",
      });
    } finally {
      setIsSubmittingSelection(false);
    }
  }, [
    id,
    user,
    selectedPhotoIds,
    selectionNotes,
    galleryData,
    toast,
    refreshGallery,
  ]);

  // Scroll to gallery grid
  const scrollToGallery = useCallback(() => {
    if (galleryGridRef.current) {
      galleryGridRef.current.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  }, []);

  // 📚 Toggle collapse/expand capitolo
  const toggleChapterCollapse = useCallback((chapterId: string) => {
    setCollapsedChapters(prev => ({
      ...prev,
      [chapterId]: !prev[chapterId]
    }));
  }, []);

  // Funzione per eliminare la storia (solo admin)
  const handleDeleteStory = useCallback(async () => {
    if (!isAdmin || !id || !coupleStory) return;

    const confirmed = window.confirm(
      "Sei sicuro di voler eliminare la storia della coppia? Questa azione non può essere annullata.",
    );

    if (!confirmed) return;

    try {
      await StoryService.deleteStory(id);

      // Invalida cache React Query per ricaricare storia
      await queryClient.invalidateQueries({ queryKey: ['coupleStory', id] });

      toast({
        title: "Storia eliminata",
        description: "La storia della coppia è stata eliminata con successo.",
      });
    } catch (error) {
      console.error("Errore eliminazione storia:", error);
      toast({
        title: "Errore",
        description: "Errore durante l'eliminazione della storia. Riprova.",
        variant: "destructive",
      });
    }
  }, [isAdmin, id, coupleStory, toast]);

  // Ref per l'elemento sentinella per infinite scroll
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Calcola la data dell'evento direttamente dalla galleria
  const eventDate = useMemo(() => {
    if (!galleryData?.date) return null;

    // Usa la data della galleria
    const date = new Date(galleryData.date);
    if (!isNaN(date.getTime())) {
      return date;
    }

    return null;
  }, [galleryData]);

  // 🔧 Storia caricata tramite React Query (vedi useQuery sopra) - vecchio useEffect rimosso

  // Verifica autenticazione
  useEffect(() => {
    const checkAuth = () => {
      const isAuth = localStorage.getItem(`gallery_auth_${id}`);
      if (!isAuth && !isAdmin) {
        // CORREZIONE: redirect alla route corretta /gallery/:id invece di /access/:id
        navigate(createUrl(`/access/${id}`)); // <-- CORRETTO: /access/:id
        return;
      }
    };

    if (id) {
      checkAuth();
    }
  }, [id, isAdmin, navigate]);

  // 🔒 Ascolta eventi storage per rilevare quando la password viene validata
  useEffect(() => {
    // Se l'accesso è già validato, non serve polling
    if (hasValidAccess) {
      hasDetectedAccessRef.current = true;
      return;
    }

    const handleStorageChange = (e: StorageEvent) => {
      // Se il localStorage per questa galleria è stato settato, incrementa il trigger UNA VOLTA
      if (e.key === `gallery_auth_${id}` && e.newValue && !hasDetectedAccessRef.current) {
        hasDetectedAccessRef.current = true;
        setAccessValidatedTrigger(prev => prev + 1);
      }
    };

    // Ascolta eventi storage (cross-tab)
    window.addEventListener('storage', handleStorageChange);

    // Controlla anche periodicamente il localStorage (per eventi same-tab)
    const interval = setInterval(() => {
      if (localStorage.getItem(`gallery_auth_${id}`) && !hasDetectedAccessRef.current) {
        hasDetectedAccessRef.current = true;
        setAccessValidatedTrigger(prev => prev + 1);
      }
    }, 500);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(interval);
    };
  }, [id, hasValidAccess]);

  // Combina tutte le foto per il lightbox
  const allPhotos = useMemo(() => {
    return [...photos, ...guestPhotos];
  }, [photos, guestPhotos]);

  // 🪟 Finestra di rendering: quante card montare nel DOM (vedi displayPhotosForGrid).
  const [visiblePhotoLimit, setVisiblePhotoLimit] = useState(60);

  // 🔍 UX Enhancement: Apre lightbox usando displayPhotos (supporta filtro "Solo Selezionate")
  // Quando sourcePhotos è passato (es. da un capitolo), la lightbox naviga SOLO in quelle foto
  const openLightbox = useCallback((index: number, sourcePhotos?: any[]) => {
    setCurrentPhotoIndex(index);
    setLightboxSourcePhotos(sourcePhotos ?? null);
    setLightboxOpen(true);
  }, []);

  const closeLightbox = () => {
    setLightboxOpen(false);
    setLightboxSourcePhotos(null);
  };

  // Funzione per applicare i filtri
  const handleFilterChange = (newFilters: FilterCriteria) => {
    setFilters(newFilters);
    setVisiblePhotoLimit(60); // reset finestra di rendering quando cambiano i filtri

    // Verifica se c'è almeno un filtro attivo
    const hasActiveFilter =
      newFilters.startDate !== undefined ||
      newFilters.endDate !== undefined ||
      newFilters.startTime !== undefined ||
      newFilters.endTime !== undefined ||
      newFilters.sortOrder !== "newest";

    setAreFiltersActive(hasActiveFilter);
  };

  // Funzione per resettare i filtri
  const resetFilters = () => {
    setVisiblePhotoLimit(60); // reset finestra di rendering
    setFilters({
      startDate: undefined,
      endDate: undefined,
      startTime: undefined,
      endTime: undefined,
      sortOrder: "newest",
    });
    setAreFiltersActive(false);
  };

  // Filtra le foto in base ai criteri impostati
  const filteredPhotos = useMemo(() => {
    if (!areFiltersActive) return photos;

    return photos
      .filter((photo) => {
        const photoDate = photo.createdAt ? new Date(photo.createdAt) : null;
        if (!photoDate) return true; // Se non c'è data, include la foto

        // Filtra per data
        if (filters.startDate && photoDate < filters.startDate) return false;
        if (filters.endDate) {
          // FIX: Usa math per set end of day (evita setHours())
          const ed = new Date(filters.endDate);
          const endDateWithTime = new Date(ed.getFullYear(), ed.getMonth(), ed.getDate(), 23, 59, 59);
          if (photoDate > endDateWithTime) return false;
        }

        // Filtra per ora
        // FIX: Estrai ore/minuti in UTC per comparazione (non timezone-dependent)
        if (filters.startTime || filters.endTime) {
          const hours = photoDate.getUTCHours();
          const minutes = photoDate.getUTCMinutes();
          const photoTime = `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;

          if (filters.startTime && photoTime < filters.startTime) return false;
          if (filters.endTime && photoTime > filters.endTime) return false;
        }

        return true;
      })
      .sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt) : new Date(0);
        const dateB = b.createdAt ? new Date(b.createdAt) : new Date(0);

        return filters.sortOrder === "newest"
          ? dateB.getTime() - dateA.getTime()
          : dateA.getTime() - dateB.getTime();
      });
  }, [photos, filters, areFiltersActive]);

  // 🎨 UX Enhancement #1: Filtra per mostrare solo foto selezionate (se attivo)
  const allDisplayPhotos = useMemo(() => {
    let basePhotos = areFiltersActive ? filteredPhotos : photos;

    // Filtro per prodotto specifico (Task 8)
    if (filterByProduct !== null && photoAssignments) {
      basePhotos = basePhotos.filter((photo) =>
        photoAssignments[photo.id]?.includes(String(filterByProduct))
      );
    }

    // Se il filtro "solo selezionate" è attivo, mostra solo quelle
    if (showOnlySelected && isSelectionMode && selectedPhotoIds.length > 0) {
      return basePhotos.filter((photo) => selectedPhotoIdsSet.has(photo.id));
    }

    return basePhotos;
  }, [
    areFiltersActive,
    filteredPhotos,
    photos,
    showOnlySelected,
    isSelectionMode,
    selectedPhotoIds,
    selectedPhotoIdsSet,
    filterByProduct,
    photoAssignments,
  ]);

  // 📄 Con paginazione Firestore, tutte le foto caricate sono da visualizzare (niente slice client-side)
  const displayPhotos = allDisplayPhotos;

  // 🔒 Click su una card della vista standard: il comparator di PhotoCard ignora
  // (volutamente) la prop onClick per non re-renderizzare ad ogni cambio di stato.
  // Per evitare di catturare un `displayPhotos` ORMAI VECCHIO nella closure (es.
  // dopo la riconciliazione che aggiunge foto), usiamo un handler STABILE che
  // legge sempre l'elenco aggiornato tramite ref.
  const displayPhotosRef = useRef(displayPhotos);
  useEffect(() => {
    displayPhotosRef.current = displayPhotos;
  }, [displayPhotos]);
  const handleStandardPhotoClick = useCallback(
    (index: number) => openLightbox(index, displayPhotosRef.current),
    [openLightbox]
  );

  // 🪟 Finestra di rendering: i METADATI di tutte le foto restano in `displayPhotos`
  // (necessari a lightbox e selezione), ma nel DOM montiamo solo le prime N card,
  // aumentate dalla sentinella mentre l'utente scorre. Meno nodi nel DOM = scroll più
  // leggero, senza perdere completezza per visualizzatore/selezione.
  const RENDER_WINDOW_STEP = 40;
  const displayPhotosForGrid = useMemo(
    () => displayPhotos.slice(0, visiblePhotoLimit),
    [displayPhotos, visiblePhotoLimit],
  );
  // 📚 Capitoli attivi? (serve anche a delimitare la finestra di rendering qui sotto)
  const chaptersEnabled = galleryData?.chaptersEnabled && (galleryData?.chapters?.length ?? 0) > 0;

  // 🪟 La finestra di rendering guida SOLO la vista standard del fotografo (senza capitoli).
  // I capitoli (group.photos) e il tab Ospiti (guestPhotos) renderizzano già le liste
  // complete, quindi lì la finestra non serve: limitandola evitiamo che l'observer
  // incrementi a vuoto `visiblePhotoLimit` (stato non visualizzato) con re-render inutili.
  const renderWindowActive = activeTab === "photographer" && !chaptersEnabled;
  const hasMoreToRender = renderWindowActive && visiblePhotoLimit < displayPhotos.length;
  
  // Reset collapsed chapters quando cambiano i capitoli della galleria
  // 📚 LAZY LOADING: Tutti i capitoli iniziano collassati di default
  const chaptersKey = useMemo(() => 
    galleryData?.chapters?.map(c => c.id).join(',') || '', 
    [galleryData?.chapters]
  );
  
  useEffect(() => {
    if (galleryData?.chapters && galleryData.chapters.length > 0) {
      const allCollapsed: Record<string, boolean> = {};
      galleryData.chapters.forEach(chapter => {
        allCollapsed[chapter.id] = true;
      });
      allCollapsed['__unassigned__'] = true;
      setCollapsedChapters(allCollapsed);
    } else {
      setCollapsedChapters({});
    }
  }, [chaptersKey, galleryData?.chapters]);
  
  const photosByChapter = useMemo(() => {
    if (!chaptersEnabled || !galleryData?.chapters) return null;
    
    // Usa allDisplayPhotos per rispettare i filtri attivi
    const photosToUse = allDisplayPhotos;
    
    const sortedChapters = [...galleryData.chapters].sort((a, b) => (a.ordine || 0) - (b.ordine || 0));
    const result: { chapter: Chapter; photos: Photo[] }[] = [];
    
    sortedChapters.forEach(chapter => {
      const chapterPhotos = photosToUse
        .filter(photo => (photo as any).chapterId === chapter.id)
        .sort((a, b) => ((a as any).chapterPosition || 0) - ((b as any).chapterPosition || 0));
      if (chapterPhotos.length > 0) {
        result.push({ chapter, photos: chapterPhotos });
      }
    });
    
    const unassignedPhotos = photosToUse.filter(photo => !(photo as any).chapterId);
    if (unassignedPhotos.length > 0) {
      result.push({
        chapter: { id: '__unassigned__', titolo: 'Altre Foto', descrizione: '', ordine: Number.MAX_SAFE_INTEGER, createdAt: new Date(), updatedAt: new Date() },
        photos: unassignedPhotos
      });
    }
    
    return result;
  }, [chaptersEnabled, galleryData?.chapters, allDisplayPhotos]);
  
  // 📚 Array flat delle foto nell'ordine dei capitoli (per lightbox e indice)
  const flatChapterPhotos = useMemo(() => {
    if (!photosByChapter) return allDisplayPhotos;
    return photosByChapter.flatMap(group => group.photos);
  }, [photosByChapter, allDisplayPhotos]);

  // 📄 Versione per capitoli: mostra tutte le foto caricate per ogni capitolo,
  // nascondendo i capitoli collassati. La paginazione è gestita da Firestore (useInfiniteQuery).
  const photosByChapterDisplayed = useMemo(() => {
    if (!photosByChapter) return null;
    return photosByChapter.map(group => {
      const isCollapsed = !!collapsedChapters[group.chapter.id];
      return {
        chapter: group.chapter,
        photos: isCollapsed ? [] as Photo[] : group.photos,
        allPhotos: group.photos,
      };
    });
  }, [photosByChapter, collapsedChapters]);

  // 🔒 Stesso fix dello stale-closure della vista standard, ma per i capitoli:
  // l'onClick inline cattura `group.allPhotos` e il comparator di PhotoCard lo
  // ignora, quindi una card non re-renderizzata terrebbe un array VECCHIO dopo
  // la riconciliazione. L'handler stabile rilegge l'elenco aggiornato del
  // capitolo da una ref, usando l'id del capitolo (stabile) come chiave.
  const photosByChapterDisplayedRef = useRef(photosByChapterDisplayed);
  useEffect(() => {
    photosByChapterDisplayedRef.current = photosByChapterDisplayed;
  }, [photosByChapterDisplayed]);
  const handleChapterPhotoClick = useCallback(
    (chapterId: string, index: number) => {
      const group = photosByChapterDisplayedRef.current?.find(
        (g) => g.chapter.id === chapterId
      );
      openLightbox(index, group?.allPhotos);
    },
    [openLightbox]
  );

  // 📊 La sentinella resta montata finché ci sono altre card da rivelare (finestra di
  // rendering) OPPURE altri metadati ancora in arrivo da Firestore (auto-fetch HYBRID).
  const hasMorePhotosToShow = hasMoreToRender || !!hasNextPage;

  // Intersection Observer per la FINESTRA DI RENDERING: avvicinandosi al fondo rivela
  // altre card già disponibili. Il fetch dei metadati è gestito UNICAMENTE dall'effetto
  // HYBRID (scarica tutte le pagine in background): qui non chiamiamo più fetchNextPage,
  // eliminando il doppio meccanismo di paginazione.
  //
  // ⚠️ L'effetto si RI-ESEGUE ad ogni incremento (visiblePhotoLimit) e ad ogni nuovo
  // batch di metadati (displayPhotos.length): ricreare l'observer forza una nuova
  // valutazione dell'intersezione. Senza questo, un IntersectionObserver a istanza
  // singola scatta solo sulle transizioni e si bloccava dopo il primo incremento
  // (es. fermo a 100 foto). Ricreandolo, la finestra "riempie" fino a coprire
  // viewport + margine, poi prosegue in modo affidabile mentre l'utente scorre.
  useEffect(() => {
    if (!sentinelRef.current || !hasMoreToRender) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisiblePhotoLimit((prev) =>
            prev < displayPhotos.length ? prev + RENDER_WINDOW_STEP : prev,
          );
        }
      },
      { rootMargin: '800px' }
    );

    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMoreToRender, visiblePhotoLimit, displayPhotos.length]);

  // 🪟 FALLBACK ROBUSTO di avanzamento finestra (indipendente dall'observer).
  // L'IntersectionObserver sopra è solo un fast-path: su gallerie grandi può
  // perdere le transizioni (lazy-load immagini che cambiano altezza, scroll
  // anchoring, smontaggio/rimontaggio della sentinella durante la
  // riconciliazione) lasciando la griglia BLOCCATA pur avendo già tutti i
  // metadati in memoria (sintomo: la lightbox mostra tutte le foto, la griglia
  // no). Qui avanziamo su scroll/resize (rAF, passive) e SUBITO quando
  // displayPhotos cresce, così la finestra non resta mai ferma. Usa il capture
  // sullo scroll per intercettare anche eventuali container interni scrollabili.
  useEffect(() => {
    if (!renderWindowActive || visiblePhotoLimit >= displayPhotos.length) return;

    let raf = 0;
    const maybeAdvance = () => {
      raf = 0;
      const grid = galleryGridRef.current;
      if (!grid) return;
      const distanceToBottom =
        grid.getBoundingClientRect().bottom - window.innerHeight;
      // Soglia ~1200px: rivela in anticipo prima che il fondo entri nel viewport.
      if (distanceToBottom < 1200) {
        setVisiblePhotoLimit((prev) =>
          Math.min(prev + RENDER_WINDOW_STEP, displayPhotosRef.current.length),
        );
      }
    };
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(maybeAdvance);
    };

    // Avanza subito: copre riconciliazione/auto-fetch e il primo mount, anche
    // quando la sentinella era smontata al momento della transizione.
    maybeAdvance();
    document.addEventListener("scroll", onScroll, { passive: true, capture: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      if (raf) cancelAnimationFrame(raf);
      document.removeEventListener("scroll", onScroll, { capture: true } as EventListenerOptions);
      window.removeEventListener("resize", onScroll);
    };
  }, [renderWindowActive, visiblePhotoLimit, displayPhotos.length]);

  // 📊 Multi-Product Progress Calculation
  const calculateProductProgress = useMemo(() => {
    if (!isMultiProductMode || !productRequirements || !photoAssignments) {
      return null;
    }

    return productRequirements.map((prod, idx) => {
      // Conta quante foto hanno questo prodotto assegnato
      const assignedCount = Object.values(photoAssignments).filter(
        assignments => assignments.includes(String(idx))
      ).length;
      const requiredCount = Number(prod.prodottoNumeroFoto) || 0;
      const isUnlimited = requiredCount <= 0;

      return {
        prodottoNome: prod.prodottoNome,
        assignedCount,
        requiredCount,
        isUnlimited,
        // FIX: Prodotti illimitati sono sempre completi
        isComplete: isUnlimited || assignedCount >= requiredCount,
        percentage: isUnlimited 
          ? 100 
          : (requiredCount > 0 ? Math.round((assignedCount / requiredCount) * 100) : 100)
      };
    });
  }, [galleryData?.productRequirements, photoAssignments]);

  // 🎨 UX Enhancement #6: Messaggi smart basati sul progresso
  // IMPORTANTE: Nascosto in modalità multi-prodotto perché il progresso è già mostrato nelle card colorate
  const smartMessage = useMemo(() => {
    if (!isSelectionMode || selectionStatus === "completed") return null;

    // 🔥 FIX: In multi-prodotto mode, non mostrare questo messaggio legacy
    // Il progresso è già visualizzato nelle card colorate dei prodotti
    if (isMultiProductMode) {
      return null;
    }

    const count = selectedPhotoIds.length;

    // 🆕 Selezione Libera: messaggi dedicati senza limite
    if (isUnlimitedSelection) {
      if (count === 0) {
        return {
          emoji: "💜",
          text: "Seleziona liberamente le foto che preferisci!",
          color: "text-terracotta",
        };
      } else if (count < 5) {
        return {
          emoji: "🎯",
          text: `Ottimo! ${count} foto selezionate. Continua a esplorare!`,
          color: "text-terracotta",
        };
      } else if (count < 15) {
        return {
          emoji: "💪",
          text: `Stai andando alla grande! ${count} foto selezionate.`,
          color: "text-terracotta",
        };
      } else {
        return {
          emoji: "✨",
          text: `Fantastico! Hai selezionato ${count} foto. Clicca "Ho finito" quando sei pronto.`,
          color: "text-terracotta",
        };
      }
    }

    // Logica legacy per modalità single-product con limite
    const required = requiredPhotoCount;

    if (count === 0) {
      return {
        emoji: "✨",
        text: `Inizia selezionando le tue ${required} foto preferite!`,
        color: "text-blue-gray",
      };
    } else if (count < required * 0.25) {
      return {
        emoji: "🎯",
        text: `Ottimo inizio! Continua così!`,
        color: "text-sage",
      };
    } else if (count < required * 0.5) {
      return {
        emoji: "💪",
        text: `Stai andando alla grande! Sei a ${count}/${required}`,
        color: "text-sage",
      };
    } else if (count < required * 0.75) {
      return {
        emoji: "🔥",
        text: `Fantastico! Più della metà completata!`,
        color: "text-terracotta",
      };
    } else if (count < required) {
      return {
        emoji: "🎉",
        text: `Quasi fatto! Mancano solo ${required - count} foto!`,
        color: "text-terracotta",
      };
    } else if (count === required) {
      return {
        emoji: "✅",
        text: `Perfetto! Puoi confermare la selezione!`,
        color: "text-sage",
      };
    } else {
      return {
        emoji: "⚠️",
        text: `Troppe foto! Rimuovine ${count - required}`,
        color: "text-terracotta",
      };
    }
  }, [
    isSelectionMode,
    selectionStatus,
    selectedPhotoIds.length,
    requiredPhotoCount,
    galleryData?.productRequirements,
    isUnlimitedSelection,
    isMultiProductMode,
  ]);

  // 🆕 Prepara le foto selezionate per il modale di conferma
  const selectedPhotosForModal: SelectedPhoto[] = useMemo(() => {
    return selectedPhotoIds.map(photoId => {
      const photo = photos.find(p => p.id === photoId);
      return {
        id: photoId,
        url: photo?.url || '',
        thumbnailUrl: photo?.thumbnailUrl || photo?.url,
        name: photo?.name,
      };
    }).filter(p => p.url);
  }, [selectedPhotoIds, photos]);

  // 🆕 Handler per aprire il modale di conferma (solo per selezione libera)
  const handleOpenConfirmModal = useCallback(() => {
    if (selectedPhotoIds.length === 0) {
      toast({
        title: "Nessuna foto selezionata",
        description: "Seleziona almeno una foto prima di confermare.",
        variant: "destructive",
      });
      return;
    }
    setShowSelectionConfirmModal(true);
  }, [selectedPhotoIds.length, toast]);

  if (isLoadingPhotos) {
    return (
      <div className="min-h-screen bg-off-white">
        <Navigation galleryOwner="Caricamento..." />
        <div className="py-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <Skeleton className="h-10 w-80 mb-2" />
            <Skeleton className="h-6 w-60 mb-4" />

            {/* ⏱️ Stima tempo di caricamento */}
            {galleryData?.photoCount && galleryData.photoCount > 0 && (
              <div className="mb-8 bg-gradient-to-r from-sage/10 to-mint/10 border border-sage/30 rounded-xl p-4 shadow-sm max-w-lg">
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0">
                    <div className="animate-spin rounded-full h-8 w-8 border-3 border-sage border-t-transparent"></div>
                  </div>
                  <div>
                    <p className="text-blue-gray font-medium">
                      📷 Caricamento di <strong>{galleryData.photoCount}</strong> foto in corso...
                    </p>
                    {loadingTimeEstimate && (
                      <p className="text-sm text-gray-600 mt-1">
                        ⏱️ Tempo stimato: <strong>{loadingTimeEstimate}</strong>
                      </p>
                    )}
                    <p className="text-xs text-gray-500 mt-2">
                      💡 Attendi il completamento prima di iniziare a sfogliare o selezionare
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8">
              {[...Array(9)].map((_, i) => (
                <Skeleton key={i} className="w-full h-60 rounded-md" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!galleryData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Galleria non trovata</h1>
          <p className="text-gray-600 mb-6">
            La galleria che stai cercando potrebbe non esistere o essere stata
            rimossa. Verifica il link ricevuto dagli organizzatori dell'evento o
            contatta il servizio clienti.
          </p>
          <button
            className="px-4 py-2 bg-sage-600 text-white rounded-md hover:bg-sage-700"
            onClick={() => navigate(createUrl("/"))}
          >
            Torna alla Home
          </button>
        </div>
      </div>
    );
  }

  // Determina la classe del tema basata su galleryData.specialTheme
  const currentTheme = galleryData?.specialTheme;
  const themeClass =
    currentTheme && currentTheme !== "none" ? `theme-${currentTheme}` : "";

  // 🚀 Pre-fetch likes/commenti per tutte le foto della galleria in batch (1-2 query
  // totali invece di 3 per foto). Stabile rispetto a filtri/ordinamento perché
  // usa allPhotos (sorgente non filtrata).
  const interactionPhotoIds = allPhotos
    .map((p: any) => p?.id)
    .filter((x: any): x is string => typeof x === "string" && x.length > 0);

  return (
    <GalleryInteractionsProvider
      galleryId={galleryData.id || ""}
      photoIds={interactionPhotoIds}
      enabled={!!galleryData.id && interactionPhotoIds.length > 0}
    >
    <div
      className={`min-h-screen ${themeClass || "bg-off-white"} custom-cursor`}
    >
      <Navigation galleryOwner={galleryData.name} galleryCode={id} />

      <div>
        {/* Intestazione galleria */}
        <GalleryHeader
          name={galleryData.name}
          date={galleryData.date}
          location={galleryData.location}
          description={galleryData.description}
          coverImageUrl={galleryData.coverImageUrl}
          coverImageMobile={galleryData.coverImageMobile}
          coverImageDesktop={galleryData.coverImageDesktop}
          coverImageMobilePosition={(galleryData as any).coverImageMobilePosition}
          coverImageDesktopPosition={(galleryData as any).coverImageDesktopPosition}
          headerTheme={(galleryData as any).headerTheme}
          galleryId={id}
          galleryCode={galleryData.code}
        />

        {/* Countdown dell'evento - Nascosto in modalità selezione */}
        {eventDate && !isSelectionMode && (
          <div className="container mx-auto px-4 py-6">
            <PrettyCountdown
              targetDate={eventDate}
              title="Riviviamo insieme i momenti più belli"
              eventLabel="della celebrazione"
              pastMessageTemplate={(date) => {
                const now = new Date();
                const eventDate = new Date(date);
                const diffTime = now.getTime() - eventDate.getTime();
                const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

                if (diffDays < 30) {
                  return `Sono passati ${diffDays} giorni da questo giorno speciale ✨`;
                } else if (diffDays < 365) {
                  const months = Math.floor(diffDays / 30);
                  return `${months === 1 ? "È passato 1 mese" : `Sono passati ${months} mesi`} da questo giorno speciale ✨`;
                } else {
                  const years = Math.floor(diffDays / 365);
                  const remainingDays = diffDays % 365;
                  const months = Math.floor(remainingDays / 30);

                  if (months === 0) {
                    return `${years === 1 ? "È passato 1 anno" : `Sono passati ${years} anni`} da questo giorno speciale ✨`;
                  } else {
                    return `${years === 1 ? "È passato 1 anno" : `Sono passati ${years} anni`} e ${months} ${months === 1 ? "mese" : "mesi"} da questo giorno speciale ✨`;
                  }
                }
              }}
              variant="banner"
              afterMode="showDate"
              compactOnMobile
              showLabels
              className="mx-auto max-w-2xl"
            />
          </div>
        )}

        {/* Video YouTube se presente */}
        <YouTubeEmbed
          videoUrl={galleryData.youtubeUrl}
          videoUrls={galleryData.youtubeUrls}
        />

        <main>
          <div className="max-w-7xl mx-auto sm:px-6 lg:px-8">
            <div className="px-4 py-4">
              {/* Tab per switchare tra foto del fotografo, ospiti e vocali segreti */}
              <div className="flex items-center justify-center mb-8">
                <TooltipProvider>
                  <div className="flex bg-gray-100 rounded-lg p-1">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => setActiveTab("photographer")}
                          className={`px-4 sm:px-6 py-2 rounded-md font-medium transition-all text-sm sm:text-base ${
                            activeTab === "photographer"
                              ? "bg-white shadow-sm text-blue-gray"
                              : "text-gray-600 hover:text-blue-gray"
                          }`}
                        >
                          <span className="hidden sm:inline">
                            Foto del fotografo
                          </span>
                          <span className="sm:hidden">Fotografo</span>
                          <span className="ml-1">({photos.length})</span>
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="text-sm">
                        <p>
                          Visualizza le foto professionali scattate dal
                          fotografo
                        </p>
                      </TooltipContent>
                    </Tooltip>

                    {/* Tab Ospiti - Nascosto in modalità selezione */}
                    {!isSelectionMode && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => setActiveTab("guests")}
                            className={`px-4 sm:px-6 py-2 rounded-md font-medium transition-all text-sm sm:text-base ${
                              activeTab === "guests"
                                ? "bg-white shadow-sm text-blue-gray"
                                : "text-gray-600 hover:text-blue-gray"
                            }`}
                          >
                            <span className="hidden sm:inline">
                              Foto degli ospiti
                            </span>
                            <span className="sm:hidden">Ospiti</span>
                            <span className="ml-1">({guestPhotos.length})</span>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="text-sm">
                          <p>Guarda le foto caricate dagli ospiti dell'evento</p>
                        </TooltipContent>
                      </Tooltip>
                    )}

                    {/* Tab Vocali - Nascosto in modalità selezione */}
                    {!isSelectionMode && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => setActiveTab("voice-memos")}
                            className={`px-4 sm:px-6 py-2 rounded-md font-medium transition-all text-sm sm:text-base flex items-center gap-2 ${
                              activeTab === "voice-memos"
                                ? "bg-gradient-to-r from-sage-100 to-blue-gray-100 shadow-lg text-sage-800 border border-sage-200"
                                : "text-gray-600 hover:text-sage-700 hover:bg-sage-50"
                            }`}
                          >
                            <svg
                              className="h-4 w-4"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                              />
                            </svg>
                            <span className="hidden sm:inline">
                              Vocali Segreti
                            </span>
                            <span className="sm:hidden">Vocali</span>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="text-sm">
                          <p>
                            Ascolta i messaggi vocali privati lasciati dagli
                            ospiti
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    )}

                    {/* Tab Storia - Mostra solo se esiste una storia o se l'admin sta caricando */}
                    {(coupleStory ||
                      showStoryUpload ||
                      (isAdmin && activeTab === "story")) && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => {
                              setActiveTab("story");
                              // 🔧 FIX: Non forzare reload - evita loop infinito
                              console.log(
                                "📘 Click tab Storia - no reload forzato",
                              );
                            }}
                            className={`px-4 sm:px-6 py-2 rounded-md font-medium transition-all text-sm sm:text-base flex items-center gap-2 ${
                              activeTab === "story"
                                ? "bg-gradient-to-r from-terracotta-100 to-cream-100 shadow-lg text-terracotta-800 border border-terracotta-200"
                                : "text-gray-600 hover:text-terracotta-700 hover:bg-terracotta-50"
                            }`}
                          >
                            <BookOpen className="h-4 w-4" />
                            <span className="hidden sm:inline">
                              Storia della Coppia
                            </span>
                            <span className="sm:hidden">Storia</span>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="text-sm">
                          <p>
                            Leggi la storia d'amore della coppia in un libro
                            digitale
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    )}

                    {/* Pulsante Aggiungi Storia - Solo per Admin quando non c'è storia */}
                    {isAdmin && !coupleStory && !showStoryUpload && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => {
                              setShowStoryUpload(true);
                              setActiveTab("story");
                            }}
                            className="px-4 sm:px-6 py-2 rounded-md font-medium transition-all text-sm sm:text-base flex items-center gap-2 bg-terracotta-50 text-terracotta-700 hover:bg-terracotta-100 hover:text-terracotta-800 border border-terracotta-200 shadow-sm"
                          >
                            <BookOpen className="h-4 w-4" />
                            <span className="hidden sm:inline">
                              Aggiungi Storia
                            </span>
                            <span className="sm:hidden">+ Storia</span>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="text-sm">
                          <p>
                            Carica la storia d'amore della coppia da ChatGPT
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    )}

                    {/* Pulsante Edit Gallery - Solo per Admin */}
                    {isAdmin && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => navigate(`/admin/gallery/${id}/manage`)}
                            className="px-4 sm:px-6 py-2 rounded-md font-medium transition-all text-sm sm:text-base flex items-center gap-2 bg-light-mint text-blue-gray hover:bg-mint hover:text-dark-sage border border-sage/30 shadow-sm"
                          >
                            <Edit3 className="h-4 w-4" />
                            <span className="hidden sm:inline">
                              Gestisci Galleria
                            </span>
                            <span className="sm:hidden">Gestisci</span>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="text-sm">
                          <p>Modifica galleria e gestisci foto (solo admin)</p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </TooltipProvider>
              </div>

              {/* Barra con filtri e azioni - solo per tab fotografo */}
              {activeTab === "photographer" && (
                <div className="space-y-4 mb-6">
                  {/* Filtri - sempre sopra su mobile */}
                  <div className="w-full">
                    <GalleryFilter
                      onFilterChange={handleFilterChange}
                      totalPhotos={photos.length}
                      activeFilters={areFiltersActive}
                      resetFilters={resetFilters}
                    />
                  </div>

                  {/* Banner precaricamento galleria */}
                  <GalleryPreloadBanner
                    preload={galleryPreload}
                    photoUrls={allDisplayPhotos.map(p => p.thumbnailUrl || p.url).filter(Boolean)}
                  />
                </div>
              )}

              {/* Sezione caricamento foto per ospiti con call-to-action accattivante */}
              {activeTab === "guests" && (
                <div className="mb-8">
                  {/* Call-to-action accattivante */}
                  <div className="bg-gradient-to-r from-sage/5 to-blue-gray/5 border border-sage/20 rounded-xl p-6 mb-4">
                    <div className="text-center">
                      <div className="flex justify-center mb-4">
                        <div className="bg-sage/10 p-4 rounded-full">
                          <svg
                            className="w-8 h-8 text-sage"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                            />
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                            />
                          </svg>
                        </div>
                      </div>
                      <h3 className="text-lg font-semibold text-blue-gray mb-2">
                        🎉 Condividi i tuoi ricordi speciali!
                      </h3>
                      <p className="text-sm text-gray-600 mb-6 max-w-md mx-auto">
                        Hai catturato momenti magici? Carica le tue foto e aiuta
                        a completare la storia di questo giorno indimenticabile!
                      </p>

                      <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="w-full sm:w-auto">
                                <GuestUpload
                                  galleryId={galleryData.id}
                                  galleryName={galleryData.name}
                                  onPhotosUploaded={() => {
                                    handleRefreshPhotos();
                                  }}
                                />
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="text-sm">
                              <p>
                                Aggiungi le tue foto personali alla galleria
                                degli ospiti
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </div>
                  </div>

                  {/* Statistiche rapide */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-center">
                    <div className="bg-white/60 backdrop-blur-sm rounded-lg p-3 border border-gray-100">
                      <div className="text-lg font-bold text-sage">
                        {guestPhotos.length}
                      </div>
                      <div className="text-xs text-gray-600">Foto caricate</div>
                    </div>
                    <div className="bg-white/60 backdrop-blur-sm rounded-lg p-3 border border-gray-100">
                      <div className="text-lg font-bold text-sage">
                        {
                          new Set(guestPhotos.map((p) => p.uploaderEmail || ""))
                            .size
                        }
                      </div>
                      <div className="text-xs text-gray-600">
                        Ospiti partecipanti
                      </div>
                    </div>
                    <div className="bg-white/60 backdrop-blur-sm rounded-lg p-3 border border-gray-100 col-span-2 sm:col-span-1">
                      <div className="text-lg font-bold text-sage">📸</div>
                      <div className="text-xs text-gray-600">
                        Ogni ricordo conta
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Azioni per tab vocali segreti */}
              {activeTab === "voice-memos" && (
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-6">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="w-full sm:w-auto">
                          <VoiceMemoUpload
                            galleryId={galleryData.id}
                            galleryName={galleryData.name}
                            userEmail={userInfo.email}
                            userName={userInfo.displayName}
                            onUploadComplete={() => {
                              // Trigger refresh of voice memos list
                              setRefreshTrigger((prev) => prev + 1);
                            }}
                          />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="text-sm">
                        <p>
                          Registra un messaggio vocale privato per gli sposi
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              )}

              {/* Azioni per tab storia - Solo Admin */}
              {activeTab === "story" &&
                isAdmin &&
                coupleStory &&
                !showStoryUpload && (
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-6">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            onClick={() => setShowStoryUpload(true)}
                            className="bg-terracotta-600 hover:bg-terracotta-700 text-white"
                          >
                            <BookOpen className="h-4 w-4 mr-2" />
                            Aggiorna Storia
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="text-sm">
                          <p>
                            Carica una nuova versione della storia della coppia
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                )}

              {/* Contenuto del tab selezionato */}
              {activeTab === "photographer" && (
                <div>
                  {/* Discrete registration link for non-authenticated users - only show when not logged in and not in selection mode */}
                  {!isAuthenticated && !isSelectionMode && (
                    <div className="mb-6 text-center">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() => {
                                const registrationSection =
                                  document.getElementById(
                                    "registration-section",
                                  );
                                registrationSection?.scrollIntoView({
                                  behavior: "smooth",
                                });
                              }}
                              className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-sage-100 to-blue-gray-100 hover:from-sage-200 hover:to-blue-gray-200 text-sage-800 rounded-full border border-sage-300 transition-all duration-300 hover:shadow-md text-sm font-medium"
                            >
                              <svg
                                className="h-4 w-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                                />
                              </svg>
                              🎁 Sblocca tutte le funzionalità - Scopri i
                              vantaggi
                            </button>
                          </TooltipTrigger>
                          <TooltipContent
                            side="bottom"
                            className="text-sm max-w-xs"
                          >
                            <p>
                              Registrati per commentare, mettere "mi piace" e
                              accedere a tutte le funzionalità della galleria
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  )}

                  {displayPhotos.length === 0 ? (
                    <div className="text-center py-12">
                      <div className="flex flex-col items-center">
                        <h3 className="text-xl font-playfair text-blue-gray mb-2">
                          {showOnlySelected
                            ? "Nessuna foto selezionata"
                            : areFiltersActive
                              ? "Nessuna foto corrisponde ai filtri selezionati"
                              : "Nessuna foto del fotografo"}
                        </h3>
                        <p className="text-gray-500">
                          {showOnlySelected
                            ? "Inizia a selezionare le tue foto preferite!"
                            : areFiltersActive
                              ? "Prova a modificare i criteri di filtro per visualizzare più foto."
                              : "Non ci sono ancora foto del fotografo in questa galleria."}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div>
                      {/* ⚠️ Warning: Insufficient photos in gallery - ONLY for single-product mode */}
                      {/* In multi-product/bundle mode, the same photo can be assigned to multiple products */}
                      {isSelectionMode && selectionStatus !== "completed" && !isMultiProductMode && requiredPhotoCount > 0 && photos.length < requiredPhotoCount && (
                        <div className="mb-6 bg-gradient-to-r from-yellow-100 to-orange-100 border-2 border-yellow-400 rounded-lg p-4 text-center">
                          <div className="flex items-center justify-center gap-2 text-yellow-700">
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                            </svg>
                            <span className="font-semibold">
                              Attenzione: La galleria contiene solo {photos.length} foto, ma ne servono {requiredPhotoCount} per la selezione.
                            </span>
                          </div>
                          <p className="text-yellow-600 text-sm mt-1">
                            Il fotografo deve caricare altre foto prima di poter completare la selezione.
                          </p>
                        </div>
                      )}
                      
                      {/* Selection Mode Banner (Task 13 + Tooltip/Info Guide) - nascosto quando completata */}
                      {isSelectionMode && selectionStatus !== "completed" && (
                        <div className="mb-6 bg-gradient-to-r from-sage/20 to-blue-gray/20 border-2 border-sage rounded-lg p-6 text-center relative">
                          {/* Info Icon Button - Top Right */}
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <button
                                className="absolute top-4 right-4 w-8 h-8 rounded-full bg-sage/80 hover:bg-sage text-white flex items-center justify-center transition-all shadow-md hover:shadow-lg"
                                data-testid="button-selection-help"
                              >
                                <Info className="h-4 w-4" />
                              </button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle className="text-2xl font-playfair flex items-center gap-2">
                                  <span className="text-3xl">📖</span>
                                  Guida alla Selezione Foto
                                </AlertDialogTitle>
                                <AlertDialogDescription className="text-left space-y-3 text-base">
                                  <div className="bg-sage/10 p-3 rounded-lg border border-sage/30">
                                    <p className="font-semibold text-sage mb-1">
                                      🎯 Obiettivo
                                    </p>
                                    <p className="text-gray-700">
                                      Devi selezionare esattamente{" "}
                                      <strong>{requiredPhotoCount} foto</strong>{" "}
                                      per il tuo album personalizzato.
                                    </p>
                                  </div>

                                  <div>
                                    <p className="font-semibold text-gray-800 mb-2">
                                      📝 Come funziona:
                                    </p>
                                    <ol className="space-y-2 text-gray-700 list-decimal list-inside">
                                      <li>
                                        <strong>Scorri le foto</strong> della
                                        galleria
                                      </li>
                                      <li>
                                        <strong>Clicca sulla foto</strong> che
                                        vuoi selezionare
                                      </li>
                                      <li>
                                        Vedrai un{" "}
                                        <strong>✓ checkbox verde</strong>{" "}
                                        nell'angolo e la scritta{" "}
                                        <strong>"SELEZIONATA"</strong>
                                      </li>
                                      <li>
                                        <strong>Clicca di nuovo</strong> sulla
                                        foto per deselezionarla
                                      </li>
                                      <li>
                                        Il <strong>counter</strong> ti mostra il
                                        progresso ({selectedPhotoIds.length}/
                                        {requiredPhotoCount})
                                      </li>
                                      <li>
                                        Quando raggiungi{" "}
                                        <strong>
                                          {requiredPhotoCount}/
                                          {requiredPhotoCount}
                                        </strong>
                                        , scorri in fondo e clicca{" "}
                                        <strong>"Conferma Selezione"</strong>
                                      </li>
                                    </ol>
                                  </div>

                                  <div className="bg-light-mint p-3 rounded-lg border border-sage/30">
                                    <p className="font-semibold text-blue-gray mb-1">
                                      💡 Suggerimenti
                                    </p>
                                    <ul className="text-blue-gray/80 space-y-1 text-sm">
                                      <li>
                                        • Prenditi il tempo necessario per
                                        scegliere le tue foto preferite
                                      </li>
                                      <li>
                                        • Puoi cambiare idea quante volte vuoi
                                        prima di confermare
                                      </li>
                                      <li>
                                        • Le foto selezionate hanno un{" "}
                                        <strong>bordo verde spesso</strong> e la
                                        scritta "SELEZIONATA"
                                      </li>
                                      <li>
                                        • Dopo aver confermato, la selezione
                                        sarà <strong>definitiva</strong> e
                                        visibile allo studio
                                      </li>
                                      {selectionDeadline && (
                                        <li>
                                          • Ricorda la scadenza:{" "}
                                          <strong>
                                            {convertFirestoreTimestamp(
                                              selectionDeadline,
                                            )?.toLocaleDateString("it-IT")}
                                          </strong>
                                        </li>
                                      )}
                                    </ul>
                                  </div>

                                  {isDeadlinePassed && (
                                    <div className="bg-terracotta/10 p-3 rounded-lg border border-terracotta/30">
                                      <p className="font-semibold text-terracotta">
                                        ⚠️ La scadenza è superata!
                                      </p>
                                      <p className="text-sm text-blue-gray/80 mt-1">
                                        Contatta lo studio per ricevere
                                        assistenza.
                                      </p>
                                    </div>
                                  )}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogAction className="bg-sage hover:bg-sage/90">
                                  Ho capito!
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>

                          <h3 className={`text-2xl font-playfair mb-3 ${isDislikeMode ? 'text-red-700' : isUnlimitedSelection ? 'text-terracotta' : 'text-blue-gray'}`}>
                            {isDislikeMode ? '✗ Modalità "Non mi piace" ✗' : isUnlimitedSelection ? '🧡 Selezione Libera 🧡' : '✨ Modalità Selezione Foto ✨'}
                          </h3>
                          <p className="text-lg text-gray-700 mb-4">
                            {isDislikeMode ? (
                              <>
                                Segna le foto che{" "}
                                <strong className="text-red-600">
                                  NON vuoi includere
                                </strong>{" "}
                                — salveremo automaticamente tutte le altre!
                              </>
                            ) : isUnlimitedSelection ? (
                              <>
                                Seleziona liberamente{" "}
                                <strong className="text-terracotta">
                                  tutte le foto che desideri
                                </strong>{" "}
                                senza limiti!
                              </>
                            ) : (
                              <>
                                Seleziona le tue{" "}
                                <strong className="text-sage">
                                  {requiredPhotoCount} foto preferite
                                </strong>{" "}
                                per il tuo album personalizzato!
                              </>
                            )}
                          </p>

                          {/* Istruzioni chiare - diverse per dislike, unlimited, single-product, multi-product */}
                          {isDislikeMode ? (
                            // Modalità "Non mi piace": istruzioni dedicate
                            <div className="bg-red-50 rounded-lg p-4 mb-4 border border-red-200">
                              <p className="font-semibold text-red-700 mb-2">
                                ✗ Come escludere le foto:
                              </p>
                              <ol className="text-left text-sm text-gray-700 space-y-1.5 list-decimal list-inside">
                                <li>
                                  <strong>Scorri le foto</strong> della galleria
                                </li>
                                <li>
                                  <strong>Clicca sulla foto</strong> che NON vuoi tenere
                                </li>
                                <li>
                                  Vedrai un <strong className="text-red-600">overlay rosso ✗</strong> — la foto è esclusa
                                </li>
                                <li>
                                  <strong>Clicca di nuovo</strong> per includere di nuovo la foto
                                </li>
                                <li>
                                  Quando hai finito, clicca{" "}
                                  <strong>"Conferma esclusioni"</strong> in fondo alla pagina
                                </li>
                              </ol>
                            </div>
                          ) : isUnlimitedSelection ? (
                            // Selezione libera: istruzioni dedicate
                            <div className="bg-terracotta/10 rounded-lg p-4 mb-4 border border-terracotta/30">
                              <p className="font-semibold text-terracotta mb-2">
                                🧡 Come selezionare:
                              </p>
                              <ol className="text-left text-sm text-gray-700 space-y-1.5 list-decimal list-inside">
                                <li>
                                  <strong>Clicca sulla foto</strong> che vuoi
                                  selezionare
                                </li>
                                <li>
                                  Vedrai un <strong>✓ checkbox viola</strong> e la
                                  scritta "SELEZIONATA"
                                </li>
                                <li>
                                  Clicca di nuovo per{" "}
                                  <strong>deselezionare</strong>
                                </li>
                                <li>
                                  <strong>Nessun limite!</strong> Seleziona tutte le foto che vuoi
                                </li>
                                <li>
                                  Quando hai finito, clicca{" "}
                                  <strong>"Ho finito"</strong> per confermare
                                </li>
                              </ol>
                            </div>
                          ) : !isMultiProductMode ? (
                            // Single-product legacy: click sulla foto
                            <div className="bg-white/60 rounded-lg p-4 mb-4 border border-sage/30">
                              <p className="font-semibold text-sage mb-2">
                                📋 Come selezionare:
                              </p>
                              <ol className="text-left text-sm text-gray-700 space-y-1.5 list-decimal list-inside">
                                <li>
                                  <strong>Clicca sulla foto</strong> che vuoi
                                  selezionare
                                </li>
                                <li>
                                  Vedrai un <strong>✓ checkbox verde</strong> e la
                                  scritta "SELEZIONATA"
                                </li>
                                <li>
                                  Clicca di nuovo per{" "}
                                  <strong>deselezionare</strong>
                                </li>
                                <li>
                                  Il counter mostra il progresso:{" "}
                                  <strong>
                                    {selectedPhotoIds.length}/{requiredPhotoCount}
                                  </strong>
                                </li>
                                <li>
                                  Quando hai selezionato tutte le{" "}
                                  {requiredPhotoCount} foto, clicca{" "}
                                  <strong>"Conferma Selezione"</strong> in fondo
                                  alla pagina
                                </li>
                              </ol>
                            </div>
                          ) : (
                            // Multi-product: apri foto e usa pannello assegnazione
                            <div className="bg-white/60 rounded-lg p-4 mb-4 border border-sage/30">
                              <p className="font-semibold text-sage mb-2">
                                📋 Come assegnare le foto ai prodotti:
                              </p>
                              <ol className="text-left text-sm text-gray-700 space-y-1.5 list-decimal list-inside">
                                <li>
                                  <strong>Clicca su una foto</strong> per aprirla a schermo intero
                                </li>
                                <li>
                                  Nel pannello in basso, <strong>tocca i prodotti</strong> per assegnare la foto
                                </li>
                                <li>
                                  Puoi <strong>riutilizzare</strong> la stessa foto per più prodotti (es: Album + Stampe)
                                </li>
                                <li>
                                  Usa le <strong>frecce</strong> per navigare tra le foto senza chiudere
                                </li>
                                <li>
                                  Il <strong>progresso</strong> per ogni prodotto è mostrato in tempo reale
                                </li>
                                <li>
                                  Quando hai assegnato tutte le foto, clicca{" "}
                                  <strong>"Conferma Selezione"</strong> in fondo alla pagina
                                </li>
                              </ol>
                            </div>
                          )}

                          {/* 📊 Multi-Product Progress Cards */}
                          {calculateProductProgress && (
                            <div className="mb-6 bg-white/80 rounded-lg p-4 border-2 border-sage/30">
                              <h4 className="font-semibold text-sage mb-3 text-center">📊 Progresso per Prodotto</h4>
                              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                                {calculateProductProgress.map((progress, idx) => (
                                  <div
                                    key={idx}
                                    className={`p-3 rounded-lg border-2 transition-all ${
                                      progress.isComplete
                                        ? 'bg-mint/30 border-sage'
                                        : progress.assignedCount > 0
                                          ? 'bg-cream border-terracotta/50'
                                          : 'bg-beige/30 border-beige'
                                    }`}
                                    data-testid={`product-progress-${idx}`}
                                  >
                                    <div className="flex items-start justify-between mb-2">
                                      <p className="text-xs font-semibold text-blue-gray line-clamp-2">
                                        {progress.prodottoNome}
                                      </p>
                                      {progress.isComplete && (
                                        <span className="text-sage">✓</span>
                                      )}
                                    </div>
                                    <p className="text-lg font-bold text-blue-gray mb-1">
                                      {progress.assignedCount}/{progress.isUnlimited ? '∞' : progress.requiredCount}
                                    </p>
                                    <div className="w-full bg-beige/50 rounded-full h-1.5 overflow-hidden">
                                      <div
                                        className={`h-full transition-all ${
                                          progress.isComplete
                                            ? 'bg-sage'
                                            : progress.assignedCount > 0
                                              ? 'bg-terracotta'
                                              : 'bg-beige'
                                        }`}
                                        style={{ width: `${progress.percentage}%` }}
                                      />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* 🎨 UX Enhancement #4: Progress Bar / Counter */}
                          {isDislikeMode ? (
                            // Modalità dislike: mostra contatore foto escluse
                            <div className="mb-4 p-4 bg-red-50 border-2 border-red-200 rounded-xl">
                              <div className="flex items-center justify-center gap-3">
                                <span className="text-red-500 text-2xl">✗</span>
                                <div className="text-center">
                                  <p className="text-sm text-red-600 font-medium">Foto escluse</p>
                                  <p className="text-3xl font-bold text-red-600">{dislikedPhotoIds.size} / {photos.length}</p>
                                  <p className="text-xs text-gray-500 mt-1">Verranno salvate {photos.length - dislikedPhotoIds.size} foto</p>
                                </div>
                                <span className="text-red-500 text-2xl">✗</span>
                              </div>
                            </div>
                          ) : isUnlimitedSelection ? (
                            // Selezione libera: mostra solo contatore senza progress bar
                            <div className="mb-4 p-4 bg-terracotta/10 border-2 border-terracotta/30 rounded-xl">
                              <div className="flex items-center justify-center gap-3">
                                <span className="text-terracotta text-2xl">🧡</span>
                                <div className="text-center">
                                  <p className="text-sm text-terracotta font-medium">Foto selezionate</p>
                                  <p className="text-3xl font-bold text-terracotta">{selectedPhotoIds.length}</p>
                                </div>
                                <span className="text-terracotta text-2xl">🧡</span>
                              </div>
                            </div>
                          ) : (
                            <div className="mb-4">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-medium text-blue-gray">
                                  Progresso {calculateProductProgress ? "Totale" : ""}
                                </span>
                                <span className="text-sm font-bold text-sage">
                                  {calculateProductProgress ? (
                                    (() => {
                                      const totalAssigned = calculateProductProgress.reduce(
                                        (sum, p) => sum + p.assignedCount,
                                        0
                                      );
                                      const totalRequired = calculateProductProgress.reduce(
                                        (sum, p) => sum + p.requiredCount,
                                        0
                                      );
                                      return `${totalAssigned}/${totalRequired}`;
                                    })()
                                  ) : (
                                    `${selectedPhotoIds.length}/${requiredPhotoCount}`
                                  )}
                                </span>
                              </div>
                              <div className="w-full bg-beige/50 rounded-full h-3 overflow-hidden">
                                <div
                                  className="h-full bg-gradient-to-r from-sage to-mint transition-all duration-500 ease-out rounded-full"
                                  style={{
                                    width: calculateProductProgress
                                      ? `${Math.min(
                                          (calculateProductProgress.reduce(
                                            (sum, p) => sum + p.assignedCount,
                                            0
                                          ) /
                                            Math.max(
                                              calculateProductProgress.reduce(
                                                (sum, p) => sum + p.requiredCount,
                                                0
                                              ),
                                              1
                                            )) *
                                            100,
                                          100
                                        )}%`
                                      : `${Math.min((selectedPhotoIds.length / requiredPhotoCount) * 100, 100)}%`,
                                  }}
                                />
                              </div>
                            </div>
                          )}

                          {/* 🎨 UX Enhancement #6: Smart Message */}
                          {smartMessage && (
                            <div
                              className={`mb-4 p-3 rounded-lg bg-white/80 border-2 ${smartMessage.color === "text-sage" ? "border-sage" : smartMessage.color === "text-terracotta" ? "border-terracotta/50" : "border-blue-gray/30"}`}
                            >
                              <p
                                className={`text-center font-semibold ${smartMessage.color}`}
                              >
                                <span className="text-2xl mr-2">
                                  {smartMessage.emoji}
                                </span>
                                {smartMessage.text}
                              </p>
                            </div>
                          )}

                          {/* 🎨 UX Enhancement #1 & #5: Toggle Filtro + Sidebar + Reset */}
                          <div className="flex items-center justify-center gap-3 mb-4 flex-wrap">
                            <Button
                              variant={showOnlySelected ? "default" : "outline"}
                              size="sm"
                              onClick={() =>
                                setShowOnlySelected(!showOnlySelected)
                              }
                              disabled={selectedPhotoIds.length === 0}
                              className={
                                showOnlySelected
                                  ? "bg-sage hover:bg-sage/90"
                                  : ""
                              }
                              data-testid="button-toggle-selected-only"
                            >
                              {showOnlySelected
                                ? "✓ Solo Selezionate"
                                : "👁️ Tutte le Foto"}
                              {selectedPhotoIds.length > 0 &&
                                ` (${selectedPhotoIds.length})`}
                            </Button>

                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setShowReviewModal(true)}
                              disabled={selectedPhotoIds.length === 0}
                              data-testid="button-open-review"
                            >
                              🖼️ Rivedi Selezione
                              {selectedPhotoIds.length > 0 &&
                                ` (${selectedPhotoIds.length})`}
                            </Button>

                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setShowResetDialog(true)}
                              disabled={selectedPhotoIds.length === 0}
                              className="text-red-600 hover:bg-red-50 hover:text-red-700 border-red-200"
                              data-testid="button-reset-selection"
                            >
                              🔄 Ricomincia
                            </Button>
                          </div>
                          {selectionDeadline && (
                            <p className="text-sm text-gray-500">
                              ⏰ Scadenza:{" "}
                              <strong>
                                {convertFirestoreTimestamp(
                                  selectionDeadline,
                                )?.toLocaleDateString("it-IT") ||
                                  "Data non disponibile"}
                              </strong>
                            </p>
                          )}
                          {isDeadlinePassed && (
                            <div className="mt-4 bg-red-100 border-2 border-red-300 rounded-lg p-3">
                              <p className="text-red-700 font-semibold">
                                ⚠️ La scadenza è superata! Contatta lo studio
                                per assistenza.
                              </p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* 🎨 UX Enhancement #5: Sidebar con miniature selezionate */}
                      {isSelectionMode && selectionStatus !== "completed" && (
                        <Sheet open={showSidebar} onOpenChange={setShowSidebar}>
                          <SheetContent
                            side="right"
                            className="w-[400px] sm:w-[540px] overflow-y-auto"
                          >
                            <SheetHeader>
                              <SheetTitle className="font-playfair text-2xl text-sage">
                                🖼️ Foto Selezionate
                              </SheetTitle>
                              <SheetDescription>
                                {selectedPhotoIds.length === 0
                                  ? "Nessuna foto selezionata ancora"
                                  : `${selectedPhotoIds.length} di ${requiredPhotoCount} foto selezionate`}
                              </SheetDescription>
                            </SheetHeader>

                            <div className="mt-6 space-y-4">
                              {selectedPhotoIds.length === 0 ? (
                                <div className="text-center py-12 text-gray-500">
                                  <p className="text-4xl mb-4">📷</p>
                                  <p>
                                    Inizia a selezionare le tue foto preferite!
                                  </p>
                                </div>
                              ) : (
                                <div className="grid grid-cols-2 gap-3">
                                  {selectedPhotoIds.map((photoId, idx) => {
                                    const photo = photos.find(
                                      (p) => p.id === photoId,
                                    );
                                    if (!photo) return null;

                                    return (
                                      <div
                                        key={photoId}
                                        className="relative group"
                                      >
                                        <div className="aspect-square overflow-hidden rounded-lg border-2 border-sage/30">
                                          <img
                                            src={photo.thumbnailUrl || photo.url}
                                            alt={`Selezionata ${idx + 1}`}
                                            className="w-full h-full object-cover"
                                            loading="lazy"
                                            decoding="async"
                                          />
                                        </div>
                                        <div className="absolute top-2 left-2 bg-sage text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center">
                                          {idx + 1}
                                        </div>
                                        <button
                                          onClick={() =>
                                            handleTogglePhotoSelection(photoId)
                                          }
                                          className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 text-white rounded-full w-7 h-7 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                                          title="Rimuovi selezione"
                                        >
                                          ✕
                                        </button>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </SheetContent>
                        </Sheet>
                      )}

                      {/* 🔄 Dialog Conferma Reset Selezione */}
                      <AlertDialog open={showResetDialog} onOpenChange={setShowResetDialog}>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle className="text-xl font-playfair text-blue-gray">
                              🔄 Vuoi ricominciare da zero?
                            </AlertDialogTitle>
                            <AlertDialogDescription className="text-gray-600">
                              Questa azione rimuoverà tutte le {selectedPhotoIds.length} foto selezionate
                              {isMultiProductMode && " e tutte le assegnazioni ai prodotti"}.
                              <br /><br />
                              <strong>Sei sicuro di voler procedere?</strong>
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter className="gap-3">
                            <Button
                              variant="outline"
                              onClick={() => setShowResetDialog(false)}
                              data-testid="button-cancel-reset"
                            >
                              Annulla
                            </Button>
                            <Button
                              variant="destructive"
                              onClick={handleResetSelection}
                              data-testid="button-confirm-reset"
                            >
                              Sì, ricomincia da zero
                            </Button>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>

                      {/* 🖼️ Modal Review Selezione - Riepilogo prima della conferma */}
                      <AlertDialog open={showReviewModal} onOpenChange={(open) => { setShowReviewModal(open); if (!open) setReviewLightboxPhoto(null); }}>
                        <AlertDialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                          <AlertDialogHeader>
                            <AlertDialogTitle className="text-2xl font-playfair text-blue-gray flex items-center gap-3">
                              Riepilogo Selezione
                              <span className={`text-base font-normal px-3 py-1 rounded-full ${isUnlimitedSelection ? 'text-terracotta bg-terracotta/10' : 'text-sage bg-sage/10'}`}>
                                {isUnlimitedSelection 
                                  ? `${selectedPhotoIds.length} foto` 
                                  : `${selectedPhotoIds.length}/${requiredPhotoCount} foto`}
                              </span>
                            </AlertDialogTitle>
                            <AlertDialogDescription className="text-gray-600">
                              {isUnlimitedSelection
                                ? `Hai selezionato ${selectedPhotoIds.length} foto. Rivedi le foto scelte prima di confermare.`
                                : (selectedPhotoIds.length >= requiredPhotoCount 
                                  ? "Hai completato la selezione! Rivedi le foto scelte prima di confermare."
                                  : `Hai selezionato ${selectedPhotoIds.length} foto su ${requiredPhotoCount} richieste.`)}
                            </AlertDialogDescription>
                          </AlertDialogHeader>

                          <div className="mt-4 space-y-6">
                            {/* Multi-Product View */}
                            {isMultiProductMode && productRequirements ? (
                              productRequirements.map((prod, idx) => {
                                const productIdStr = String(idx);
                                const assignedPhotoIds = Object.entries(photoAssignments)
                                  .filter(([, assignments]) => assignments.includes(productIdStr))
                                  .map(([photoId]) => photoId);
                                const productColors = [
                                  'border-sage bg-sage/5',
                                  'border-terracotta bg-terracotta/5',
                                  'border-blue-gray bg-blue-gray/5',
                                  'border-dark-sage bg-dark-sage/5',
                                  'border-mint bg-mint/5',
                                  'border-cream bg-cream/5',
                                ];
                                const colorClass = productColors[idx % productColors.length];
                                const requiredCount = Number(prod.prodottoNumeroFoto) || 0;
                                const hasNoLimit = requiredCount <= 0;
                                const isComplete = hasNoLimit || assignedPhotoIds.length >= requiredCount;

                                return (
                                  <div key={idx} className={`border-2 rounded-xl p-4 ${colorClass}`}>
                                    <div className="flex items-center justify-between mb-3">
                                      <h4 className="font-semibold text-lg text-blue-gray">
                                        {prod.prodottoNome}
                                      </h4>
                                      <span className={`text-sm font-bold px-3 py-1 rounded-full ${
                                        isComplete ? 'bg-sage text-white' : 'bg-terracotta/20 text-terracotta'
                                      }`}>
                                        {hasNoLimit 
                                          ? `${assignedPhotoIds.length} foto (∞)` 
                                          : `${assignedPhotoIds.length}/${requiredCount}`}
                                        {isComplete && !hasNoLimit && ' ✓'}
                                      </span>
                                    </div>
                                    {assignedPhotoIds.length === 0 ? (
                                      <div className="text-center py-6 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
                                        <p className="text-3xl mb-2">📷</p>
                                        <p className="text-sm text-gray-500">Nessuna foto assegnata</p>
                                        {!hasNoLimit && requiredCount > 0 && (
                                          <>
                                            <div className="w-24 h-1.5 bg-gray-200 rounded-full mx-auto mt-3 overflow-hidden">
                                              <div className="h-full bg-terracotta rounded-full" style={{ width: '0%' }} />
                                            </div>
                                            <p className="text-xs text-terracotta mt-2 font-medium">
                                              0/{requiredCount} - Mancano tutte le {requiredCount} foto
                                            </p>
                                          </>
                                        )}
                                        {hasNoLimit && (
                                          <p className="text-xs text-gray-400 mt-1">
                                            Nessun limite richiesto - puoi aggiungere quante ne vuoi
                                          </p>
                                        )}
                                      </div>
                                    ) : (
                                      <div>
                                        <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                                          {assignedPhotoIds.map((photoId, photoIdx) => {
                                            const photo = photos.find(p => p.id === photoId);
                                            if (!photo) return null;
                                            return (
                                              <div
                                                key={photoId}
                                                className="relative aspect-square cursor-pointer group/thumb"
                                                onClick={() => setReviewLightboxPhoto(photo.url)}
                                              >
                                                <img
                                                  src={photo.thumbnailUrl || photo.url}
                                                  alt={`Foto ${photoIdx + 1}`}
                                                  className="w-full h-full object-cover rounded-lg transition-opacity group-hover/thumb:opacity-80"
                                                  loading="lazy"
                                                  decoding="async"
                                                />
                                                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 transition-opacity">
                                                  <Expand className="w-5 h-5 text-white drop-shadow-lg" />
                                                </div>
                                                <span className="absolute bottom-1 right-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded">
                                                  {photoIdx + 1}
                                                </span>
                                              </div>
                                            );
                                          })}
                                        </div>
                                        {!hasNoLimit && requiredCount > 0 && (
                                          <div className="mt-3">
                                            <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                              <div 
                                                className={`h-full rounded-full transition-all ${isComplete ? 'bg-sage' : 'bg-terracotta'}`} 
                                                style={{ width: `${Math.min((assignedPhotoIds.length / requiredCount) * 100, 100)}%` }} 
                                              />
                                            </div>
                                            {!isComplete && (requiredCount - assignedPhotoIds.length) > 0 && (
                                              <p className="text-xs text-terracotta mt-1 text-center font-medium">
                                                ⚠️ Mancano ancora {requiredCount - assignedPhotoIds.length} foto
                                              </p>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })
                            ) : (
                              /* Single-Product View o Selezione Libera */
                              <div className={`border-2 rounded-xl p-4 ${isUnlimitedSelection ? 'border-terracotta/30 bg-terracotta/10' : 'border-sage/30 bg-sage/5'}`}>
                                <div className="flex items-center justify-between mb-3">
                                  <h4 className="font-semibold text-lg text-blue-gray">
                                    Foto Selezionate
                                  </h4>
                                  <span className={`text-sm font-bold px-3 py-1 rounded-full ${
                                    isUnlimitedSelection
                                      ? 'bg-terracotta text-white'
                                      : (selectedPhotoIds.length >= requiredPhotoCount 
                                        ? 'bg-sage text-white' 
                                        : 'bg-terracotta/20 text-terracotta')
                                  }`}>
                                    {isUnlimitedSelection 
                                      ? `${selectedPhotoIds.length} foto`
                                      : `${selectedPhotoIds.length}/${requiredPhotoCount}`}
                                    {!isUnlimitedSelection && selectedPhotoIds.length >= requiredPhotoCount && ' ✓'}
                                  </span>
                                </div>
                                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                                  {selectedPhotoIds.map((photoId, idx) => {
                                    const photo = photos.find(p => p.id === photoId);
                                    if (!photo) return null;
                                    return (
                                      <div
                                        key={photoId}
                                        className="relative aspect-square cursor-pointer group/thumb"
                                        onClick={() => setReviewLightboxPhoto(photo.url)}
                                      >
                                        <img
                                          src={photo.thumbnailUrl || photo.url}
                                          alt={`Foto ${idx + 1}`}
                                          className="w-full h-full object-cover rounded-lg transition-opacity group-hover/thumb:opacity-80"
                                          loading="lazy"
                                          decoding="async"
                                        />
                                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 transition-opacity">
                                          <Expand className="w-5 h-5 text-white drop-shadow-lg" />
                                        </div>
                                        <span className="absolute bottom-1 right-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded">
                                          {idx + 1}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>

                          <p className="text-xs text-gray-400 text-center mt-2">
                            Tocca una miniatura per vederla a tutto schermo
                          </p>

                          <AlertDialogFooter className="mt-6 gap-3 flex-col sm:flex-row">
                            <Button
                              variant="outline"
                              onClick={() => setShowReviewModal(false)}
                              className="w-full sm:w-auto"
                              data-testid="button-continue-editing"
                            >
                              ← Continua a modificare
                            </Button>
                            <Button
                                onClick={() => {
                                  setShowReviewModal(false);
                                  setTimeout(() => {
                                    handleConfirmSelection();
                                  }, 100);
                                }}
                                className="w-full sm:w-auto bg-sage hover:bg-sage/90"
                                data-testid="button-confirm-selection-modal"
                              >
                                ✓ Conferma Selezione
                              </Button>
                          </AlertDialogFooter>

                          {/* Overlay foto ingrandita dal riepilogo - DENTRO AlertDialogContent per evitare focus trap */}
                          {reviewLightboxPhoto && (
                            <div
                              className="fixed inset-0 z-[200] bg-black/95 flex items-center justify-center p-4"
                              onClick={() => setReviewLightboxPhoto(null)}
                              onKeyDown={(e) => { if (e.key === 'Escape') setReviewLightboxPhoto(null); }}
                              tabIndex={0}
                            >
                              <button
                                className="absolute top-4 right-4 text-white/80 hover:text-white p-2 z-10"
                                onClick={(e) => { e.stopPropagation(); setReviewLightboxPhoto(null); }}
                                aria-label="Chiudi"
                              >
                                <X className="w-7 h-7" />
                              </button>
                              <img
                                src={reviewLightboxPhoto}
                                alt="Foto ingrandita"
                                className="max-w-full max-h-full object-contain rounded-lg"
                                onClick={(e) => e.stopPropagation()}
                              />
                            </div>
                          )}
                        </AlertDialogContent>
                      </AlertDialog>

                      {/* Banner Istruzioni Multi-Prodotto - NASCOSTO per UX pulita */}
                      {false && isSelectionMode &&
                       selectionStatus !== "completed" &&
                       galleryData?.productRequirements &&
                       (galleryData?.productRequirements?.length ?? 0) > 1 && (
                        <div className="bg-gradient-to-r from-cream to-mint/20 border-2 border-sage/30 rounded-xl p-5 mb-6 shadow-md">
                          <div className="flex items-start gap-4">
                            <div className="flex-shrink-0 bg-blue-500 text-white rounded-full w-10 h-10 flex items-center justify-center text-xl">
                              ℹ️
                            </div>
                            <div className="flex-1">
                              <h4 className="font-bold text-blue-gray text-lg mb-2">
                                💡 Come funziona la selezione multi-prodotto
                              </h4>
                              <div className="text-sm text-gray-700 space-y-2">
                                <p>
                                  <strong>1.</strong> Clicca sui <span className="font-semibold text-blue-600">chip colorati</span> sotto ogni foto per assegnarla ai prodotti
                                </p>
                                <p>
                                  <strong>2.</strong> Puoi <span className="font-semibold text-terracotta">riutilizzare</span> la stessa foto per più prodotti (es: Album + Stampe)
                                </p>
                                <p>
                                  <strong>3.</strong> I colori ti aiutano a identificare ogni prodotto - guarda il <span className="font-semibold text-sage">progresso</span> in tempo reale qui sotto!
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Sticky Counter Progress Bar - Multi-Product Mode */}
                      {isSelectionMode &&
                       selectionStatus !== "completed" &&
                       galleryData?.productRequirements &&
                       (galleryData?.productRequirements?.length ?? 0) > 1 && (
                        <div className="sticky top-16 z-30 bg-gradient-to-r from-sage/10 to-blue-gray/10 backdrop-blur-md border-b-2 border-sage/30 shadow-lg mb-6 rounded-lg overflow-hidden">
                          <div className="px-4 py-3">
                            <div className="flex items-center justify-between gap-2 mb-3">
                              <span className="text-sm font-bold text-sage">📊 Progresso Selezione</span>
                              <Button
                                onClick={() => setShowProductSummary(true)}
                                variant="outline"
                                size="sm"
                                className="text-xs bg-white/90 hover:bg-white"
                                data-testid="button-open-product-summary"
                              >
                                📋 Riepilogo
                              </Button>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                              {calculateProductProgress?.map((prog, idx) => {
                                const productColors = [
                                  { bg: 'bg-sage', ring: 'ring-sage/30' },
                                  { bg: 'bg-terracotta', ring: 'ring-terracotta/30' },
                                  { bg: 'bg-blue-gray', ring: 'ring-blue-gray/30' },
                                  { bg: 'bg-dark-sage', ring: 'ring-dark-sage/30' },
                                  { bg: 'bg-mint', ring: 'ring-mint/30' },
                                  { bg: 'bg-cream', ring: 'ring-cream/30' },
                                ];
                                const color = productColors[idx % productColors.length];

                                return (
                                  <div key={idx} className={`bg-white/90 rounded-lg p-3 ring-2 ${color.ring}`}>
                                    <div className="flex items-start justify-between mb-2">
                                      <span className="text-xs font-semibold text-blue-gray truncate" title={prog.prodottoNome}>
                                        {prog.prodottoNome}
                                      </span>
                                      <span className={`text-xs font-bold ${prog.percentage === 100 ? 'text-sage' : 'text-blue-gray/70'}`}>
                                        {prog.assignedCount}/{prog.requiredCount}
                                      </span>
                                    </div>
                                    <div className="w-full bg-beige/50 rounded-full h-2">
                                      <div
                                        className={`h-full ${color.bg} rounded-full transition-all duration-300`}
                                        style={{ width: `${Math.min(prog.percentage, 100)}%` }}
                                      />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Sheet Riepilogo Prodotti */}
                      {isSelectionMode &&
                       selectionStatus !== "completed" &&
                       galleryData?.productRequirements &&
                       (galleryData?.productRequirements?.length ?? 0) > 1 && (
                        <Sheet open={showProductSummary} onOpenChange={setShowProductSummary}>
                          <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
                            <SheetHeader>
                              <SheetTitle className="text-xl font-playfair text-blue-gray">
                                📋 Riepilogo Prodotti
                              </SheetTitle>
                              <SheetDescription>
                                Visualizza il progresso per ogni prodotto e filtra le foto
                              </SheetDescription>
                            </SheetHeader>

                            <div className="mt-6 space-y-4">
                              {calculateProductProgress?.map((prog, idx) => {
                                const productColors = [
                                  { bg: 'bg-sage', text: 'text-sage', border: 'border-sage' },
                                  { bg: 'bg-terracotta', text: 'text-terracotta', border: 'border-terracotta' },
                                  { bg: 'bg-blue-gray', text: 'text-blue-gray', border: 'border-blue-gray' },
                                  { bg: 'bg-dark-sage', text: 'text-dark-sage', border: 'border-dark-sage' },
                                  { bg: 'bg-mint', text: 'text-dark-sage', border: 'border-mint' },
                                  { bg: 'bg-cream', text: 'text-blue-gray', border: 'border-cream' },
                                ];
                                const color = productColors[idx % productColors.length];
                                const isFiltered = filterByProduct === idx;

                                return (
                                  <div
                                    key={idx}
                                    className={`bg-off-white rounded-lg border-2 ${isFiltered ? color.border + ' shadow-lg' : 'border-beige'} p-4 transition-all`}
                                  >
                                    <div className="flex items-start justify-between mb-3">
                                      <div className="flex-1">
                                        <h4 className="font-semibold text-blue-gray mb-1">
                                          {prog.prodottoNome}
                                        </h4>
                                        <div className="flex items-center gap-2">
                                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold ${color.bg} text-white`}>
                                            {prog.assignedCount}/{prog.requiredCount}
                                          </span>
                                          {prog.isComplete && (
                                            <span className="text-sage text-sm">✓ Completo</span>
                                          )}
                                        </div>
                                      </div>
                                    </div>

                                    <div className="w-full bg-beige/50 rounded-full h-2 mb-3">
                                      <div
                                        className={`h-full ${color.bg} rounded-full transition-all duration-300`}
                                        style={{ width: `${Math.min(prog.percentage, 100)}%` }}
                                      />
                                    </div>

                                    <Button
                                      onClick={() => {
                                        if (isFiltered) {
                                          setFilterByProduct(null);
                                          toast({
                                            title: "🔄 Filtro rimosso",
                                            description: "Mostro tutte le foto",
                                            duration: 2000,
                                          });
                                        } else {
                                          setFilterByProduct(idx);
                                          setShowProductSummary(false);
                                          toast({
                                            title: `🔍 Filtrando per ${prog.prodottoNome}`,
                                            description: `Mostro solo le ${prog.assignedCount} foto assegnate`,
                                            duration: 2000,
                                          });
                                        }
                                      }}
                                      variant={isFiltered ? "default" : "outline"}
                                      size="sm"
                                      className={`w-full ${isFiltered ? color.bg + ' hover:opacity-90' : ''}`}
                                      data-testid={`button-filter-product-${idx}`}
                                    >
                                      {isFiltered ? '✓ Filtrando' : '🔍 Filtra'}
                                    </Button>
                                  </div>
                                );
                              })}

                              {filterByProduct !== null && (
                                <Button
                                  onClick={() => {
                                    setFilterByProduct(null);
                                    toast({
                                      title: "🔄 Filtro rimosso",
                                      description: "Mostro tutte le foto",
                                      duration: 2000,
                                    });
                                  }}
                                  variant="outline"
                                  className="w-full mt-4"
                                  data-testid="button-clear-filter"
                                >
                                  ✕ Rimuovi Filtro
                                </Button>
                              )}
                            </div>
                          </SheetContent>
                        </Sheet>
                      )}

                      {/* 📱 Mobile Product Assignment Dialog */}
                      <Sheet open={showMobileProductDialog} onOpenChange={setShowMobileProductDialog}>
                        <SheetContent side="bottom" className="h-[70vh]">
                          <SheetHeader>
                            <SheetTitle className="text-xl font-playfair text-blue-gray">
                              🏷️ Assegna Foto ai Prodotti
                            </SheetTitle>
                            <SheetDescription>
                              Seleziona uno o più prodotti per questa foto
                            </SheetDescription>
                          </SheetHeader>

                          <div className="mt-6 space-y-3">
                            {galleryData?.productRequirements?.map((prod, idx) => {
                              const productIdStr = String(idx);
                              const isAssigned = selectedPhotoForMobileAssignment
                                ? photoAssignments[selectedPhotoForMobileAssignment]?.includes(productIdStr)
                                : false;

                              const productColors = [
                                { bg: 'bg-sage', hover: 'hover:bg-dark-sage', text: 'text-sage', ring: 'ring-sage' },
                                { bg: 'bg-terracotta', hover: 'hover:bg-terracotta/80', text: 'text-terracotta', ring: 'ring-terracotta' },
                                { bg: 'bg-blue-gray', hover: 'hover:bg-blue-gray/80', text: 'text-blue-gray', ring: 'ring-blue-gray' },
                                { bg: 'bg-dark-sage', hover: 'hover:bg-dark-sage/80', text: 'text-dark-sage', ring: 'ring-dark-sage' },
                                { bg: 'bg-mint', hover: 'hover:bg-mint/80', text: 'text-dark-sage', ring: 'ring-mint' },
                                { bg: 'bg-cream', hover: 'hover:bg-cream/80', text: 'text-blue-gray', ring: 'ring-cream' },
                              ];
                              const color = productColors[idx % productColors.length];

                              const assignedCount = Object.values(photoAssignments).filter(
                                assignments => assignments.includes(productIdStr)
                              ).length;

                              return (
                                <button
                                  key={idx}
                                  onClick={() => {
                                    if (selectedPhotoForMobileAssignment) {
                                      handleToggleProductAssignment(selectedPhotoForMobileAssignment, productIdStr);
                                    }
                                  }}
                                  className={`w-full p-4 rounded-lg border-2 text-left transition-all ${
                                    isAssigned
                                      ? `${color.bg} text-white border-transparent shadow-lg ring-2 ${color.ring}`
                                      : `bg-off-white ${color.text} border-beige hover:border-sage/50`
                                  }`}
                                  data-testid={`mobile-chip-product-${idx}`}
                                >
                                  <div className="flex items-center justify-between">
                                    <div className="flex-1">
                                      <div className="font-semibold text-lg mb-1">
                                        {isAssigned && '✓ '}
                                        {prod.prodottoNome}
                                      </div>
                                      <div className={`text-sm ${isAssigned ? 'text-white/90' : 'text-blue-gray/70'}`}>
                                        {assignedCount}/{prod.prodottoNumeroFoto} foto assegnate
                                      </div>
                                    </div>
                                    {isAssigned && (
                                      <div className="ml-3">
                                        <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 20 20">
                                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                        </svg>
                                      </div>
                                    )}
                                  </div>
                                </button>
                              );
                            })}
                          </div>

                          <div className="mt-6">
                            <Button
                              onClick={() => setShowMobileProductDialog(false)}
                              className="w-full"
                              variant="outline"
                            >
                              ✓ Fatto
                            </Button>
                          </div>
                        </SheetContent>
                      </Sheet>

                      {/* Selezione Completata Message - Mostrato PRIMA della griglia (nascosto se ordine Pronto o se l'utente ha chiuso) */}
                      {isSelectionMode && selectionStatus === "completed" && galleryData?.orderStatus !== "Pronto" && !hideConfirmationBanner && (
                        <div className="mt-8 mb-6 text-center">
                          <div className="bg-gradient-to-br from-mint/30 to-sage/10 border-2 border-sage rounded-lg p-8 shadow-xl max-w-3xl mx-auto relative">
                            {/* Pulsante X per chiudere */}
                            <button
                              onClick={() => {
                                setHideConfirmationBanner(true);
                                localStorage.setItem('gallery-hide-confirmation-banner', 'true');
                              }}
                              className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full bg-white/80 hover:bg-white border border-sage/30 text-blue-gray hover:text-terracotta transition-all shadow-sm"
                              aria-label="Chiudi messaggio"
                              data-testid="button-close-confirmation-banner"
                            >
                              <X className="w-4 h-4" />
                            </button>
                            
                            <div className="mb-6">
                              <div className="text-6xl mb-3">✨</div>
                              <h4 className="text-3xl font-playfair text-sage mb-3">
                                Selezione Confermata!
                              </h4>
                              <p className="text-lg text-blue-gray mb-2">
                                Hai confermato la tua selezione di{" "}
                                <strong className={isUnlimitedSelection ? "text-terracotta" : "text-sage"}>
                                  {galleryData?.selectedPhotoIds?.length || selectedPhotoIds.length} foto
                                </strong>{" "}
                                per il tuo album personalizzato.
                              </p>
                              <p className="text-sm text-blue-gray/70">
                                Riceverai presto il tuo album!
                              </p>
                            </div>

                            <div className="flex flex-col gap-4 justify-center items-center">
                              {/* CTA: Goditi la Galleria */}
                              <Button
                                onClick={scrollToGallery}
                                className="bg-sage hover:bg-sage/90 text-white px-8 py-6 text-lg font-semibold shadow-lg hover:shadow-xl transition-all"
                                data-testid="button-enjoy-gallery"
                              >
                                🖼️ Goditi la Galleria
                              </Button>
                            </div>

                            {/* Messaggio WhatsApp per modifiche */}
                            <div className="mt-6 bg-white/80 rounded-lg p-6 border border-sage/30 shadow-sm">
                              <p className="text-sm text-blue-gray mb-3">
                                💡 <strong>Hai bisogno di modificare la selezione?</strong>
                              </p>
                              <p className="text-sm text-blue-gray/70 mb-4">
                                Contattaci su WhatsApp e ti aiuteremo subito!
                              </p>
                              {studioSettings?.phone && (
                                <a
                                  href={`https://wa.me/${formatPhoneForWhatsApp(studioSettings.phone)}?text=${encodeURIComponent(`Ciao! Vorrei modificare la selezione per la galleria "${galleryData.name}"`)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-2 bg-sage hover:bg-dark-sage text-white px-6 py-3 rounded-lg font-medium transition-all shadow-md hover:shadow-lg"
                                  data-testid="link-whatsapp-modification"
                                >
                                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.890-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                                  </svg>
                                  Scrivici su WhatsApp
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 📸 Sezione "Le tue foto scelte" - visibile dopo conferma selezione */}
                      {isSelectionMode && selectionStatus === "completed" && selectedPhotoIds.length > 0 && (
                        <div className="mt-6 mb-8">
                          <div 
                            className="bg-gradient-to-br from-sage/5 to-beige/20 border border-sage/20 rounded-xl overflow-hidden shadow-sm"
                          >
                            <button
                              onClick={() => setShowSelectedPhotosSection(prev => !prev)}
                              className="w-full flex items-center justify-between p-5 hover:bg-sage/5 transition-colors"
                            >
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-sage/15 flex items-center justify-center">
                                  <CheckCircle2 className="w-5 h-5 text-sage" />
                                </div>
                                <div className="text-left">
                                  <h4 className="text-lg font-playfair text-dark-sage font-semibold">
                                    Le tue foto scelte
                                  </h4>
                                  <p className="text-sm text-blue-gray/70">
                                    {selectedPhotoIds.length} {selectedPhotoIds.length === 1 ? 'foto selezionata' : 'foto selezionate'}
                                    {isMultiProductMode && productRequirements && (
                                      <span> · {productRequirements.length} {productRequirements.length === 1 ? 'prodotto' : 'prodotti'}</span>
                                    )}
                                  </p>
                                </div>
                              </div>
                              <ChevronDown className={`w-5 h-5 text-sage transition-transform ${showSelectedPhotosSection ? 'rotate-180' : ''}`} />
                            </button>
                            
                            {showSelectedPhotosSection && (
                              <div className="px-5 pb-5 border-t border-sage/10">
                                {isMultiProductMode && productRequirements ? (
                                  <div className="space-y-5 mt-4">
                                    {productRequirements.map((product, productIndex) => {
                                      const productPhotos = allPhotos.filter(p => 
                                        photoAssignments[p.id]?.includes(String(productIndex))
                                      );
                                      if (productPhotos.length === 0) return null;
                                      return (
                                        <div key={productIndex}>
                                          <p className="text-sm font-medium text-dark-sage mb-2">
                                            {product.prodottoNome} ({productPhotos.length} foto)
                                          </p>
                                          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
                                            {productPhotos.map((photo) => (
                                              <div key={photo.id} className="aspect-square rounded-lg overflow-hidden shadow-sm border border-sage/10 cursor-pointer hover:shadow-md transition-shadow"
                                                onClick={() => {
                                                  const idx = allPhotos.findIndex(p => p.id === photo.id);
                                                  if (idx >= 0) openLightbox(idx);
                                                }}
                                              >
                                                <img 
                                                  src={photo.thumbnailUrl || photo.url} 
                                                  alt={photo.name || ''} 
                                                  className="w-full h-full object-cover" 
                                                  loading="lazy" 
                                                  decoding="async"
                                                />
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <div className="mt-4">
                                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
                                      {allPhotos.filter(p => selectedPhotoIdsSet.has(p.id)).map((photo) => (
                                        <div key={photo.id} className="aspect-square rounded-lg overflow-hidden shadow-sm border border-sage/10 cursor-pointer hover:shadow-md transition-shadow"
                                          onClick={() => {
                                            const idx = allPhotos.findIndex(pp => pp.id === photo.id);
                                            if (idx >= 0) openLightbox(idx);
                                          }}
                                        >
                                          <img 
                                            src={photo.thumbnailUrl || photo.url} 
                                            alt={photo.name || ''} 
                                            className="w-full h-full object-cover" 
                                            loading="lazy" 
                                            decoding="async"
                                          />
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* ✅ Visualizzazione immediata con lazy loading */}
                      
                      {/* 📚 Griglia Card Capitoli */}
                      {chaptersEnabled && photosByChapter && photosByChapter.length > 0 && (
                        <div className="mb-8">
                          <div className="mb-4">
                            <p className="text-blue-gray font-playfair text-lg">
                              📖 Sfoglia i <strong>{photosByChapter.length} {photosByChapter.length === 1 ? 'capitolo' : 'capitoli'}</strong> della galleria
                            </p>
                          </div>
                          
                          {/* Griglia Card Capitoli con Miniature */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                            {photosByChapter.map((group) => {
                              const isExpanded = !collapsedChapters[group.chapter.id];
                              const selectedInChapter = group.photos.filter(p => selectedPhotoIdsSet.has(p.id)).length;
                              const coverUrl = group.chapter.coverPhotoUrl || group.photos[0]?.url;
                              const coverPos = group.chapter.coverPhotoPosition;
                              
                              return (
                                <button
                                  key={group.chapter.id}
                                  onClick={() => toggleChapterCollapse(group.chapter.id)}
                                  className={`relative aspect-[16/9] sm:aspect-[3/4] rounded-xl overflow-hidden cursor-pointer transition-all group shadow-md hover:shadow-xl ${
                                    isExpanded ? 'ring-4 ring-sage ring-offset-2' : ''
                                  }`}
                                  data-testid={`chapter-card-${group.chapter.id}`}
                                >
                                  {coverUrl ? (
                                    <img
                                      src={coverUrl}
                                      alt={group.chapter.titolo}
                                      className="w-full h-full object-cover transition-transform group-hover:scale-105"
                                      style={coverPos ? { objectPosition: `${coverPos.x}% ${coverPos.y}%` } : undefined}
                                      loading="lazy"
                                    />
                                  ) : (
                                    <div className="w-full h-full bg-gradient-to-br from-sage/20 to-beige/40 flex items-center justify-center">
                                      <BookOpen className="w-12 h-12 text-sage/50" />
                                    </div>
                                  )}
                                  
                                  {/* Overlay Gradient */}
                                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                                  
                                  {/* Contenuto Card */}
                                  <div className="absolute bottom-0 left-0 right-0 p-3 text-white">
                                    <h3 className="font-playfair text-base font-semibold line-clamp-2 mb-1">
                                      {group.chapter.titolo}
                                    </h3>
                                    <div className="flex items-center gap-2 text-xs text-white/80">
                                      <span>{group.photos.length} foto</span>
                                      {isSelectionMode && selectedInChapter > 0 && (
                                        <span className="bg-sage px-2 py-0.5 rounded-full text-white">
                                          {selectedInChapter} ✓
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  
                                  {/* Indicatore Espanso */}
                                  {isExpanded && (
                                    <div className="absolute top-2 right-2 bg-sage text-white rounded-full p-1.5">
                                      <ChevronDown className="w-4 h-4" />
                                    </div>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      
                      {photosByChapterDisplayed ? (
                        <div ref={galleryGridRef} className="space-y-8">
                          {photosByChapterDisplayed.map((group) => {
                            const isCollapsed = !!collapsedChapters[group.chapter.id];
                            // 📊 Conteggi sempre sull'array completo del capitolo (allPhotos)
                            const selectedInChapter = group.allPhotos.filter(p => selectedPhotoIdsSet.has(p.id)).length;

                            // Skip render se collassato o se nessuna foto del capitolo è ancora caricata
                            if (isCollapsed || group.photos.length === 0) return null;

                            return (
                              <div key={group.chapter.id} className="chapter-section" data-testid={`chapter-${group.chapter.id}`}>
                                {/* Intestazione Capitolo Espanso */}
                                <div className="flex items-center justify-between mb-4 pb-3 border-b-2 border-sage/30">
                                  <div className="flex items-center gap-3">
                                    <BookOpen className="w-5 h-5 text-sage" />
                                    <h3 className="text-xl font-playfair text-blue-gray">
                                      {group.chapter.titolo}
                                    </h3>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    {isSelectionMode && selectedInChapter > 0 && (
                                      <span className="bg-sage text-white text-xs font-bold px-2 py-1 rounded-full">
                                        {selectedInChapter} selezionate
                                      </span>
                                    )}
                                    <span className="text-sm text-gray-500 bg-beige/50 px-2 py-1 rounded">
                                      {group.allPhotos.length} foto
                                    </span>
                                    <button
                                      onClick={() => toggleChapterCollapse(group.chapter.id)}
                                      className="text-sage hover:text-dark-sage p-1 rounded transition-colors"
                                      data-testid={`chapter-close-${group.chapter.id}`}
                                    >
                                      <ChevronUp className="w-5 h-5" />
                                    </button>
                                  </div>
                                </div>
                                {group.chapter.descrizione && (
                                  <p className="text-gray-600 mb-4 text-sm">{group.chapter.descrizione}</p>
                                )}
                                
                                {/* Griglia Foto del Capitolo */}
                                <MasonryColumns
                                  items={group.photos}
                                  getKey={(photo) => photo.id}
                                  renderItem={(photo, chapterIndex) => (
                                    <>
                                      <PhotoCard
                                        photo={photo}
                                        index={chapterIndex}
                                        isSelected={selectedPhotoIdsSet.has(photo.id)}
                                        isSelectionMode={isSelectionMode && selectionStatus !== "completed"}
                                        assignedProducts={photoAssignments[photo.id] || []}
                                        isUnlimitedCompleted={isUnlimitedSelection && selectionStatus === "completed"}
                                        isDisliked={isDislikeMode && dislikedPhotoIds.has(photo.id)}
                                        isDislikeMode={isDislikeMode && selectionStatus !== "completed"}
                                        onClick={() => handleChapterPhotoClick(group.chapter.id, chapterIndex)}
                                      />
                                      {!isSelectionMode && (
                                        <div className="mt-2">
                                          <LazyInteractionPanel
                                            itemId={photo.id}
                                            itemType="photo"
                                            galleryId={galleryData.id}
                                            isAdmin={isAdmin}
                                            variant="default"
                                          />
                                        </div>
                                      )}
                                    </>
                                  )}
                                />
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        /* Vista Standard (senza capitoli) */
                        <div ref={galleryGridRef}>
                          <MasonryColumns
                            items={displayPhotosForGrid}
                            getKey={(photo) => photo.id}
                            renderItem={(photo, index) => (
                              <>
                                <PhotoCard
                                  photo={photo}
                                  index={index}
                                  isSelected={selectedPhotoIdsSet.has(photo.id)}
                                  isSelectionMode={isSelectionMode && selectionStatus !== "completed"}
                                  assignedProducts={photoAssignments[photo.id] || []}
                                  isUnlimitedCompleted={isUnlimitedSelection && selectionStatus === "completed"}
                                  isDisliked={isDislikeMode && dislikedPhotoIds.has(photo.id)}
                                  isDislikeMode={isDislikeMode && selectionStatus !== "completed"}
                                  onClick={handleStandardPhotoClick}
                                />
                                {!isSelectionMode && (
                                  <div className="mt-2">
                                    <LazyInteractionPanel
                                      itemId={photo.id}
                                      itemType="photo"
                                      galleryId={galleryData.id}
                                      isAdmin={isAdmin}
                                      variant="default"
                                    />
                                  </div>
                                )}
                              </>
                            )}
                          />
                        </div>
                      )}

                      {/* Conferma Selezione Button (Task 14) */}
                      {isSelectionMode && selectionStatus !== "completed" && (
                        <div ref={confirmButtonRef} className="mt-8 mb-6 text-center">
                          <div className="bg-white rounded-lg border-2 border-sage p-6 shadow-lg max-w-2xl mx-auto">
                            <h4 className="text-xl font-playfair text-blue-gray mb-4">
                              Pronto a confermare la selezione?
                            </h4>
                            {/* Progresso Multi-Prodotto Dettagliato */}
                            {isMultiProductMode && productRequirements && productRequirements.length > 1 ? (
                              <div className="mb-6 space-y-3">
                                {productRequirements.map((prod, idx) => {
                                  const assignedCount = Object.values(photoAssignments).filter(
                                    assignments => assignments.includes(String(idx))
                                  ).length;
                                  const requiredCount = Number(prod.prodottoNumeroFoto) || 0;
                                  const hasNoLimit = requiredCount <= 0;
                                  const isComplete = hasNoLimit || assignedCount >= requiredCount;
                                  const missingCount = hasNoLimit ? 0 : Math.max(0, requiredCount - assignedCount);
                                  const progressPercent = hasNoLimit ? 100 : Math.min((assignedCount / requiredCount) * 100, 100);
                                  
                                  const productColors = [
                                    { bg: 'bg-sage/20', border: 'border-sage', progress: 'bg-sage', text: 'text-sage' },
                                    { bg: 'bg-terracotta/20', border: 'border-terracotta', progress: 'bg-terracotta', text: 'text-terracotta' },
                                    { bg: 'bg-blue-gray/20', border: 'border-blue-gray', progress: 'bg-blue-gray', text: 'text-blue-gray' },
                                    { bg: 'bg-cream/40', border: 'border-cream', progress: 'bg-amber-600', text: 'text-amber-700' },
                                  ];
                                  const colorClass = productColors[idx % productColors.length];
                                  
                                  return (
                                    <div key={idx} className={`rounded-lg border-2 ${colorClass.border} ${colorClass.bg} p-3`}>
                                      <div className="flex items-center justify-between mb-2">
                                        <span className="font-semibold text-blue-gray text-sm">
                                          {prod.prodottoNome}
                                        </span>
                                        <span className={`text-sm font-bold px-2 py-0.5 rounded-full ${
                                          isComplete ? 'bg-sage text-white' : 'bg-terracotta/20 text-terracotta'
                                        }`}>
                                          {hasNoLimit ? `${assignedCount} ∞` : `${assignedCount}/${requiredCount}`}
                                          {isComplete && !hasNoLimit && ' ✓'}
                                        </span>
                                      </div>
                                      
                                      {/* Progress Bar */}
                                      <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden mb-1">
                                        <div 
                                          className={`h-full rounded-full transition-all ${isComplete ? 'bg-sage' : colorClass.progress}`}
                                          style={{ width: `${progressPercent}%` }}
                                        />
                                      </div>
                                      
                                      {/* Status Text */}
                                      <p className={`text-xs ${isComplete ? 'text-sage' : 'text-terracotta'} font-medium`}>
                                        {isComplete 
                                          ? (hasNoLimit ? `${assignedCount} foto selezionate` : '✓ Completato')
                                          : `⚠️ Mancano ${missingCount} foto`
                                        }
                                      </p>
                                    </div>
                                  );
                                })}
                                
                                {/* Riepilogo Totale */}
                                <div className="pt-2 border-t border-gray-200 text-center">
                                  {productRequirements.every((prod, idx) => {
                                    const assignedCount = Object.values(photoAssignments).filter(
                                      assignments => assignments.includes(String(idx))
                                    ).length;
                                    const requiredCount = Number(prod.prodottoNumeroFoto) || 0;
                                    return requiredCount <= 0 || assignedCount >= requiredCount;
                                  }) ? (
                                    <p className="text-sage font-semibold">✅ Tutti i prodotti completati! Puoi confermare.</p>
                                  ) : (
                                    <p className="text-terracotta font-semibold">
                                      ⚠️ Completa tutti i prodotti per confermare
                                    </p>
                                  )}
                                </div>
                              </div>
                            ) : (
                              /* Vista Single-Product (Legacy), Selezione Libera, o Dislike */
                              <div className="mb-4">
                                {isDislikeMode ? (
                                  <>
                                    <div className="text-3xl font-bold text-red-600 mb-2">
                                      {dislikedPhotoIds.size} foto escluse
                                    </div>
                                    <p className="text-sm text-gray-600">
                                      {dislikedPhotoIds.size > 0
                                        ? `Verranno salvate ${photos.length - dislikedPhotoIds.size} foto su ${photos.length}.`
                                        : "Clicca sulle foto che NON vuoi includere. Le altre verranno salvate."}
                                    </p>
                                    <p className="text-xs text-red-500 mt-1">
                                      Modalità "Non mi piace" attiva
                                    </p>
                                  </>
                                ) : isUnlimitedSelection ? (
                                  <>
                                    <div className="text-3xl font-bold text-terracotta mb-2">
                                      {selectedPhotoIds.length} foto
                                    </div>
                                    <p className="text-sm text-gray-600">
                                      {selectedPhotoIds.length > 0
                                        ? "Quando hai finito, clicca 'Ho finito' per confermare."
                                        : "Seleziona le foto che preferisci, senza limiti."}
                                    </p>
                                    {selectedPhotoIds.length > 0 && (
                                      <p className="text-xs text-terracotta mt-1">
                                        Selezione libera attiva
                                      </p>
                                    )}
                                  </>
                                ) : (
                                  <>
                                    <div className="text-3xl font-bold text-sage mb-2">
                                      {selectedPhotoIds.length} / {requiredPhotoCount}
                                    </div>
                                    <p className="text-sm text-gray-600">
                                      {selectedPhotoIds.length >= requiredPhotoCount
                                        ? "Perfetto! Puoi confermare la tua selezione."
                                        : `Seleziona ancora ${requiredPhotoCount - selectedPhotoIds.length} foto.`}
                                    </p>
                                  </>
                                )}
                              </div>
                            )}

                            {/* 📝 Campo Note Aggiuntive */}
                            <div className="mb-6 text-left">
                              <label
                                htmlFor="selection-notes"
                                className="block text-sm font-semibold text-blue-gray mb-2"
                              >
                                💬 Note aggiuntive (opzionale)
                              </label>
                              <Textarea
                                id="selection-notes"
                                value={selectionNotes}
                                onChange={(e) =>
                                  setSelectionNotes(e.target.value)
                                }
                                placeholder="Es: vorrei più foto del taglio torta, preferisco foto luminose, ecc..."
                                className="w-full min-h-[100px] resize-none border-sage/30 focus:border-sage focus:ring-sage"
                                maxLength={500}
                                data-testid="textarea-selection-notes"
                              />
                              <p className="text-xs text-gray-500 mt-1 text-right">
                                {selectionNotes.length}/500 caratteri
                              </p>
                            </div>

                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    onClick={isDislikeMode ? handleConfirmSelection : isUnlimitedSelection ? handleOpenConfirmModal : handleConfirmSelection}
                                    disabled={
                                      isSubmittingSelection ||
                                      isDeadlinePassed ||
                                      (isDislikeMode
                                        ? false // In dislike mode, always enabled (0 disliked = keep all)
                                        : isMultiProductMode && productRequirements
                                          ? // Multi-product: check all products with limits have required photos
                                            !productRequirements.every((prod, idx) => {
                                              const assignedCount = Object.values(photoAssignments).filter(
                                                assignments => assignments.includes(String(idx))
                                              ).length;
                                              const requiredCount = Number(prod.prodottoNumeroFoto) || 0;
                                              // FIX: Prodotti illimitati (<=0) sono sempre OK
                                              return requiredCount <= 0 || assignedCount >= requiredCount;
                                            })
                                          : // Single-product o unlimited: per unlimited serve almeno 1 foto
                                            isUnlimitedSelection 
                                              ? selectedPhotoIds.length === 0
                                              // FIX BUG 4: Coerente con validazione - serve almeno N foto, non esattamente N
                                              : selectedPhotoIds.length < requiredPhotoCount
                                      )
                                    }
                                    className={`${isDislikeMode ? 'bg-red-600 hover:bg-red-700' : isUnlimitedSelection ? 'bg-terracotta hover:bg-terracotta/90' : 'bg-sage hover:bg-sage/90'} text-white px-8 py-6 text-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed`}
                                    data-testid="button-confirm-selection"
                                  >
                                    {isSubmittingSelection ? (
                                      <>
                                        <span className="animate-spin mr-2">⏳</span>
                                        Conferma in corso...
                                      </>
                                    ) : isDislikeMode ? (
                                      <>Conferma esclusioni</>
                                    ) : isUnlimitedSelection ? (
                                      <>Ho finito</>
                                    ) : (
                                      <>Conferma Selezione</>
                                    )}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  {isMultiProductMode && productRequirements ? (
                                    <div className="text-sm">
                                      {productRequirements.map((prod, idx) => {
                                        const assignedCount = Object.values(photoAssignments).filter(
                                          assignments => assignments.includes(String(idx))
                                        ).length;
                                        const requiredCount = Number(prod.prodottoNumeroFoto) || 0;
                                        const isUnlimited = requiredCount <= 0;
                                        const isComplete = isUnlimited || assignedCount >= requiredCount;
                                        return (
                                          <div key={idx} className={isComplete ? 'text-green-600' : 'text-red-600'}>
                                            {isComplete ? '✓' : '✗'} {prod.prodottoNome}: {assignedCount}/{isUnlimited ? '∞' : requiredCount}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  ) : isUnlimitedSelection ? (
                                    `${selectedPhotoIds.length} foto selezionate`
                                  ) : (
                                    `${selectedPhotoIds.length}/${requiredPhotoCount} foto selezionate`
                                  )}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                            {isDeadlinePassed && (
                              <p className="mt-3 text-sm text-red-600 font-medium">
                                ⚠️ Scadenza superata - contatta lo studio
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {activeTab === "guests" && (
                <div>
                  {guestPhotos.length === 0 ? (
                    <div className="text-center py-12">
                      <div className="flex flex-col items-center">
                        <h3 className="text-xl font-playfair text-blue-gray mb-2">
                          Nessuna foto degli ospiti
                        </h3>
                        <p className="text-gray-500">
                          Gli ospiti non hanno ancora caricato foto. Usa il
                          pulsante "Carica foto" sopra per aggiungerne.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <MasonryColumns
                      items={guestPhotos}
                      getKey={(photo) => photo.id}
                      renderItem={(photo, index) => (
                        <div
                          className="gallery-image cursor-pointer relative group overflow-hidden rounded-lg shadow-md hover:shadow-lg"
                          onClick={() => openLightbox(photos.length + index)}
                        >
                          <img
                            src={photo.thumbnailUrl || photo.url}
                            alt={photo.name || `Foto ospite ${index + 1}`}
                            className="w-full h-auto object-cover hover:opacity-95 transition-opacity duration-200"
                            loading={index < 8 ? 'eager' : 'lazy'}
                            decoding="async"
                            style={{
                              backgroundColor: "transparent",
                            }}
                            title={`Caricata da: ${photo.uploaderName || "Ospite"} - ${photo.createdAt ? new Date(photo.createdAt).toLocaleString("it-IT") : ""}`}
                          />
                          {/* Badge per indicare che è una foto ospite */}
                          <div className="absolute top-2 right-2 bg-rose-600 text-white text-xs px-2 py-1 rounded-full">
                            Ospite
                          </div>
                          {/* Nome dell'uploader in basso a sinistra */}
                          {photo.uploaderName && (
                            <div className="absolute bottom-2 left-2 bg-black/50 text-white text-xs px-2 py-1 rounded backdrop-blur-sm">
                              {photo.uploaderName}
                            </div>
                          )}
                        </div>
                      )}
                    />
                  )}
                </div>
              )}

              {/* 📄 Sentinella per auto-load Firestore pagination (condivisa tra tab fotografo e ospiti) */}
              {(activeTab === "photographer" || activeTab === "guests") && hasMorePhotosToShow && (
                <div
                  ref={sentinelRef}
                  className="flex justify-center mt-8 py-4"
                >
                  <div className="flex items-center gap-2 text-gray-500">
                    {isFetchingNextPage && (
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-sage border-t-transparent"></div>
                    )}
                    <span className="text-sm">
                      {isFetchingNextPage
                        ? `Caricamento foto... (${photos.length + guestPhotos.length} caricate)`
                        : `${photos.length + guestPhotos.length} foto caricate`}
                    </span>
                  </div>
                </div>
              )}

              {activeTab === "voice-memos" && (
                <VoiceMemosList
                  galleryId={galleryData.id}
                  isAdmin={isAdmin}
                  refreshTrigger={refreshTrigger}
                />
              )}

              {activeTab === "story" && (
                <div className="space-y-6">
                  {storyLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="text-center">
                        <div className="w-8 h-8 border-2 border-sage-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                        <p className="text-sage-600">Caricamento storia...</p>
                      </div>
                    </div>
                  ) : showStoryUpload || (!coupleStory && isAdmin) ? (
                    <StoryUploadForm
                      galleryId={id!}
                      galleryName={galleryData?.name || ""}
                      existingStory={coupleStory}
                      onStoryUploaded={(story) => {
                        console.log(
                          "✅ Storia caricata tramite upload:",
                          story,
                        );
                        // Invalida cache React Query per ricaricare storia
                        queryClient.invalidateQueries({ queryKey: ['coupleStory', id] });
                        setShowStoryUpload(false);
                      }}
                      onCancel={() => setShowStoryUpload(false)}
                    />
                  ) : coupleStory ? (
                    <CoupleStoryBook
                      story={coupleStory}
                      galleryName={galleryData.name}
                      galleryDate={galleryData.date}
                      galleryLocation={galleryData.location}
                      onEdit={
                        isAdmin ? () => setShowStoryUpload(true) : undefined
                      }
                      onDelete={isAdmin ? handleDeleteStory : undefined}
                    />
                  ) : (
                    <div className="text-center py-12">
                      <div className="mx-auto w-16 h-16 bg-sage-100 rounded-full flex items-center justify-center mb-4">
                        <BookOpen className="h-8 w-8 text-sage-600" />
                      </div>
                      <h3 className="text-xl font-playfair font-semibold text-blue-gray-900 mb-2">
                        Nessuna Storia Disponibile
                      </h3>
                      <p className="text-sage-600 mb-6 max-w-md mx-auto">
                        La storia d'amore di questa coppia non è ancora stata
                        caricata.
                        {isAdmin
                          ? " Carica il JSON generato da ChatGPT per creare il libro digitale."
                          : " Chiedi agli organizzatori di caricare la storia."}
                      </p>
                      {isAdmin && (
                        <Button
                          onClick={() => setShowStoryUpload(true)}
                          className="bg-sage-600 hover:bg-sage-700 text-white"
                        >
                          <BookOpen className="h-4 w-4 mr-2" />
                          Carica Storia
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Registration CTA section - only show when user is not logged in AND not in selection mode */}
              {!isAuthenticated && !isSelectionMode && (
                <div id="registration-section" className="mt-12 mb-8">
                  <RegistrationCTA
                    galleryId={galleryData.id}
                    galleryName={galleryData.name}
                    onAuthComplete={() => {
                      // Auth state will update automatically via context
                    }}
                    className="max-w-4xl mx-auto"
                  />
                </div>
              )}

              {/* Gallery Actions - Show download and export options for admin */}
              {userInfo.isAuthenticated && userInfo.email && isAdmin && (
                <div className="mt-8">
                  <GalleryActions
                    galleryId={galleryData.id}
                    galleryName={galleryData.name}
                    isOwner={true}
                  />
                </div>
              )}

              {/* Social Activity Panel - nascosto in modalità selezione */}
              {!isSelectionMode && (
                <div className="mt-12 mb-8">
                  <SocialActivityPanel
                    galleryId={galleryData.id}
                    className="w-full"
                    onPhotoClick={(photoId) => {
                      // Find photo index in allPhotos array
                      const photoIndex = allPhotos.findIndex(
                        (photo) => photo.id === photoId,
                      );
                      if (photoIndex !== -1) {
                        setCurrentPhotoIndex(photoIndex);
                        setLightboxOpen(true);
                      }
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        </main>
      </div>

      {/* Instagram Call to Action e Footer */}
      <GalleryFooter studioSettings={studioSettings} />

      {/* Photo Lightbox - usa lightboxSourcePhotos (foto capitolo) se presenti, altrimenti fallback globale */}
      <ImageLightbox
        isOpen={lightboxOpen}
        onClose={closeLightbox}
        photos={(lightboxSourcePhotos
          ?? (activeTab === "photographer" && chaptersEnabled && photosByChapter
            ? flatChapterPhotos
            : (activeTab === "photographer" && isSelectionMode && selectionStatus !== "completed"
              ? displayPhotos
              : allPhotos))
        ).map((photo) => ({
          id: photo.id,
          name: photo.name,
          url: photo.url,
          size: photo.size || 0,
          contentType: photo.contentType,
          createdAt: photo.createdAt || new Date(),
        }))}
        initialIndex={currentPhotoIndex}
        selectionInfo={isSelectionMode && !isMultiProductMode && selectionStatus !== "completed" ? {
          isSelectionMode: true,
          selectedPhotoIds: isDislikeMode ? Array.from(dislikedPhotoIds) : selectedPhotoIds,
          requiredPhotoCount,
          unlimitedSelection: isDislikeMode ? false : isUnlimitedSelection,
          isDislikeMode,
          onToggleSelection: handleTogglePhotoSelection,
          selectionStatus,
          onCompleteSelection: !isDislikeMode && isUnlimitedSelection ? handleOpenConfirmModal : undefined,
        } : undefined}
        multiProductInfo={isSelectionMode && isMultiProductMode && selectionStatus !== "completed" && productRequirements ? {
          isMultiProductMode: true,
          productRequirements: productRequirements.map(p => ({
            prodottoNome: p.prodottoNome,
            prodottoNumeroFoto: p.prodottoNumeroFoto,
          })),
          photoAssignments,
          onToggleProductAssignment: handleToggleProductAssignment,
          selectionStatus,
        } : undefined}
      />


      {/* 🎓 Onboarding Tutorial - Gestito autonomamente dal componente wrapper */}
      <GalleryOnboardingSpotlight
        galleryData={galleryData}
        isSelectionMode={isSelectionMode}
        isDeadlinePassed={isDeadlinePassed}
      />

      {/* 🆕 Modal di conferma selezione libera */}
      <SelectionConfirmModal
        isOpen={showSelectionConfirmModal}
        onClose={() => setShowSelectionConfirmModal(false)}
        onConfirm={async (photosWithNotes: PhotoWithNote[]) => {
          // Salva le note delle foto per usarle in handleConfirmSelection
          const notesMap: Record<string, string> = {};
          photosWithNotes.forEach(photo => {
            if (photo.note?.trim()) {
              notesMap[photo.id] = photo.note.trim();
            }
          });
          setPendingPhotoNotes(notesMap);
          setShowSelectionConfirmModal(false);
          // Passa le note direttamente alla funzione per evitare race condition
          await handleConfirmSelectionWithNotes(notesMap);
        }}
        selectedPhotos={selectedPhotosForModal}
        galleryName={galleryData?.name || ''}
        galleryCode={galleryData?.code || ''}
        isSubmitting={isSubmittingSelection}
      />
    </div>
    </GalleryInteractionsProvider>
  );
}