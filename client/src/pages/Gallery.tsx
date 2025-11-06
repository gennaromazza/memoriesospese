import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
} from "react";
import { useParams, useLocation } from "wouter";
import { createUrl } from "@/lib/basePath";
import { useStudio } from "@/context/StudioContext";
import { User } from "lucide-react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import GalleryHeader from "@/components/gallery/GalleryHeader";
import YouTubeEmbed from "@/components/gallery/YouTubeEmbed";
import LoadMoreButton from "@/components/gallery/LoadMoreButton";
import GalleryFooter from "@/components/gallery/GalleryFooter";
import { PhotoData } from "@/hooks/use-gallery-data";
import { useQuery } from "@tanstack/react-query";
import GalleryService from "@/lib/galleries";
import { queryClient } from "@/lib/queryClient";
import GalleryLoadingProgress from "@/components/gallery/GalleryLoadingProgress";
import GalleryFilter, {
  FilterCriteria,
} from "@/components/gallery/GalleryFilter";
import GuestUpload from "@/components/GuestUpload";
import { GalleryActions } from "@/components/gallery/GalleryActions";
import VoiceMemoUpload from "@/components/VoiceMemoUpload";
import VoiceMemosList from "@/components/VoiceMemosList";
import InteractionWrapper from "@/components/InteractionWrapper";
import InteractionPanel from "@/components/InteractionPanel";
import SocialActivityPanel from "@/components/SocialActivityPanel";
import RegistrationCTA from "@/components/RegistrationCTA";
import { SubscriptionPrompt } from "@/components/SubscriptionPrompt";
import { useGalleryRefresh } from "@/hooks/useGalleryRefresh";
import { useFirebaseAuth } from "@/context/FirebaseAuthContext";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useUserInfo } from "@/hooks/useUserInfo";
import EditGalleryModal from "@/components/EditGalleryModal";
import { Edit3, BookOpen, Trash2, Info } from "lucide-react";
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
import { resolveEventDate, convertFirestoreTimestamp } from "@/lib/firebase";
import CoupleStoryBook from "@/components/CoupleStoryBook";
import StoryUploadForm from "@/components/StoryUploadForm";
import StoryService from "@/lib/storyService";
import { CoupleStory } from "@shared/schema";
import { GalleryOnboardingSpotlight } from "@/components/GalleryOnboardingSpotlight";

export default function Gallery() {
  const { id } = useParams();
  const [, navigate] = useLocation();
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const { studioSettings } = useStudio();
  const { user, userProfile, isAuthenticated } = useFirebaseAuth();
  const isAdmin = useIsAdmin();
  const userInfo = useUserInfo();
  const { toast } = useToast();

  // Stato locale per il tracciamento del caricamento
  const [loadingState, setLoadingState] = useState({
    totalPhotos: 0,
    loadedPhotos: 0,
    progress: 0,
  });

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
    refreshVoiceMemos,
    refreshInteractions,
  } = useGalleryRefresh(id);

  // Stato per triggare il refresh dei voice memos
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Stato per gestire l'apertura del modal EditGallery
  const [isEditGalleryOpen, setIsEditGalleryOpen] = useState(false);

  // Stato per gestire il prompt di iscrizione (lo mostriamo ogni 20 foto)
  const [showSubscriptionPrompt, setShowSubscriptionPrompt] = useState(true);

  // Stati per gestire la storia della coppia
  const [showStoryUpload, setShowStoryUpload] = useState(false);

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

  // 🔧 React Query: Carica foto fotografo (enabled solo quando galleryData esiste)
  const {
    data: photos = [],
    isLoading: isLoadingPhotos,
    error: photosError
  } = useQuery({
    queryKey: ['photos', galleryData?.id],
    queryFn: () => GalleryService.getPhotosByGalleryId(galleryData!.id),
    enabled: !!galleryData?.id,
    retry: 2,
    staleTime: 30000
  });

  // 🔧 React Query: Carica foto ospiti (enabled solo quando galleryData esiste)
  const {
    data: guestPhotos = [],
    isLoading: isLoadingGuestPhotos,
    error: guestPhotosError
  } = useQuery({
    queryKey: ['guestPhotos', galleryData?.id],
    queryFn: () => GalleryService.getGuestPhotosByGalleryId(galleryData!.id),
    enabled: !!galleryData?.id,
    retry: 2,
    staleTime: 30000
  });

  // Stati derivati
  const hasMorePhotos = false; // Semplificato: carica tutto in una volta
  const loadingMorePhotos = false;
  const loadMorePhotos = useCallback(async () => {
    // Placeholder: paginazione rimossa per semplicità
  }, []);

  // 🔧 React Query: Carica storia coppia (enabled solo quando id esiste)
  const {
    data: coupleStory,
    isLoading: storyLoading,
    error: storyError
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

    // Invalida cache React Query per ricaricare foto
    await queryClient.invalidateQueries({ queryKey: ['photos', galleryData.id] });
    await queryClient.invalidateQueries({ queryKey: ['guestPhotos', galleryData.id] });

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
  }, [galleryError, toast]);

  useEffect(() => {
    if (photosError) {
      console.error('Errore caricamento foto:', photosError);
      toast({
        title: "Errore",
        description: "Si è verificato un errore nel caricamento delle foto.",
        variant: "destructive",
      });
    }
  }, [photosError, toast]);


  useEffect(() => {
    if (guestPhotosError) {
      console.error('Errore caricamento foto ospiti:', guestPhotosError);
      // Non mostriamo errore per foto ospiti - non è critico
    }
  }, [guestPhotosError, toast]);

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
  const [selectionNotes, setSelectionNotes] = useState(""); // 📝 Note aggiuntive cliente

  // 🎨 UX Enhancement States
  const [showOnlySelected, setShowOnlySelected] = useState(false); // Filtro solo foto selezionate
  const [showSidebar, setShowSidebar] = useState(false); // Sidebar miniature
  const [showProductSummary, setShowProductSummary] = useState(false); // Sheet riepilogo prodotti
  const [filterByProduct, setFilterByProduct] = useState<number | null>(null); // Filtro per prodotto specifico

  // 📱 Mobile Product Assignment Dialog
  const [showMobileProductDialog, setShowMobileProductDialog] = useState(false);
  const [selectedPhotoForMobileAssignment, setSelectedPhotoForMobileAssignment] = useState<string | null>(null);

  // Ref per scrollare alla griglia
  const galleryGridRef = useRef<HTMLDivElement>(null);

  // Check se gallery è in selection mode
  const isSelectionMode = galleryData?.selectionEnabled || false;

  // 🔥 CRITICAL FIX: Deriva selectedPhotoIds automaticamente da photoAssignments
  // Questo elimina il rischio di desync tra i due stati
  const isMultiProductMode = (galleryData?.productRequirements?.length ?? 0) > 0;

  const selectedPhotoIds = useMemo(() => {
    if (isMultiProductMode) {
      // Multi-product: deriva da photoAssignments (single source of truth)
      return Object.keys(photoAssignments).filter(
        photoId => photoAssignments[photoId] && photoAssignments[photoId].length > 0
      );
    } else {
      // Legacy single-product: usa lo stato separato
      return selectedPhotoIdsLegacy;
    }
  }, [isMultiProductMode, photoAssignments, selectedPhotoIdsLegacy]);

  // Calculate total required photos: Multi-product mode (sum from productRequirements) OR legacy single-product mode
  const requiredPhotoCount = useMemo(() => {
    if (galleryData?.productRequirements && galleryData.productRequirements.length > 0) {
      return galleryData.productRequirements.reduce((sum, p) => sum + (p.prodottoNumeroFoto || 0), 0);
    }
    return galleryData?.requiredPhotoCount || 0;
  }, [galleryData?.productRequirements, galleryData?.requiredPhotoCount]);

  const productRequirements = galleryData?.productRequirements;
  const selectionDeadline = galleryData?.selectionDeadline;
  const selectionStatus = galleryData?.selectionStatus || "pending";

  // 🔍 DEBUG: Log stato modalità selezione
  useEffect(() => {
    if (galleryData) {
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("🔍 SELECTION MODE DEBUG - Galleria:", galleryData.code);
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("📌 Gallery ID:", galleryData.id);
      console.log("📌 Gallery Code:", galleryData.code);
      console.log("✅ selectionEnabled:", galleryData.selectionEnabled);
      console.log("✅ isSelectionMode:", isSelectionMode);
      console.log("📊 requiredPhotoCount:", galleryData.requiredPhotoCount);
      console.log("📦 productRequirements:", galleryData.productRequirements);
      console.log("📋 photoAssignments:", galleryData.photoAssignments);
      console.log("📋 selectionStatus:", galleryData.selectionStatus);
      console.log("⏰ selectionDeadline:", galleryData.selectionDeadline);
      console.log(
        "🔒 selectionDeadlineEnforced:",
        galleryData.selectionDeadlineEnforced,
      );
      console.log(
        "💚 selectedPhotoIds count:",
        galleryData.selectedPhotoIds?.length || 0,
      );

      // Multi-Product Debug
      if (galleryData.productRequirements && galleryData.productRequirements.length > 0) {
        const totalRequired = galleryData.productRequirements.reduce((sum, p) => sum + p.prodottoNumeroFoto, 0);
        console.log("🎨 MULTI-PRODUCT MODE ATTIVO");
        console.log(`📊 Totale foto richieste: ${totalRequired} (da ${galleryData.productRequirements.length} prodotti)`);
        galleryData.productRequirements.forEach((p, idx) => {
          console.log(`  ${idx + 1}. ${p.prodottoNome}: ${p.prodottoNumeroFoto} foto`);
        });
      }

      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

      if (!galleryData.selectionEnabled) {
        console.error("❌ PROBLEMA: selectionEnabled è FALSE o undefined!");
        console.error(
          "❌ Per attivare: Admin → Gestione Gallerie → Gestisci → Impostazioni → ✓ Modalità Selezione Foto",
        );
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
    if (!hasInitializedSelection) {
      // Legacy single-product mode
      if (
        !isMultiProductMode &&
        galleryData?.selectedPhotoIds &&
        galleryData.selectedPhotoIds.length > 0
      ) {
        console.log(
          "🔄 Sync iniziale selectedPhotoIds da galleryData (legacy):",
          galleryData.selectedPhotoIds.length,
        );
        setSelectedPhotoIdsLegacy(galleryData.selectedPhotoIds);
        setHasInitializedSelection(true);
      }

      // Multi-product mode: sync photoAssignments
      if (galleryData?.photoAssignments && Object.keys(galleryData.photoAssignments).length > 0) {
        console.log(
          "🔄 Sync iniziale photoAssignments da galleryData:",
          Object.keys(galleryData.photoAssignments).length,
        );
        setPhotoAssignments(galleryData.photoAssignments as Record<string, string[]>);
        setHasInitializedSelection(true);
      }
    }
  }, [galleryData?.selectedPhotoIds, galleryData?.photoAssignments, hasInitializedSelection, isMultiProductMode]);

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

          if (currentProductCount >= productLimit) {
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
            description: `Assegnata a ${productName} (${currentProductCount + 1}/${productLimit})`,
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
      if (galleryData?.productRequirements && galleryData.productRequirements.length > 0) {
        toast({
          title: "💡 Modalità Multi-Prodotto",
          description: "Clicca sui chip dei prodotti sotto la foto per assegnarla.",
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
          if (prev.length >= requiredPhotoCount) {
            toast({
              title: "⚠️ Limite raggiunto",
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
    [isDeadlinePassed, selectionStatus, requiredPhotoCount, galleryData?.productRequirements, toast],
  );

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

    // Multi-Product Validation
    if (galleryData?.productRequirements && galleryData.productRequirements.length > 0) {
      // Calcola progresso per ogni prodotto
      const productProgress = galleryData.productRequirements.map((prod, idx) => {
        const assignedCount = Object.values(photoAssignments).filter(
          assignments => assignments.includes(String(idx))
        ).length;

        return {
          prodottoNome: prod.prodottoNome,
          assignedCount,
          requiredCount: prod.prodottoNumeroFoto,
          isMissing: assignedCount < prod.prodottoNumeroFoto,
          isExceeded: assignedCount > prod.prodottoNumeroFoto
        };
      });

      // Trova prodotti con troppe foto
      const exceededProducts = productProgress.filter(p => p.isExceeded);

      if (exceededProducts.length > 0) {
        const errorMessage = exceededProducts.map(p => 
          `• ${p.prodottoNome}: ${p.assignedCount}/${p.requiredCount} foto (${p.assignedCount - p.requiredCount} in eccesso)`
        ).join('\n');

        toast({
          title: "⚠️ Troppe foto assegnate",
          description: `Alcuni prodotti hanno più foto del necessario:\n\n${errorMessage}\n\nRimuovi le foto in eccesso prima di confermare.`,
          variant: "destructive",
        });
        return;
      }

      // Trova prodotti mancanti
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
    // Legacy Single-Product Validation
    else if (requiredPhotoCount > 0) {
      if (selectedPhotoIds.length !== requiredPhotoCount) {
        toast({
          title: "⚠️ Selezione incompleta",
          description: `Devi selezionare esattamente ${requiredPhotoCount} foto (${selectedPhotoIds.length}/${requiredPhotoCount} selezionate).`,
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
      const photoAssignmentsData = galleryData.productRequirements 
        ? Object.fromEntries(
            Object.entries(photoAssignments).filter(([_, value]) => value && value.length > 0)
          )
        : null;

      const updateData: any = {
        selectedPhotoIds, // Legacy fallback
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
          const productAssignments = galleryData.productRequirements?.map((prod, idx) => {
            const assignedCount = Object.values(photoAssignments).filter(
              assignments => assignments.includes(String(idx))
            ).length;

            return {
              prodottoNome: prod.prodottoNome,
              assignedCount,
              requiredCount: prod.prodottoNumeroFoto
            };
          });

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
              productAssignments // NEW: multi-product support
            }),
          });
        } catch (emailError) {
          console.error("⚠️ Errore invio email admin:", emailError);
        }
      }

      toast({
        title: "✅ Selezione confermata!",
        description: galleryData.productRequirements 
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

  // Aggiorna lo stato di caricamento
  useEffect(() => {
    // Aggiorna il conteggio delle foto caricate includendo quelle degli ospiti
    const totalLoadedPhotos = photos.length + guestPhotos.length;
    setLoadingState((prev) => ({
      ...prev,
      loadedPhotos: totalLoadedPhotos,
      // Se c'è una galleria, usa il suo photoCount, altrimenti usa la lunghezza totale delle foto
      totalPhotos: galleryData?.photoCount || totalLoadedPhotos,
      progress: galleryData?.photoCount
        ? Math.min(
            100,
            Math.round((totalLoadedPhotos / galleryData.photoCount) * 100),
          )
        : 100,
    }));
  }, [photos.length, guestPhotos.length, galleryData]);

  // 🔧 Storia caricata tramite React Query (vedi useQuery sopra) - vecchio useEffect rimosso

  // Verifica autenticazione
  useEffect(() => {
    const checkAuth = () => {
      const isAuth = localStorage.getItem(`gallery_auth_${id}`);
      if (!isAuth && !isAdmin) {
        // CORREZIONE: redirect alla route corretta /gallery/:id invece di /access/:id
        navigate(createUrl(`/gallery/${id}`));
        return;
      }
    };

    if (id) {
      checkAuth();
    }
  }, [id, isAdmin, navigate]);

  // Scroll infinito come fallback
  useEffect(() => {
    const handleScroll = () => {
      if (
        window.innerHeight + window.scrollY >=
          document.body.offsetHeight - 300 &&
        hasMorePhotos &&
        !loadingMorePhotos &&
        !isLoadingPhotos
      ) {
        loadMorePhotos();
      }
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [hasMorePhotos, loadingMorePhotos, isLoadingPhotos, loadMorePhotos]);

  // Combina tutte le foto per il lightbox
  const allPhotos = useMemo(() => {
    return [...photos, ...guestPhotos];
  }, [photos, guestPhotos]);

  // 🔍 UX Enhancement: Apre lightbox usando displayPhotos (supporta filtro "Solo Selezionate")
  const openLightbox = (index: number) => {
    setCurrentPhotoIndex(index);
    setLightboxOpen(true);
  };

  const closeLightbox = () => {
    setLightboxOpen(false);
  };

  // Funzione per applicare i filtri
  const handleFilterChange = (newFilters: FilterCriteria) => {
    setFilters(newFilters);

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
          // Imposta l'ora finale a 23:59:59
          const endDateWithTime = new Date(filters.endDate);
          endDateWithTime.setHours(23, 59, 59);
          if (photoDate > endDateWithTime) return false;
        }

        // Filtra per ora
        if (filters.startTime || filters.endTime) {
          const hours = photoDate.getHours();
          const minutes = photoDate.getMinutes();
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
  const displayPhotos = useMemo(() => {
    let basePhotos = areFiltersActive ? filteredPhotos : photos;

    // Filtro per prodotto specifico (Task 8)
    if (filterByProduct !== null && photoAssignments) {
      basePhotos = basePhotos.filter((photo) => 
        photoAssignments[photo.id]?.includes(String(filterByProduct))
      );
    }

    // Se il filtro "solo selezionate" è attivo, mostra solo quelle
    if (showOnlySelected && isSelectionMode && selectedPhotoIds.length > 0) {
      return basePhotos.filter((photo) => selectedPhotoIds.includes(photo.id));
    }

    return basePhotos;
  }, [
    areFiltersActive,
    filteredPhotos,
    photos,
    showOnlySelected,
    isSelectionMode,
    selectedPhotoIds,
    filterByProduct,
    photoAssignments,
  ]);

  // 📊 Multi-Product Progress Calculation
  const calculateProductProgress = useMemo(() => {
    if (!galleryData?.productRequirements || !photoAssignments) {
      return null;
    }

    return galleryData.productRequirements.map((prod, idx) => {
      // Conta quante foto hanno questo prodotto assegnato
      const assignedCount = Object.values(photoAssignments).filter(
        assignments => assignments.includes(String(idx))
      ).length;

      return {
        prodottoNome: prod.prodottoNome,
        assignedCount,
        requiredCount: prod.prodottoNumeroFoto,
        isComplete: assignedCount >= prod.prodottoNumeroFoto,
        percentage: prod.prodottoNumeroFoto > 0 
          ? Math.round((assignedCount / prod.prodottoNumeroFoto) * 100) 
          : 100
      };
    });
  }, [galleryData?.productRequirements, photoAssignments]);

  // 🎨 UX Enhancement #6: Messaggi smart basati sul progresso
  // IMPORTANTE: Nascosto in modalità multi-prodotto perché il progresso è già mostrato nelle card colorate
  const smartMessage = useMemo(() => {
    if (!isSelectionMode || selectionStatus === "completed") return null;

    // 🔥 FIX: In multi-prodotto mode, non mostrare questo messaggio legacy
    // Il progresso è già visualizzato nelle card colorate dei prodotti
    if (galleryData?.productRequirements && galleryData.productRequirements.length > 0) {
      return null;
    }

    // Logica legacy per modalità single-product
    const count = selectedPhotoIds.length;
    const required = requiredPhotoCount;
    const percentage = required > 0 ? Math.round((count / required) * 100) : 0;

    if (count === 0) {
      return {
        emoji: "✨",
        text: `Inizia selezionando le tue ${required} foto preferite!`,
        color: "text-blue-600",
      };
    } else if (count < required * 0.25) {
      return {
        emoji: "🎯",
        text: `Ottimo inizio! Continua così!`,
        color: "text-green-600",
      };
    } else if (count < required * 0.5) {
      return {
        emoji: "💪",
        text: `Stai andando alla grande! Sei a ${count}/${required}`,
        color: "text-green-600",
      };
    } else if (count < required * 0.75) {
      return {
        emoji: "🔥",
        text: `Fantastico! Più della metà completata!`,
        color: "text-orange-600",
      };
    } else if (count < required) {
      return {
        emoji: "🎉",
        text: `Quasi fatto! Mancano solo ${required - count} foto!`,
        color: "text-orange-600",
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
        color: "text-red-600",
      };
    }
  }, [
    isSelectionMode,
    selectionStatus,
    selectedPhotoIds.length,
    requiredPhotoCount,
    galleryData?.productRequirements,
  ]);

  const handleSignOut = () => {
    localStorage.removeItem(`gallery_auth_${id}`);
    navigate(createUrl("/"));
  };

  if (isLoadingPhotos) {
    return (
      <div className="min-h-screen bg-off-white">
        <Navigation galleryOwner="Caricamento..." />
        <div className="py-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <Skeleton className="h-10 w-80 mb-2" />
            <Skeleton className="h-6 w-60 mb-8" />

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

  // Mostra sempre l'indicatore di caricamento durante il caricamento iniziale
  const showProgressIndicator = isLoadingPhotos || loadingState.progress < 100;

  // Se siamo in stato di caricamento o se il progresso è inferiore a 100, mostra il componente di caricamento
  if (isLoadingPhotos || loadingState.progress < 100) {
    return (
      <div className="min-h-screen bg-off-white">
        <GalleryLoadingProgress
          totalPhotos={loadingState.totalPhotos || 100}
          loadedPhotos={loadingState.loadedPhotos || 0}
          progress={loadingState.progress || 0}
        />
      </div>
    );
  }

  // Determina la classe del tema basata su galleryData.specialTheme
  const currentTheme = galleryData?.specialTheme;
  const themeClass =
    currentTheme && currentTheme !== "none" ? `theme-${currentTheme}` : "";

  return (
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
                            onClick={() => setIsEditGalleryOpen(true)}
                            className="px-4 sm:px-6 py-2 rounded-md font-medium transition-all text-sm sm:text-base flex items-center gap-2 bg-blue-50 text-blue-700 hover:bg-blue-100 hover:text-blue-800 border border-blue-200 shadow-sm"
                          >
                            <Edit3 className="h-4 w-4" />
                            <span className="hidden sm:inline">
                              Edit Gallery
                            </span>
                            <span className="sm:hidden">Edit</span>
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

                  {/* Azioni galleria - layout pulito e organizzato */}
                  <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
                    <div className="flex flex-col lg:flex-row gap-4">
                      {/* Sezione riservata per future funzionalità */}
                      <div className="flex-1"></div>
                    </div>
                  </div>
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

                                  <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                                    <p className="font-semibold text-blue-800 mb-1">
                                      💡 Suggerimenti
                                    </p>
                                    <ul className="text-gray-700 space-y-1 text-sm">
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
                                    <div className="bg-red-50 p-3 rounded-lg border border-red-200">
                                      <p className="font-semibold text-red-700">
                                        ⚠️ La scadenza è superata!
                                      </p>
                                      <p className="text-sm text-gray-700 mt-1">
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
                            </AlertDialog>
                          </AlertDialog>

                          <h3 className="text-2xl font-playfair text-blue-gray mb-3">
                            ✨ Modalità Selezione Foto ✨
                          </h3>
                          <p className="text-lg text-gray-700 mb-4">
                            Seleziona le tue{" "}
                            <strong className="text-sage">
                              {requiredPhotoCount} foto preferite
                            </strong>{" "}
                            per il tuo album personalizzato!
                          </p>

                          {/* Istruzioni chiare */}
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
                                        ? 'bg-green-50 border-green-300' 
                                        : progress.assignedCount > 0
                                          ? 'bg-yellow-50 border-yellow-300'
                                          : 'bg-gray-50 border-gray-300'
                                    }`}
                                    data-testid={`product-progress-${idx}`}
                                  >
                                    <div className="flex items-start justify-between mb-2">
                                      <p className="text-xs font-semibold text-gray-700 line-clamp-2">
                                        {progress.prodottoNome}
                                      </p>
                                      {progress.isComplete && (
                                        <span className="text-green-600">✓</span>
                                      )}
                                    </div>
                                    <p className="text-lg font-bold text-gray-900 mb-1">
                                      {progress.assignedCount}/{progress.requiredCount}
                                    </p>
                                    <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
                                      <div 
                                        className={`h-full transition-all ${
                                          progress.isComplete 
                                            ? 'bg-green-500' 
                                            : progress.assignedCount > 0 
                                              ? 'bg-yellow-500' 
                                              : 'bg-gray-400'
                                        }`}
                                        style={{ width: `${progress.percentage}%` }}
                                      />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* 🎨 UX Enhancement #4: Progress Bar */}
                          <div className="mb-4">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-medium text-gray-700">
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
                            <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-sage to-green-500 transition-all duration-500 ease-out rounded-full"
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

                          {/* 🎨 UX Enhancement #6: Smart Message */}
                          {smartMessage && (
                            <div
                              className={`mb-4 p-3 rounded-lg bg-white/80 border-2 ${smartMessage.color === "text-sage" ? "border-sage" : smartMessage.color === "text-red-600" ? "border-red-300" : "border-blue-300"}`}
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

                          {/* 🎨 UX Enhancement #1 & #5: Toggle Filtro + Sidebar */}
                          <div className="flex items-center justify-center gap-4 mb-4">
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
                              onClick={() => setShowSidebar(!showSidebar)}
                              disabled={selectedPhotoIds.length === 0}
                              data-testid="button-toggle-sidebar"
                            >
                              {showSidebar ? "✕ Nascondi" : "🖼️ Anteprima"}{" "}
                              {selectedPhotoIds.length > 0 &&
                                `(${selectedPhotoIds.length})`}
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
                                    const photo = displayPhotos.find(
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
                                            src={photo.url}
                                            alt={`Selezionata ${idx + 1}`}
                                            className="w-full h-full object-cover"
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

                      {/* Banner Istruzioni Multi-Prodotto - NASCOSTO per UX pulita */}
                      {false && isSelectionMode && 
                       selectionStatus !== "completed" && 
                       galleryData?.productRequirements && 
                       (galleryData?.productRequirements?.length ?? 0) > 0 && (
                        <div className="bg-gradient-to-r from-blue-50 to-purple-50 border-2 border-blue-200 rounded-xl p-5 mb-6 shadow-md">
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
                                  <strong>2.</strong> Puoi <span className="font-semibold text-purple-600">riutilizzare</span> la stessa foto per più prodotti (es: Album + Stampe)
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
                       (galleryData?.productRequirements?.length ?? 0) > 0 && (
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
                                // Colori distintivi prodotto (stesso array dei chip)
                                const productColors = [
                                  { bg: 'bg-blue-500', ring: 'ring-blue-200' },
                                  { bg: 'bg-green-500', ring: 'ring-green-200' },
                                  { bg: 'bg-purple-500', ring: 'ring-purple-200' },
                                  { bg: 'bg-orange-500', ring: 'ring-orange-200' },
                                  { bg: 'bg-pink-500', ring: 'ring-pink-200' },
                                  { bg: 'bg-teal-500', ring: 'ring-teal-200' },
                                ];
                                const color = productColors[idx % productColors.length];

                                return (
                                  <div key={idx} className={`bg-white/90 rounded-lg p-3 ring-2 ${color.ring}`}>
                                    <div className="flex items-center justify-between mb-2">
                                      <span className="text-xs font-semibold text-gray-700 truncate" title={prog.prodottoNome}>
                                        {prog.prodottoNome}
                                      </span>
                                      <span className={`text-xs font-bold ${prog.percentage === 100 ? 'text-green-600' : 'text-gray-600'}`}>
                                        {prog.assignedCount}/{prog.requiredCount}
                                      </span>
                                    </div>
                                    <div className="w-full bg-gray-200 rounded-full h-2">
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
                       (galleryData?.productRequirements?.length ?? 0) > 0 && (
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
                                  { bg: 'bg-blue-500', text: 'text-blue-500', border: 'border-blue-500' },
                                  { bg: 'bg-green-500', text: 'text-green-500', border: 'border-green-500' },
                                  { bg: 'bg-purple-500', text: 'text-purple-500', border: 'border-purple-500' },
                                  { bg: 'bg-orange-500', text: 'text-orange-500', border: 'border-orange-500' },
                                  { bg: 'bg-pink-500', text: 'text-pink-500', border: 'border-pink-500' },
                                  { bg: 'bg-teal-500', text: 'text-teal-500', border: 'border-teal-500' },
                                ];
                                const color = productColors[idx % productColors.length];
                                const isFiltered = filterByProduct === idx;

                                return (
                                  <div 
                                    key={idx} 
                                    className={`bg-white rounded-lg border-2 ${isFiltered ? color.border + ' shadow-lg' : 'border-gray-200'} p-4 transition-all`}
                                  >
                                    <div className="flex items-start justify-between mb-3">
                                      <div className="flex-1">
                                        <h4 className="font-semibold text-gray-800 mb-1">
                                          {prog.prodottoNome}
                                        </h4>
                                        <div className="flex items-center gap-2">
                                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold ${color.bg} text-white`}>
                                            {prog.assignedCount}/{prog.requiredCount}
                                          </span>
                                          {prog.isComplete && (
                                            <span className="text-green-600 text-sm">✓ Completo</span>
                                          )}
                                        </div>
                                      </div>
                                    </div>

                                    <div className="w-full bg-gray-200 rounded-full h-2 mb-3">
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
                                { bg: 'bg-blue-500', hover: 'hover:bg-blue-600', text: 'text-blue-600', ring: 'ring-blue-500' },
                                { bg: 'bg-green-500', hover: 'hover:bg-green-600', text: 'text-green-600', ring: 'ring-green-500' },
                                { bg: 'bg-purple-500', hover: 'hover:bg-purple-600', text: 'text-purple-600', ring: 'ring-purple-500' },
                                { bg: 'bg-orange-500', hover: 'hover:bg-orange-600', text: 'text-orange-600', ring: 'ring-orange-500' },
                                { bg: 'bg-pink-500', hover: 'hover:bg-pink-600', text: 'text-pink-600', ring: 'ring-pink-500' },
                                { bg: 'bg-teal-500', hover: 'hover:bg-teal-600', text: 'text-teal-600', ring: 'ring-teal-500' },
                              ];
                              const color = productColors[idx % productColors.length];

                              // Calcola progresso prodotto
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
                                      : `bg-white ${color.text} border-gray-200 hover:border-gray-300`
                                  }`}
                                  data-testid={`mobile-chip-product-${idx}`}
                                >
                                  <div className="flex items-center justify-between">
                                    <div className="flex-1">
                                      <div className="font-semibold text-lg mb-1">
                                        {isAssigned && '✓ '}
                                        {prod.prodottoNome}
                                      </div>
                                      <div className={`text-sm ${isAssigned ? 'text-white/90' : 'text-gray-600'}`}>
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

                      {/* Selezione Completata Message - Mostrato PRIMA della griglia (nascosto se ordine Pronto) */}
                      {isSelectionMode && selectionStatus === "completed" && galleryData?.orderStatus !== "Pronto" && (
                        <div className="mt-8 mb-6 text-center">
                          <div className="bg-gradient-to-br from-green-50 to-sage/10 border-2 border-green-300 rounded-lg p-8 shadow-xl max-w-3xl mx-auto">
                            <div className="mb-6">
                              <div className="text-6xl mb-3">✨</div>
                              <h4 className="text-3xl font-playfair text-green-800 mb-3">
                                Selezione Confermata!
                              </h4>
                              <p className="text-lg text-gray-700 mb-2">
                                Hai confermato la tua selezione di{" "}
                                <strong className="text-sage">
                                  {requiredPhotoCount} foto
                                </strong>{" "}
                                per il tuo album personalizzato.
                              </p>
                              <p className="text-sm text-gray-600">
                                Riceverai presto il tuo album! 🎉
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
                              <p className="text-sm text-gray-700 mb-3">
                                💡 <strong>Hai bisogno di modificare la selezione?</strong>
                              </p>
                              <p className="text-sm text-gray-600 mb-4">
                                Contattaci su WhatsApp e ti aiuteremo subito!
                              </p>
                              {studioSettings?.phone && (
                                <a
                                  href={`https://wa.me/${studioSettings.phone.replace(/\D/g, '')}?text=${encodeURIComponent(`Ciao! Vorrei modificare la selezione per la galleria "${galleryData.name}"`)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white px-6 py-3 rounded-lg font-medium transition-all shadow-md hover:shadow-lg"
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

                      <div ref={galleryGridRef} className="masonry-grid">
                        {displayPhotos.map((photo, index) => (
                          <React.Fragment key={photo.id}>
                            <div className="masonry-item">
                              <div
                                className={`gallery-image cursor-pointer relative group overflow-hidden rounded-lg transition-all duration-300 ${
                                  isSelectionMode &&
                                  selectionStatus !== "completed" &&
                                  selectedPhotoIds.includes(photo.id)
                                    ? "ring-6 ring-sage shadow-[0_0_20px_rgba(134,168,137,0.5)] scale-[1.02]"
                                    : isSelectionMode &&
                                        selectionStatus !== "completed"
                                      ? "shadow-md hover:shadow-xl hover:ring-2 hover:ring-sage/50"
                                      : "shadow-md hover:shadow-lg"
                                }`}
                                onClick={() => {
                                  // 🔥 FIX UX: In multi-product mode, click foto SEMPRE apre lightbox
                                  // L'assegnazione ai prodotti avviene solo tramite badge (mobile) o chip (desktop)
                                  const isMultiProduct = galleryData?.productRequirements && galleryData.productRequirements.length > 0;

                                  if (isMultiProduct) {
                                    // Multi-product: sempre lightbox
                                    openLightbox(index);
                                  } else if (isSelectionMode && selectionStatus !== "completed") {
                                    // Legacy single-product: toggle selezione
                                    handleTogglePhotoSelection(photo.id);
                                  } else {
                                    // Modalità normale: lightbox
                                    openLightbox(index);
                                  }
                                }}
                              >
                                <img
                                  src={photo.url}
                                  alt={photo.name || `Foto ${index + 1}`}
                                  className="w-full h-auto object-cover transition-opacity duration-300 opacity-0 hover:opacity-95"
                                  loading="lazy"
                                  onLoad={(e) => {
                                    (
                                      e.target as HTMLImageElement
                                    ).classList.replace(
                                      "opacity-0",
                                      "opacity-100",
                                    );
                                  }}
                                  title={
                                    photo.createdAt
                                      ? new Date(
                                          photo.createdAt,
                                        ).toLocaleString("it-IT")
                                      : ""
                                  }
                                />

                                {/* 👁️ UX Enhancement: Bottone Espandi/Zoom in modalità selezione */}
                                {isSelectionMode &&
                                  selectionStatus !== "completed" && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation(); // Previene trigger del click sulla foto
                                        openLightbox(index);
                                      }}
                                      className="absolute top-3 left-3 z-20 bg-blue-gray/90 hover:bg-blue-gray text-white rounded-full w-9 h-9 flex items-center justify-center transition-all shadow-lg hover:scale-110"
                                      title="Visualizza a schermo intero"
                                      data-testid="button-expand-photo"
                                    >
                                      <svg
                                        className="w-5 h-5"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                      >
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          strokeWidth={2}
                                          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7"
                                        />
                                      </svg>
                                    </button>
                                  )}

                                {/* Selection Mode Checkbox Badge - nascosto quando completata */}
                                {isSelectionMode &&
                                  selectionStatus !== "completed" && (
                                    <>
                                      {/* Checkbox Top Right */}
                                      <div className="absolute top-3 right-3 z-10">
                                        <div
                                          className={`w-8 h-8 rounded-md flex items-center justify-center transition-all border-2 ${
                                            selectedPhotoIds.includes(
                                              photo.id,
                                            )
                                              ? "bg-sage border-sage text-white scale-110 shadow-lg"
                                              : "bg-white border-gray-300 hover:border-sage hover:bg-sage/10"
                                          }`}
                                        >
                                          {selectedPhotoIds.includes(
                                            photo.id,
                                          ) ? (
                                            <svg
                                              className="w-5 h-5"
                                              fill="currentColor"
                                              viewBox="0 0 20 20"
                                            >
                                              <path
                                                fillRule="evenodd"
                                                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                                clipRule="evenodd"
                                              />
                                            </svg>
                                          ) : (
                                            <div className="w-4 h-4 rounded-sm border border-gray-400"></div>
                                          )}
                                        </div>
                                      </div>

                                      {/* Badge "SELEZIONA" / "SELEZIONATA" - solo se NON multi-prodotto */}
                                      {!galleryData.productRequirements && selectedPhotoIds.includes(photo.id) && (
                                        <div className="absolute bottom-0 left-0 right-0 bg-sage text-white text-center py-2 font-semibold text-sm">
                                          ✓ SELEZIONATA
                                        </div>
                                      )}

                                      {/* 📱 Mobile: Badge Assegnazione Prodotto - VISIBILE solo su mobile (<768px) */}
                                      {galleryData.productRequirements && (
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setSelectedPhotoForMobileAssignment(photo.id);
                                            setShowMobileProductDialog(true);
                                          }}
                                          className="md:hidden absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-r from-sage to-dark-sage text-white px-4 py-2.5 font-medium text-sm transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2"
                                          title="Assegna a prodotti"
                                          data-testid={`button-mobile-assign-${photo.id}`}
                                        >
                                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                                          </svg>
                                          <span>Assegna ai prodotti</span>
                                        </button>
                                      )}

                                      {/* Product Assignment Chips - NASCOSTI su mobile (<768px), visibili su desktop */}
                                      {galleryData.productRequirements && (
                                        <div className="absolute bottom-0 left-0 right-0 hidden md:flex flex-wrap gap-1 bg-white/95 p-2 rounded-b-lg border-t border-sage/20">
                                          {galleryData.productRequirements.map((prod, idx) => {
                                            // Use string index as unique identifier (aligns with Firestore schema)
                                            const productIdStr = String(idx);
                                            const isAssigned = photoAssignments[photo.id]?.includes(productIdStr);

                                            // Colori distintivi per ogni prodotto (rotazione)
                                            const productColors = [
                                              { bg: 'bg-blue-500', hover: 'hover:bg-blue-600', text: 'text-blue-600' },
                                              { bg: 'bg-green-500', hover: 'hover:bg-green-600', text: 'text-green-600' },
                                              { bg: 'bg-purple-500', hover: 'hover:bg-purple-600', text: 'text-purple-600' },
                                              { bg: 'bg-orange-500', hover: 'hover:bg-orange-600', text: 'text-orange-600' },
                                              { bg: 'bg-pink-500', hover: 'hover:bg-pink-600', text: 'text-pink-600' },
                                              { bg: 'bg-teal-500', hover: 'hover:bg-teal-600', text: 'text-teal-600' },
                                            ];
                                            const color = productColors[idx % productColors.length];

                                            return (
                                              <button
                                                key={idx}
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  handleToggleProductAssignment(photo.id, productIdStr);
                                                }}
                                                className={`px-2 py-1 rounded text-xs font-medium transition-all ${
                                                  isAssigned 
                                                    ? `${color.bg} text-white shadow-md ${color.hover}` 
                                                    : `bg-gray-200 ${color.text} hover:bg-gray-300`
                                                }`}
                                                title={`${isAssigned ? 'Rimuovi da' : 'Assegna a'} ${prod.prodottoNome}`}
                                                data-testid={`chip-product-${idx}-photo-${photo.id}`}
                                              >
                                                {isAssigned && '✓ '}
                                                {prod.prodottoNome}
                                              </button>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </>
                                  )}
                              </div>

                              {/* Interaction panel below photo - nascosto in modalità selezione */}
                              {!isSelectionMode && (
                                <div className="mt-2">
                                  <InteractionPanel
                                    itemId={photo.id}
                                    itemType="photo"
                                    galleryId={galleryData.id}
                                    isAdmin={isAdmin}
                                    variant="default"
                                  />
                                </div>
                              )}
                            </div>

                            {/* Mostra prompt iscrizione ogni 20 foto - full width per non sovrapporsi - NASCOSTO in modalità selezione */}
                            {showSubscriptionPrompt &&
                              !isSelectionMode &&
                              index === 19 &&
                              galleryData && (
                                <div className="col-span-2 sm:col-span-3 lg:col-span-4 w-full my-4">
                                  <SubscriptionPrompt
                                    galleryId={galleryData.id}
                                    galleryName={galleryData.name}
                                    onDismiss={() =>
                                      setShowSubscriptionPrompt(false)
                                    }
                                  />
                                </div>
                              )}
                          </React.Fragment>
                        ))}
                      </div>

                      {/* Pulsante "Carica altre foto" */}
                      {!areFiltersActive && (
                        <LoadMoreButton
                          onClick={loadMorePhotos}
                          isLoading={loadingMorePhotos}
                          hasMore={hasMorePhotos}
                        />
                      )}

                      {/* Conferma Selezione Button (Task 14) */}
                      {isSelectionMode && selectionStatus !== "completed" && (
                        <div className="mt-8 mb-6 text-center">
                          <div className="bg-white rounded-lg border-2 border-sage p-6 shadow-lg max-w-2xl mx-auto">
                            <h4 className="text-xl font-playfair text-blue-gray mb-4">
                              Pronto a confermare la selezione?
                            </h4>
                            <div className="mb-4">
                              <div className="text-3xl font-bold text-sage mb-2">
                                {selectedPhotoIds.length} / {requiredPhotoCount}
                              </div>
                              <p className="text-sm text-gray-600">
                                {selectedPhotoIds.length === requiredPhotoCount
                                  ? "✅ Perfetto! Puoi confermare la tua selezione."
                                  : `Seleziona ancora ${requiredPhotoCount - selectedPhotoIds.length} foto.`}
                              </p>
                            </div>

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
                                    onClick={handleConfirmSelection}
                                    disabled={
                                      isSubmittingSelection ||
                                      isDeadlinePassed ||
                                      (galleryData?.productRequirements 

                                        ? // Multi-product: check all products have required photos
                                          !galleryData.productRequirements.every((prod, idx) => {
                                            const assignedCount = Object.values(photoAssignments).filter(
                                              assignments => assignments.includes(String(idx))
                                            ).length;
                                            const requiredCount = Number(prod.prodottoNumeroFoto) || 0;
                                            return assignedCount >= requiredCount;
                                          })
                                        : // Legacy: check selectedPhotoIds count
                                          selectedPhotoIds.length !== requiredPhotoCount
                                      )
                                    }
                                    className="bg-sage hover:bg-sage/90 text-white px-8 py-6 text-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                                    data-testid="button-confirm-selection"
                                  >
                                    {isSubmittingSelection ? (
                                      <>
                                        <span className="animate-spin mr-2">⏳</span>
                                        Conferma in corso...
                                      </>
                                    ) : (
                                      <>✨ Conferma Selezione</>
                                    )}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  {galleryData?.productRequirements ? (
                                    <div className="text-sm">
                                      {galleryData.productRequirements.map((prod, idx) => {
                                        const assignedCount = Object.values(photoAssignments).filter(
                                          assignments => assignments.includes(String(idx))
                                        ).length;
                                        const requiredCount = Number(prod.prodottoNumeroFoto) || 0;
                                        const isComplete = assignedCount >= requiredCount;
                                        return (
                                          <div key={idx} className={isComplete ? 'text-green-600' : 'text-red-600'}>
                                            {isComplete ? '✓' : '✗'} {prod.prodottoNome}: {assignedCount}/{requiredCount}
                                          </div>
                                        );
                                      })}
                                    </div>
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
                    <div className="masonry-grid">
                      {guestPhotos.map((photo, index) => (
                        <div key={photo.id} className="masonry-item">
                          <div
                            className="gallery-image cursor-pointer relative group overflow-hidden rounded-lg shadow-md hover:shadow-lg transition-all duration-300"
                            onClick={() => openLightbox(photos.length + index)}
                          >
                            <img
                              src={photo.url}
                              alt={photo.name || `Foto ospite ${index + 1}`}
                              className="w-full h-auto object-cover transition-opacity duration-300 opacity-0 hover:opacity-95"
                              loading="lazy"
                              onLoad={(e) => {
                                (
                                  e.target as HTMLImageElement
                                ).classList.replace("opacity-0", "opacity-100");
                              }}
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
                        </div>
                      ))}
                    </div>
                  )}
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

      {/* Photo Lightbox - usa displayPhotos in modalità selezione per supportare filtro "Solo Selezionate" */}
      <ImageLightbox
        isOpen={lightboxOpen}
        onClose={closeLightbox}
        photos={(activeTab === "photographer" &&
        isSelectionMode &&
        selectionStatus !== "completed"
          ? displayPhotos
          : allPhotos
        ).map((photo) => ({
          id: photo.id,
          name: photo.name,
          url: photo.url,
          size: photo.size || 0,
          contentType: photo.contentType,
          createdAt: photo.createdAt || new Date(),
        }))}
        initialIndex={currentPhotoIndex}
      />

      {/* Edit Gallery Modal - Solo per Admin */}
      {galleryData && isAdmin && (
        <EditGalleryModal
          isOpen={isEditGalleryOpen}
          onClose={() => setIsEditGalleryOpen(false)}
          gallery={galleryData}
        />
      )}

      {/* 🎓 Onboarding Tutorial - Gestito autonomamente dal componente wrapper */}
      <GalleryOnboardingSpotlight
        galleryData={galleryData}
        isSelectionMode={isSelectionMode}
        isDeadlinePassed={isDeadlinePassed}
      />
    </div>
  );
}