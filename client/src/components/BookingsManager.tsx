/**
 * Bookings Manager - Gestione prenotazioni booking per admin
 */

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useLocation, useSearch } from "wouter";
import { nextMonday, isToday, isTomorrow, isYesterday, addDays, isSameDay, startOfDay } from "date-fns";
import {
  getAllBookings,
  approveBooking,
  rejectBooking,
  updateBookingStatus,
  deleteBooking,
  markBookingAsViewed,
  updateBooking,
  countRelatedEntities,
  deleteBookingCascade,
  updateWorkflowState,
} from "@/lib/bookings";
import { getAllCampaigns } from "@/lib/booking-campaigns";
import { getClienteByEmail } from "@/lib/clienti";
import { getAllOrders, createOrder, addAccontoPayment, recordSaldoPayment, getOrderTotals } from "@/lib/orders";
import EditOrderModal from "@/components/EditOrderModal";
import { getActiveProducts } from "@/lib/products";
import { getActiveProductCategories } from "@/lib/product-categories";
import ProductSelector from "@/components/ProductSelector";
import { GalleryService, type Gallery } from "@/lib/galleries";
import type {
  Booking,
  Order,
  Product,
  ProductCategory,
  OrderItem,
  BundleItem,
} from "@shared/booking-types";
import type { BookingCampaignFE } from "@shared/booking-types";
import { WorkflowState } from "@shared/schema";
import { formatPhoneForWhatsApp } from "@shared/phone-utils";
import NewGalleryModal from "@/components/NewGalleryModal";
import ShareGalleryButton from "@/components/ShareGalleryButton";
import ManualBookingModal from "@/components/ManualBookingModal";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Calendar,
  Clock,
  Mail,
  Phone,
  Package,
  CheckCircle,
  XCircle,
  Trash2,
  Eye,
  AlertCircle,
  Loader2,
  FileText,
  Search,
  ShoppingCart,
  Plus,
  Image as ImageIcon,
  Receipt,
  Edit,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Wallet,
  MessageCircle,
  Euro,
  History,
  Camera,
  CheckCircle2,
  Palette,
  Timer,
  PartyPopper,
  PackageCheck,
} from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { useFirebaseAuth } from "@/context/FirebaseAuthContext";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const STATI_BOOKING = [
  { value: "all", label: "Tutti", icon: FileText },
  { value: "in_attesa", label: "In Attesa", icon: Clock },
  { value: "confermata", label: "Confermate", icon: CheckCircle },
  { value: "completata", label: "Completate", icon: Package },
  { value: "annullata", label: "Annullate", icon: XCircle },
] as const;

const STATI_WORKFLOW = [
  { value: "all", label: "Tutti i workflow", icon: FileText },
  { value: WorkflowState.SHOOTING_DA_SVOLGERE, label: "Shooting da svolgere", icon: Camera },
  { value: WorkflowState.SHOOTING_COMPLETATO, label: "Shooting completato", icon: CheckCircle2 },
  { value: WorkflowState.IN_LAVORAZIONE, label: "In lavorazione", icon: Palette },
  { value: WorkflowState.IN_ATTESA_SELEZIONE, label: "In attesa selezione", icon: Timer },
  { value: WorkflowState.COMPLETATO, label: "Completato", icon: PartyPopper },
  { value: WorkflowState.CONSEGNATO, label: "Consegnato", icon: PackageCheck },
] as const;

function getStatoBadge(stato: string) {
  switch (stato) {
    case "in_attesa":
      return (
        <Badge
          variant="outline"
          className="bg-yellow-50 text-yellow-700 border-yellow-200"
        >
          In Attesa
        </Badge>
      );
    case "confermata":
      return (
        <Badge
          variant="outline"
          className="bg-green-50 text-green-700 border-green-200"
        >
          Confermata
        </Badge>
      );
    case "completata":
      return (
        <Badge
          variant="outline"
          className="bg-blue-50 text-blue-700 border-blue-200"
        >
          Completata
        </Badge>
      );
    case "annullata":
      return (
        <Badge
          variant="outline"
          className="bg-red-50 text-red-700 border-red-200"
        >
          Annullata
        </Badge>
      );
    default:
      return <Badge>{stato}</Badge>;
  }
}

interface BookingsManagerProps {
  highlightBookingId?: string | null;
  onHighlightComplete?: () => void;
}

export default function BookingsManager({
  highlightBookingId,
  onHighlightComplete,
}: BookingsManagerProps = {}) {
  const { toast } = useToast();
  const { user } = useFirebaseAuth();
  const [, navigate] = useLocation();
  const searchParams = useSearch();
  
  // Helper per leggere i query params iniziali
  const getInitialParams = useCallback(() => {
    const params = new URLSearchParams(searchParams);
    const parsedPage = parseInt(params.get("page") || "1", 10);
    return {
      stato: params.get("stato") || "all",
      search: params.get("search") || "",
      time: (params.get("time") as "all" | "upcoming" | "past" | "today" | "tomorrow" | "next-week" | "next-month") || "upcoming",
      workflow: params.get("workflow") || "all",
      selection: (params.get("selection") as "all" | "approved") || "all",
      page: isNaN(parsedPage) || parsedPage < 1 ? 1 : parsedPage,
    };
  }, [searchParams]);
  
  const initialParams = getInitialParams();
  
  const [selectedStato, setSelectedStato] = useState<string>(initialParams.stato);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>(initialParams.search);
  const [selectedBookingForOrder, setSelectedBookingForOrder] =
    useState<Booking | null>(null);
  const [selectedBookingForGallery, setSelectedBookingForGallery] =
    useState<Booking | null>(null);
  const [resolvedClienteId, setResolvedClienteId] = useState<string | undefined>(undefined);
  const [isResolvingCliente, setIsResolvingCliente] = useState(false);
  const [editBooking, setEditBooking] = useState<Booking | null>(null);
  const [showManualBookingModal, setShowManualBookingModal] = useState(false);
  const [currentPage, setCurrentPage] = useState(initialParams.page);
  const ITEMS_PER_PAGE = 10;
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const bookingRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
  const highlightTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const clearHighlightTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Ref per throttling auto-mark (evita chiamate ripetute)
  const autoMarkTriggeredRef = useRef(false);
  
  // Ref per evitare reset pagina al primo mount (preserva URL)
  const isFirstMountRef = useRef(true);
  
  const [expandedProducts, setExpandedProducts] = useState<
    Record<string, boolean>
  >({});
  const [timeFilter, setTimeFilter] = useState<
    "all" | "upcoming" | "past" | "today" | "tomorrow" | "next-week" | "next-month"
  >(initialParams.time);
  const [selectionFilter, setSelectionFilter] = useState<"all" | "approved">(
    initialParams.selection,
  );
  const [workflowFilter, setWorkflowFilter] = useState<string>(initialParams.workflow);
  
  // Sincronizza filtri con URL (senza ricaricare la pagina)
  const updateUrlParams = useCallback((updates: Record<string, string | number>) => {
    // SSR safety: evita crash in contesti server-side
    if (typeof window === 'undefined') return;
    
    const params = new URLSearchParams(window.location.search);
    
    Object.entries(updates).forEach(([key, value]) => {
      const strValue = String(value);
      // Non salvare valori di default nell'URL per mantenerlo pulito
      const isDefault = 
        (key === "stato" && strValue === "all") ||
        (key === "search" && strValue === "") ||
        (key === "time" && strValue === "upcoming") ||
        (key === "workflow" && strValue === "all") ||
        (key === "selection" && strValue === "all") ||
        (key === "page" && strValue === "1");
        
      if (isDefault) {
        params.delete(key);
      } else {
        params.set(key, strValue);
      }
    });
    
    const newUrl = params.toString() 
      ? `${window.location.pathname}?${params.toString()}`
      : window.location.pathname;
    
    window.history.replaceState({}, "", newUrl);
  }, []);

  // State per workflow state change con conferma
  const [workflowChangeBooking, setWorkflowChangeBooking] = useState<{
    booking: Booking;
    newState: WorkflowState;
  } | null>(null);

  // State per cancellazione a cascata
  const [deleteBookingCascadeId, setDeleteBookingCascadeId] = useState<
    string | null
  >(null);
  const [cascadeDeleteCounts, setCascadeDeleteCounts] = useState<{
    ordersCount: number;
    galleriesCount: number;
  } | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  // State form modifica prenotazione
  const [editNome, setEditNome] = useState("");
  const [editCognome, setEditCognome] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editWhatsapp, setEditWhatsapp] = useState("");
  const [editNote, setEditNote] = useState("");

  // State per gestione ordini inline (pagamenti, modifica, ecc.)
  const [expandedOrders, setExpandedOrders] = useState<Record<string, boolean>>({});
  const [paymentDialog, setPaymentDialog] = useState<{
    orderId: string;
    tipo: 'acconto' | 'saldo';
    bookingId: string;
  } | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'contante' | 'carta' | 'bonifico' | 'paypal'>('contante');
  const [paymentAmount, setPaymentAmount] = useState<string>('');
  const [paymentNote, setPaymentNote] = useState<string>('');
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);

  // Query bookings - sempre tutti per permettere filtro client-side
  const {
    data: allBookings = [],
    isLoading,
    refetch,
  } = useQuery<Booking[]>({
    queryKey: ["bookings"],
    queryFn: getAllBookings,
  });

  // Query campagne per nomi
  const { data: campaigns = [] } = useQuery<BookingCampaignFE[]>({
    queryKey: ["campaigns"],
    queryFn: getAllCampaigns,
  });

  // Query ordini per lookup
  const { data: allOrders = [] } = useQuery<Order[]>({
    queryKey: ["orders"],
    queryFn: getAllOrders,
  });

  // Query prodotti attivi per dialog creazione ordine
  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["products", "active"],
    queryFn: getActiveProducts,
  });
  
  // Query categorie prodotti per ProductSelector
  const { data: productCategories = [] } = useQuery<ProductCategory[]>({
    queryKey: ["product-categories", "active"],
    queryFn: getActiveProductCategories,
  });

  // Query galleries per trovare gallerie create da bookings
  const { data: allGalleries = [] } = useQuery<Gallery[]>({
    queryKey: ["galleries"],
    queryFn: GalleryService.getAllGalleries,
  });

  // Sincronizza URL quando cambiano i filtri
  useEffect(() => {
    updateUrlParams({
      stato: selectedStato,
      search: searchQuery,
      time: timeFilter,
      workflow: workflowFilter,
      selection: selectionFilter,
      page: currentPage,
    });
  }, [selectedStato, searchQuery, timeFilter, workflowFilter, selectionFilter, currentPage, updateUrlParams]);

  // Helper: Ottieni nome campagna
  const getCampaignName = (campaignId: string) => {
    const campaign = campaigns.find((c) => c.id === campaignId);
    return campaign?.nome || "Campagna sconosciuta";
  };

  // Helper: Trova ordine per booking
  const getOrderByBookingId = (bookingId: string): Order | undefined => {
    return allOrders.find((order) => order.bookingId === bookingId);
  };

  // Helper: Trova galleria per booking (prima galleria trovata)
  const getGalleryByBookingId = (bookingId: string): Gallery | undefined => {
    return allGalleries.find((gallery) => gallery.bookingId === bookingId);
  };

  // Helper: Trova TUTTE le gallerie collegate a un booking
  const getGalleriesByBookingId = (bookingId: string): Gallery[] => {
    return allGalleries.filter((gallery) => gallery.bookingId === bookingId);
  };

  // Helper: Ottieni data da timestamp Firestore
  const getDateFromTimestamp = (timestamp: any): Date | null => {
    if (!timestamp) return null;
    if (timestamp.toDate) return timestamp.toDate();
    if (timestamp instanceof Date) return timestamp;
    return new Date(timestamp);
  };

  // Helper: Etichetta giorno intuitiva
  const getDayLabel = (date: Date): string => {
    const now = new Date();
    if (isToday(date)) return "Oggi";
    if (isTomorrow(date)) return "Domani";
    if (isYesterday(date)) return "Ieri";
    if (isSameDay(date, addDays(now, 2))) return "Dopodomani";
    return format(date, "EEEE d MMMM yyyy", { locale: it });
  };

  // Interfaccia per raggruppamento per giorno
  interface DayGroup {
    date: Date;
    dateKey: string;
    label: string;
    bookings: Booking[];
  }
  
  // Helper: Raggruppa prenotazioni per giorno
  const groupBookingsByDay = (bookingsList: Booking[]): DayGroup[] => {
    const groups: Map<string, DayGroup> = new Map();
    
    for (const booking of bookingsList) {
      const bookingDate = getDateFromTimestamp(booking.dataShootingInizio);
      if (!bookingDate) continue;
      
      const dayStart = startOfDay(bookingDate);
      const dateKey = format(dayStart, "yyyy-MM-dd");
      
      if (!groups.has(dateKey)) {
        groups.set(dateKey, {
          date: dayStart,
          dateKey,
          label: getDayLabel(dayStart),
          bookings: [],
        });
      }
      
      groups.get(dateKey)!.bookings.push(booking);
    }
    
    // Ordina gruppi per data (dal più vicino al più lontano)
    const sortedGroups = Array.from(groups.values()).sort(
      (a, b) => a.date.getTime() - b.date.getTime()
    );
    
    // Ordina booking all'interno di ogni gruppo per orario
    for (const group of sortedGroups) {
      group.bookings.sort((a, b) => {
        const timeA = getDateFromTimestamp(a.dataShootingInizio)?.getTime() || 0;
        const timeB = getDateFromTimestamp(b.dataShootingInizio)?.getTime() || 0;
        return timeA - timeB;
      });
    }
    
    return sortedGroups;
  };

  // Filtra, cerca e ordina bookings
  const bookings = useMemo(() => {
    let filtered = [...allBookings];

    // Se c'è una ricerca attiva, cerca in TUTTE le prenotazioni ignorando i filtri
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((b) => {
        const nomeCompleto =
          `${b.cliente.nome} ${b.cliente.cognome}`.toLowerCase();
        const email = b.cliente.email.toLowerCase();
        const campagna = getCampaignName(b.campaignId).toLowerCase();
        const whatsapp = (b.cliente.whatsapp || '').toLowerCase();

        return (
          nomeCompleto.includes(query) ||
          email.includes(query) ||
          campagna.includes(query) ||
          whatsapp.includes(query)
        );
      });
    } else {
      // Senza ricerca, applica i filtri normali

      // 1. Filtra per stato (escludi annullate se "all")
      if (selectedStato === "all") {
        // Escludi le annullate dalla vista "Tutte" per evitare confusione
        filtered = filtered.filter((b) => b.stato !== "annullata");
      } else {
        filtered = filtered.filter((b) => b.stato === selectedStato);
      }

      // 2. Filtra per selezioni approvate
      if (selectionFilter === "approved") {
        filtered = filtered.filter((b) => {
          const gallery = getGalleryByBookingId(b.id!);
          return gallery && gallery.selectionStatus === "completed";
        });
      }

      // 3. Filtra per stato workflow
      if (workflowFilter !== "all") {
        filtered = filtered.filter((b) => b.statoWorkflow === workflowFilter);
      }

      // 4. Filtra per intervallo temporale
      if (timeFilter !== "all") {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        // FIX: Usa math per evitare mutazioni e bug timezone
        const tomorrow = new Date(today.getTime() + 86400000);
        const dayAfterTomorrow = new Date(tomorrow.getTime() + 86400000);

        filtered = filtered.filter((b) => {
          const getTime = (timestamp: any): number => {
            if (!timestamp) return 0;
            if (timestamp.toDate) return timestamp.toDate().getTime();
            if (timestamp instanceof Date) return timestamp.getTime();
            return new Date(timestamp).getTime();
          };

          const bookingTime = getTime(b.dataShootingInizio);

          if (timeFilter === "upcoming") {
            // Prossimi Impegni: da oggi in poi (>= oggi 00:00)
            return bookingTime >= today.getTime();
          } else if (timeFilter === "past") {
            // Impegni Passati: prima di oggi (< oggi 00:00)
            return bookingTime < today.getTime();
          } else if (timeFilter === "today") {
            // Oggi: >= oggi 00:00 e < domani 00:00
            return (
              bookingTime >= today.getTime() && bookingTime < tomorrow.getTime()
            );
          } else if (timeFilter === "tomorrow") {
            // Domani: >= domani 00:00 e < dopodomani 00:00
            return (
              bookingTime >= tomorrow.getTime() &&
              bookingTime < dayAfterTomorrow.getTime()
            );
          } else if (timeFilter === "next-week") {
            // Prossima settimana: dal prossimo lunedì alla prossima domenica
            // FIX: Usa date-fns nextMonday per evitare getDay() e timezone issues
            const monday = nextMonday(today);
            const nextSunday = new Date(monday.getTime() + 6 * 86400000);

            return (
              bookingTime >= monday.getTime() &&
              bookingTime < nextSunday.getTime()
            );
          } else if (timeFilter === "next-month") {
            // Prossimo mese: dal 1° giorno del prossimo mese all'ultimo
            const nextMonth = new Date(
              today.getFullYear(),
              today.getMonth() + 1,
              1,
            );
            const monthAfter = new Date(
              today.getFullYear(),
              today.getMonth() + 2,
              1,
            );

            return (
              bookingTime >= nextMonth.getTime() &&
              bookingTime < monthAfter.getTime()
            );
          }

          return true;
        });
      }
    }

    // 5. Ordina per data e ora
    filtered.sort((a, b) => {
      const getTime = (timestamp: any): number => {
        if (!timestamp) return 0;
        if (timestamp.toDate) return timestamp.toDate().getTime();
        if (timestamp instanceof Date) return timestamp.getTime();
        return new Date(timestamp).getTime();
      };

      // - "past": ordine decrescente (più recenti prima)
      // - "upcoming", "today", "tomorrow", etc: ordine crescente (più vicini prima)
      // - "all": ordine decrescente (più recenti prima)
      const multiplier = (timeFilter === "all" || timeFilter === "past") ? -1 : 1;
      return (
        multiplier *
        (getTime(a.dataShootingInizio) - getTime(b.dataShootingInizio))
      );
    });

    return filtered;
  }, [
    allBookings,
    selectedStato,
    searchQuery,
    campaigns,
    timeFilter,
    selectionFilter,
    workflowFilter,
    allGalleries,
  ]);

  // Gruppi per giorno (calcolato da bookings filtrati)
  const dayGroups = useMemo(() => groupBookingsByDay(bookings), [bookings]);

  // Paginazione
  const totalPages = Math.ceil(bookings.length / ITEMS_PER_PAGE);
  const paginatedBookings = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return bookings.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [bookings, currentPage]);

  // Reset currentPage quando cambiano filtri (ma non al primo mount per preservare URL)
  useEffect(() => {
    if (isFirstMountRef.current) {
      isFirstMountRef.current = false;
      return;
    }
    setCurrentPage(1);
  }, [selectedStato, searchQuery, timeFilter, selectionFilter, workflowFilter]);

  // 🔔 Auto-mark bookings in_attesa come visualizzati (per notifiche)
  useEffect(() => {
    if (!allBookings || !user || allBookings.length === 0) return;
    
    const pendingBookings = allBookings.filter(
      b => b.stato === 'in_attesa' && !b.dataVisualizzazione
    );
    
    if (pendingBookings.length === 0) {
      autoMarkTriggeredRef.current = false; // Reset se nessun pending
      return;
    }
    
    if (autoMarkTriggeredRef.current) return; // Già eseguito
    
    // Marca flag per evitare re-trigger
    autoMarkTriggeredRef.current = true;
    
    // Sequential mark con cache invalidation
    (async () => {
      try {
        for (const b of pendingBookings) {
          await markBookingAsViewed(b.id);
        }
        // Invalida cache per refresh UI
        queryClient.invalidateQueries({ queryKey: ['bookings'] });
      } catch (error) {
        console.error('[Auto-mark] Errore mark viewed bookings:', error);
        autoMarkTriggeredRef.current = false; // Reset su errore per retry
      }
    })();
  }, [allBookings, user]);

  // Scroll e highlight booking quando richiesto
  useEffect(() => {
    // Cleanup dei timeout precedenti
    if (highlightTimeoutRef.current) {
      clearTimeout(highlightTimeoutRef.current);
      highlightTimeoutRef.current = null;
    }
    if (clearHighlightTimeoutRef.current) {
      clearTimeout(clearHighlightTimeoutRef.current);
      clearHighlightTimeoutRef.current = null;
    }

    if (!highlightBookingId) return;

    // Attendi il caricamento dei dati prima di procedere
    if (isLoading) {
      return; // Non chiamare onHighlightComplete - l'effect riproverà quando isLoading diventa false
    }

    // Cerca il booking nel dataset completo
    const targetBooking = allBookings.find((b) => b.id === highlightBookingId);

    if (!targetBooking) {
      console.warn(`Booking ${highlightBookingId} non trovato nel dataset`);
      onHighlightComplete?.();
      return;
    }

    // Calcola la pagina dove si trova il booking PRIMA di resettare i filtri
    // Usa allBookings direttamente (equivalente a filtri='all', search='')
    const sortedAllBookings = [...allBookings].sort((a, b) => {
      const getTime = (timestamp: any): number => {
        if (!timestamp) return 0;
        if (timestamp.toDate) return timestamp.toDate().getTime();
        if (timestamp instanceof Date) return timestamp.getTime();
        return new Date(timestamp).getTime();
      };
      return getTime(b.dataShootingInizio) - getTime(a.dataShootingInizio);
    });

    const bookingIndex = sortedAllBookings.findIndex(
      (b) => b.id === highlightBookingId,
    );
    if (bookingIndex === -1) {
      console.warn(
        `Booking ${highlightBookingId} non trovato nella lista ordinata`,
      );
      onHighlightComplete?.();
      return;
    }

    const targetPage = Math.floor(bookingIndex / ITEMS_PER_PAGE) + 1;

    // Reset TUTTI i filtri e paginazione in modo sincrono
    setSelectedStato("all");
    setSearchQuery("");
    setTimeFilter("all");
    setWorkflowFilter("all");
    setSelectionFilter("all");
    setCurrentPage(targetPage);

    // Timeout per assicurarsi che il DOM sia renderizzato dopo cambio pagina
    highlightTimeoutRef.current = setTimeout(() => {
      const element = bookingRefs.current[highlightBookingId];
      if (element) {
        // Scroll smooth alla card
        element.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });

        // Aggiungi highlight temporaneo
        setHighlightedId(highlightBookingId);

        // Rimuovi highlight dopo 3 secondi
        clearHighlightTimeoutRef.current = setTimeout(() => {
          setHighlightedId(null);
          onHighlightComplete?.();
          clearHighlightTimeoutRef.current = null;
        }, 3000);
      } else {
        console.warn(
          `Elemento DOM per booking ${highlightBookingId} non trovato`,
        );
        onHighlightComplete?.();
      }
      highlightTimeoutRef.current = null;
    }, 300);

    // Cleanup on unmount
    return () => {
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
        highlightTimeoutRef.current = null;
      }
      if (clearHighlightTimeoutRef.current) {
        clearTimeout(clearHighlightTimeoutRef.current);
        clearHighlightTimeoutRef.current = null;
      }
    };
  }, [highlightBookingId, allBookings, isLoading, onHighlightComplete]);

  // Mutation: Approva prenotazione
  const approveMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      const adminUid = user?.uid || "admin";
      // Marca come vista prima di approvare (per far scomparire badge NUOVA)
      await markBookingAsViewed(bookingId);
      await approveBooking(bookingId, adminUid);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
      toast({
        title: "Prenotazione approvata",
        description: "Email di conferma inviata al cliente",
      });
      setSelectedBooking(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Errore approvazione",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Mutation: Rifiuta prenotazione
  const rejectMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      const adminUid = user?.uid || "admin";
      // Marca come vista prima di rifiutare (per far scomparire badge NUOVA)
      await markBookingAsViewed(bookingId);
      await rejectBooking(bookingId, adminUid);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
      toast({
        title: "Prenotazione rifiutata",
        description: "Email inviata al cliente con link per nuova prenotazione",
      });
      setSelectedBooking(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Errore rifiuto",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Mutation: Cambia stato
  const changeStatusMutation = useMutation({
    mutationFn: async ({ id, stato }: { id: string; stato: any }) => {
      await updateBookingStatus(id, stato);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
      toast({
        title: "Stato aggiornato",
        description: "Lo stato della prenotazione è stato modificato",
      });
      setSelectedBooking(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Errore aggiornamento",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Mutation: Elimina prenotazione
  const deleteMutation = useMutation({
    mutationFn: deleteBooking,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
      toast({
        title: "Prenotazione eliminata",
        description: "La prenotazione è stata rimossa dal sistema",
      });
      setDeleteConfirmId(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Errore eliminazione",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Mutation: Cancellazione a cascata prenotazione → ordini → gallerie
  const deleteBookingCascadeMutation = useMutation({
    mutationFn: (params: { bookingId: string; cancelReason?: string }) => deleteBookingCascade(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["galleries"] });

      toast({
        title: "Prenotazione eliminata",
        description:
          "La prenotazione e tutti i dati associati (ordini, gallerie) sono stati rimossi con successo",
      });

      setDeleteBookingCascadeId(null);
      setCascadeDeleteCounts(null);
      setCancelReason("");
    },
    onError: (error: Error) => {
      toast({
        title: "Errore eliminazione",
        description: error.message,
        variant: "destructive",
      });
      setDeleteBookingCascadeId(null);
      setCascadeDeleteCounts(null);
    },
  });

  // Mutation: Aggiorna prenotazione
  const updateBookingMutation = useMutation({
    mutationFn: ({
      bookingId,
      data,
      oldEmail,
    }: {
      bookingId: string;
      data: { cliente?: any; note?: string };
      oldEmail?: string;
    }) => updateBooking(bookingId, data, oldEmail),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
      const emailChanged =
        variables.oldEmail &&
        variables.data.cliente?.email &&
        variables.oldEmail !== variables.data.cliente.email;
      toast({
        title: "Prenotazione aggiornata",
        description: emailChanged
          ? "Dati aggiornati con successo. Email di notifica inviata al cliente."
          : "I dati della prenotazione sono stati aggiornati",
      });
      setEditBooking(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Errore aggiornamento",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Mutation: Marca come vista
  const markAsViewedMutation = useMutation({
    mutationFn: markBookingAsViewed,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
    },
    onError: (error: Error) => {
      console.error("Errore marca come vista:", error);
      // Silent fail - non mostrare toast per non disturbare admin
    },
  });

  // Mutation: Crea ordine da booking
  const createOrderMutation = useMutation({
    mutationFn: createOrder,
    onSuccess: async (_orderId: string, orderData: any) => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["bookings"] });

      // Invia email automatica al cliente (non bloccante)
      let emailSent = false;
      if (orderData.emailCliente && orderData.emailCliente.trim()) {
        try {
          // Prepara nome prodotto per l'email
          const prodottoNome =
            orderData.prodotti.length === 1
              ? orderData.prodotti[0].prodottoNome
              : `Ordine Multi-prodotto (${orderData.prodotti.length} prodotti)`;

          // Calcola totale dalla somma prodotti (con sconto se presente)
          const subtotale = orderData.prodotti.reduce(
            (sum: number, p: any) => sum + p.prodottoPrezzo * p.quantita,
            0,
          );
          const sconto = orderData.sconto || 0;
          const totale = Math.max(0, subtotale - sconto);
          const acconto = orderData.acconto || 0;
          const saldo = totale - acconto;

          // Mappa prodotti per template email
          const prodottiEmail = orderData.prodotti.map((p: any) => ({
            nome: p.prodottoNome,
            prezzo: p.prodottoPrezzo,
            quantita: p.quantita,
          }));

          // Chiama endpoint email
          const emailResponse = await fetch("/api/email/order-created", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              recipientEmail: orderData.emailCliente,
              clienteName: orderData.nomeCliente,
              prodottoNome,
              totale,
              acconto,
              saldo,
              prodotti: prodottiEmail,
              sconto: sconto > 0 ? sconto : undefined,
            }),
          });

          // CRITICAL: Controlla se l'email è stata inviata con successo
          if (!emailResponse.ok) {
            const errorData = await emailResponse
              .json()
              .catch(() => ({ error: "Unknown error" }));
            throw new Error(
              `Errore invio email: ${errorData.error || emailResponse.statusText}`,
            );
          }

          emailSent = true;
          console.log(
            `✅ Email "Ordine Creato" inviata a ${orderData.emailCliente}`,
          );
        } catch (emailError: any) {
          console.error(
            "⚠️ Errore invio email (ordine comunque creato):",
            emailError,
          );
          // Mostra toast warning per fallimento email
          toast({
            title: "Ordine creato, email non inviata",
            description: `L'ordine è stato creato ma l'email al cliente ha fallito: ${emailError.message}`,
            variant: "destructive",
          });
        }
      }

      // Toast success solo se email OK o nessuna email richiesta
      if (!orderData.emailCliente || emailSent) {
        toast({
          title: "Ordine creato",
          description: emailSent
            ? "L'ordine è stato creato e il cliente ha ricevuto una email di conferma"
            : "L'ordine è stato creato con successo",
        });
      }

      setSelectedBookingForOrder(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Errore creazione ordine",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Mutation: Registra acconto
  const accontoMutation = useMutation({
    mutationFn: ({ 
      orderId, 
      importo, 
      metodo, 
      note 
    }: { 
      orderId: string; 
      importo: number; 
      metodo: 'contante' | 'carta' | 'bonifico' | 'paypal';
      note?: string;
    }) => addAccontoPayment(orderId, importo, metodo, note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      toast({
        title: "Acconto registrato",
        description: "Il pagamento è stato registrato e il cliente riceverà una email di conferma",
      });
      setPaymentDialog(null);
      setPaymentAmount('');
      setPaymentNote('');
    },
    onError: (error: Error) => {
      toast({
        title: 'Errore registrazione',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Mutation: Registra saldo
  const saldoMutation = useMutation({
    mutationFn: ({ orderId, metodo, note }: { orderId: string; metodo: 'contante' | 'carta' | 'bonifico' | 'paypal'; note?: string }) =>
      recordSaldoPayment(orderId, metodo, note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      toast({
        title: "Saldo registrato",
        description: "Il pagamento finale è stato registrato e il cliente riceverà una email di conferma",
      });
      setPaymentDialog(null);
      setPaymentNote('');
    },
    onError: (error: Error) => {
      toast({
        title: 'Errore registrazione',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Mutation: Aggiorna stato workflow
  const workflowStateMutation = useMutation({
    mutationFn: async ({
      bookingId,
      newState,
      emailData,
    }: {
      bookingId: string;
      newState: WorkflowState;
      emailData?: any;
    }) => {
      await updateWorkflowState(bookingId, "booking", newState, emailData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      toast({
        title: "✅ Stato workflow aggiornato",
        description:
          "Il workflow è stato aggiornato e l'email è stata inviata al cliente.",
      });
      setWorkflowChangeBooking(null);
    },
    onError: (error: Error) => {
      toast({
        title: "❌ Errore",
        description: `Impossibile aggiornare lo stato: ${error.message}`,
        variant: "destructive",
      });
      setWorkflowChangeBooking(null);
    },
  });

  // Handler: Apri dettagli e marca come vista
  const handleOpenDetails = async (booking: Booking) => {
    setSelectedBooking(booking);

    // Marca come vista solo se è nuova (dataVisualizzazione null/undefined)
    if (!booking.dataVisualizzazione) {
      markAsViewedMutation.mutate(booking.id);
    }
  };

  // Handler: Request workflow state change (apre conferma dialog)
  const handleWorkflowStateChange = (booking: Booking, newState: string) => {
    if (
      !newState ||
      !Object.values(WorkflowState).includes(newState as WorkflowState)
    ) {
      return;
    }
    setWorkflowChangeBooking({ booking, newState: newState as WorkflowState });
  };

  // Handler: Conferma cambio workflow state
  const handleConfirmWorkflowChange = () => {
    if (!workflowChangeBooking) return;

    const { booking, newState } = workflowChangeBooking;

    // Prepara dati per email
    const emailData = {
      clienteNome: `${booking.cliente.nome} ${booking.cliente.cognome}`.trim(),
      clienteEmail: booking.cliente.email,
      prodottoNome: booking.prodottoNome,
      campaignName: getCampaignName(booking.campaignId),
      bookingDate: formatDateTime(booking.dataShootingInizio),
    };

    workflowStateMutation.mutate({
      bookingId: booking.id,
      newState,
      emailData,
    });
  };

  // Handler: Apri dialog modifica
  const handleOpenEdit = (booking: Booking) => {
    setEditBooking(booking);
    setEditNome(booking.cliente.nome);
    setEditCognome(booking.cliente.cognome);
    setEditEmail(booking.cliente.email);
    setEditWhatsapp(booking.cliente.whatsapp);
    setEditNote(booking.note || "");
  };

  // Handler: Salva modifiche prenotazione
  const handleSaveEdit = () => {
    if (!editBooking) return;

    // Validazione base
    if (
      !editNome.trim() ||
      !editCognome.trim() ||
      !editEmail.trim() ||
      !editWhatsapp.trim()
    ) {
      toast({
        title: "Campi obbligatori",
        description: "Nome, Cognome, Email e WhatsApp sono campi obbligatori",
        variant: "destructive",
      });
      return;
    }

    // Validazione email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(editEmail)) {
      toast({
        title: "Email non valida",
        description: "Inserisci un indirizzo email valido",
        variant: "destructive",
      });
      return;
    }

    updateBookingMutation.mutate({
      bookingId: editBooking.id,
      data: {
        cliente: {
          nome: editNome.trim(),
          cognome: editCognome.trim(),
          email: editEmail.trim(),
          whatsapp: editWhatsapp.trim(),
        },
        note: editNote.trim(),
      },
      oldEmail: editBooking.cliente.email, // Per rilevare cambio email
    });
  };

  // Helper: Toggle espansione ordine
  const toggleOrderExpansion = (bookingId: string) => {
    setExpandedOrders(prev => ({
      ...prev,
      [bookingId]: !prev[bookingId]
    }));
  };

  // Helper: Apri WhatsApp con messaggio pre-compilato per ordine
  const openWhatsAppForOrder = (order: Order, booking: Booking) => {
    const phone = formatPhoneForWhatsApp(booking.cliente.whatsapp);
    if (!phone) {
      toast({
        title: 'Numero non disponibile',
        description: 'Il cliente non ha un numero WhatsApp registrato',
        variant: 'destructive',
      });
      return;
    }
    
    const totals = getOrderTotals(order);
    
    // Costruisce lista prodotti con supporto bundle, quantità e numero foto
    let prodottiMsg = '';
    if (order.prodotti && order.prodotti.length > 0) {
      order.prodotti.forEach((p, i) => {
        const isBundle = p.isBundle && p.bundleItems && p.bundleItems.length > 0;
        const bundleIcon = isBundle ? ' 📦' : '';
        const quantitaLabel = p.quantita > 1 ? ` x${p.quantita}` : '';
        
        // Calcola foto totali: per bundle somma bundleItems, altrimenti usa prodottoNumeroFoto
        const totalPhotos = isBundle && p.bundleItems
          ? p.bundleItems.reduce((sum, bi) => sum + (bi.numeroFoto || 0) * (bi.quantita || 1), 0)
          : p.prodottoNumeroFoto || 0;
        const photoLabel = totalPhotos > 0 ? ` (${totalPhotos} foto)` : '';
        
        prodottiMsg += `${i + 1}. ${p.prodottoNome}${quantitaLabel}${bundleIcon}${photoLabel}\n`;
        
        // Se è un bundle, elenca i prodotti inclusi
        if (isBundle && p.bundleItems) {
          p.bundleItems.forEach((item) => {
            const itemPhotos = item.numeroFoto > 0 ? ` (${item.numeroFoto * item.quantita} foto)` : '';
            prodottiMsg += `   └ ${item.prodottoNome}${item.quantita > 1 ? ` x${item.quantita}` : ''}${itemPhotos}\n`;
          });
        }
      });
    } else {
      prodottiMsg = 'Ordine\n';
    }
    
    // Costruisce riepilogo prezzi con sconto se presente
    let prezziMsg = '';
    if (order.sconto && order.sconto > 0) {
      const subtotale = totals.totale + order.sconto;
      prezziMsg = 
        `💵 Subtotale: €${subtotale.toFixed(2)}\n` +
        `🎁 Sconto: -€${order.sconto.toFixed(2)}\n` +
        `💰 *Totale: €${totals.totale.toFixed(2)}*\n`;
    } else {
      prezziMsg = `💰 *Totale: €${totals.totale.toFixed(2)}*\n`;
    }
    
    const message = encodeURIComponent(
      `Ciao ${booking.cliente.nome}! 👋\n\n` +
      `Ecco il riepilogo del tuo ordine:\n\n` +
      `*PRODOTTI*\n${prodottiMsg}\n` +
      `${prezziMsg}` +
      `✅ Pagato: €${totals.totalePagato.toFixed(2)}\n` +
      `📝 Saldo: €${totals.saldoResiduo.toFixed(2)}\n\n` +
      `Per qualsiasi domanda sono a disposizione!`
    );
    
    window.open(`https://wa.me/${phone}?text=${message}`, '_blank');
  };

  // Handler: Richiesta cancellazione a cascata
  const handleRequestCascadeDelete = async (bookingId: string) => {
    try {
      // Conta elementi associati prima di mostrare dialog
      const counts = await countRelatedEntities(bookingId);
      setCascadeDeleteCounts(counts);
      setDeleteBookingCascadeId(bookingId);
    } catch (error: any) {
      toast({
        title: "Errore",
        description: `Impossibile contare elementi associati: ${error.message}`,
        variant: "destructive",
      });
    }
  };

  // Handler: Conferma cancellazione a cascata
  const handleConfirmCascadeDelete = () => {
    if (!deleteBookingCascadeId) return;
    deleteBookingCascadeMutation.mutate({
      bookingId: deleteBookingCascadeId,
      cancelReason: cancelReason.trim() || undefined,
    });
  };

  // Helper: Formatta data/ora
  const formatDateTime = (timestamp: any) => {
    if (!timestamp) return "N/A";
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return format(date, "EEEE d MMMM yyyy 'alle' HH:mm", { locale: it });
  };

  const formatTime = (timestamp: any) => {
    if (!timestamp) return "N/A";
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return format(date, "HH:mm", { locale: it });
  };

  // Helper: Formatta timestamp per input date (YYYY-MM-DD)
  const formatDateForInput = (timestamp: any): string => {
    if (!timestamp) return "";
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return format(date, "yyyy-MM-dd");
  };

  return (
    <div className="space-y-6">
      {/* Contenuto Prenotazioni */}
      <>
          {/* Header e filtri */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            {/* Header */}
            <div className="border-b border-gray-200 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-sage/10 flex items-center justify-center">
                  <Calendar className="w-5 h-5 text-sage" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">
                    Gestione Prenotazioni
                  </h2>
                  <p className="text-sm text-gray-500">
                    Visualizza e gestisci tutte le prenotazioni dei clienti
                  </p>
                </div>
              </div>
            </div>

            {/* Filtri */}
            <div className="px-6 py-4 space-y-4">
              {/* Prima riga filtri */}
              <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3">
                {/* Filtro stato prenotazione */}
                <div className="w-full lg:w-40">
                  <Select
                    value={selectedStato}
                    onValueChange={setSelectedStato}
                  >
                    <SelectTrigger
                      data-testid="select-stato-filter"
                      className="h-10"
                    >
                      <SelectValue placeholder="Tutti" />
                    </SelectTrigger>
                    <SelectContent>
                      {STATI_BOOKING.map((stato) => {
                        const IconComponent = stato.icon;
                        return (
                          <SelectItem key={stato.value} value={stato.value}>
                            <span className="flex items-center gap-2">
                              <IconComponent className="h-4 w-4" />
                              {stato.label}
                            </span>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>

                {/* Filtro stato workflow */}
                <div className="w-full lg:w-52">
                  <Select
                    value={workflowFilter}
                    onValueChange={setWorkflowFilter}
                  >
                    <SelectTrigger
                      data-testid="select-workflow-filter"
                      className="h-10"
                    >
                      <SelectValue placeholder="Tutti i workflow" />
                    </SelectTrigger>
                    <SelectContent>
                      {STATI_WORKFLOW.map((stato) => {
                        const IconComponent = stato.icon;
                        return (
                          <SelectItem key={stato.value} value={stato.value}>
                            <span className="flex items-center gap-2">
                              <IconComponent className="h-4 w-4" />
                              {stato.label}
                            </span>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>

                {/* Filtro data */}
                <div className="w-full lg:w-56">
                  <Select
                    value={timeFilter}
                    onValueChange={(value: any) => {
                      setTimeFilter(value);
                      setCurrentPage(1);
                    }}
                  >
                    <SelectTrigger
                      data-testid="select-time-filter"
                      className="h-10"
                    >
                      <SelectValue placeholder="Tutte le date" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="upcoming">Prossimi Impegni</SelectItem>
                      <SelectItem value="past">Impegni Passati</SelectItem>
                      <SelectItem value="all">Tutte le date</SelectItem>
                      <SelectItem value="today">Oggi</SelectItem>
                      <SelectItem value="tomorrow">Domani</SelectItem>
                      <SelectItem value="next-week">
                        Prossima Settimana
                      </SelectItem>
                      <SelectItem value="next-month">Prossimo Mese</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Pulsanti Tutte/Solo Approvate */}
                <div className="flex gap-2">
                  <Button
                    variant={selectionFilter === "all" ? "default" : "outline"}
                    size="default"
                    onClick={() => setSelectionFilter("all")}
                    className={
                      selectionFilter === "all"
                        ? "bg-sage hover:bg-dark-sage h-10"
                        : "h-10"
                    }
                    data-testid="filter-all-selections-btn"
                  >
                    <Calendar className="w-4 h-4 mr-2" />
                    Tutte
                  </Button>
                  <Button
                    variant={
                      selectionFilter === "approved" ? "default" : "outline"
                    }
                    size="default"
                    onClick={() => setSelectionFilter("approved")}
                    className={
                      selectionFilter === "approved"
                        ? "bg-green-600 hover:bg-green-700 h-10"
                        : "h-10"
                    }
                    data-testid="filter-approved-selections-btn"
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Selezioni Approvate
                  </Button>
                </div>

                {/* Pulsanti azione */}
                <div className="flex gap-2 ml-auto">
                  <Button
                    variant="default"
                    size="default"
                    onClick={() => setShowManualBookingModal(true)}
                    className="bg-sage hover:bg-dark-sage h-10"
                    data-testid="button-new-manual-booking"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Nuova Prenotazione
                  </Button>
                </div>
              </div>

              {/* Seconda riga - Barra di ricerca */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Cerca per nome, email o campagna..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 h-10"
                  data-testid="input-search-bookings"
                />
              </div>

              {/* Badge contatore risultati */}
              <div className="flex items-center gap-2">
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-sage/10 text-sage">
                  <span className="font-semibold">{bookings.length}</span>
                  <span className="text-sm">
                    {bookings.length === 1 ? "prenotazione" : "prenotazioni"}
                  </span>
                </div>
                {(selectedStato !== "all" ||
                  searchQuery.trim() ||
                  timeFilter !== "all" ||
                  selectionFilter !== "all") && (
                  <span className="text-xs text-gray-500">(filtrate)</span>
                )}
              </div>
            </div>
          </div>

          {/* Lista prenotazioni */}
          {isLoading ? (
            <Card>
              <CardContent className="py-12 flex justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-sage" />
              </CardContent>
            </Card>
          ) : bookings.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-gray-500">
                <AlertCircle className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                <p className="text-lg font-medium">
                  Nessuna prenotazione trovata
                </p>
                <p className="text-sm mt-2">
                  {selectedStato === "all"
                    ? "Non ci sono prenotazioni nel sistema"
                    : `Non ci sono prenotazioni con stato "${STATI_BOOKING.find((s) => s.value === selectedStato)?.label}"`}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {dayGroups.map((group) => {
                const isPast = group.date < startOfDay(new Date());
                
                return (
                  <div key={group.dateKey} className="space-y-3">
                    {/* Header del giorno */}
                    <div className={`sticky top-0 z-10 flex items-center gap-3 p-3 rounded-lg shadow-sm ${
                      group.label === "Oggi" 
                        ? "bg-green-100 border border-green-300" 
                        : group.label === "Domani"
                        ? "bg-blue-100 border border-blue-300"
                        : group.label === "Dopodomani"
                        ? "bg-purple-100 border border-purple-300"
                        : isPast
                        ? "bg-gray-100 border border-gray-300"
                        : "bg-amber-50 border border-amber-200"
                    }`}>
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        group.label === "Oggi" 
                          ? "bg-green-500 text-white" 
                          : group.label === "Domani"
                          ? "bg-blue-500 text-white"
                          : group.label === "Dopodomani"
                          ? "bg-purple-500 text-white"
                          : isPast
                          ? "bg-gray-400 text-white"
                          : "bg-amber-500 text-white"
                      }`}>
                        <Calendar className="w-5 h-5" />
                      </div>
                      <div className="flex-1">
                        <h3 className={`text-lg font-bold capitalize ${
                          group.label === "Oggi" 
                            ? "text-green-800" 
                            : group.label === "Domani"
                            ? "text-blue-800"
                            : group.label === "Dopodomani"
                            ? "text-purple-800"
                            : isPast
                            ? "text-gray-600"
                            : "text-amber-800"
                        }`}>
                          {group.label}
                        </h3>
                        <p className="text-sm text-gray-600">
                          {group.bookings.length} {group.bookings.length === 1 ? "shooting" : "shooting"}
                        </p>
                      </div>
                      {group.label === "Oggi" && (
                        <Badge className="bg-green-500 text-white animate-pulse flex items-center gap-1">
                          <Camera className="h-3 w-3" />
                          In programma
                        </Badge>
                      )}
                    </div>

                    {/* Card delle prenotazioni del giorno */}
                    <div className="grid gap-3 pl-2 border-l-2 border-gray-200 ml-5">
                      {group.bookings.map((booking, index) => {
                        const cardColors = [
                          { border: "border-l-4 border-l-blue-500", bg: "bg-blue-50/30" },
                          { border: "border-l-4 border-l-green-500", bg: "bg-green-50/30" },
                          { border: "border-l-4 border-l-purple-500", bg: "bg-purple-50/30" },
                          { border: "border-l-4 border-l-orange-500", bg: "bg-orange-50/30" },
                          { border: "border-l-4 border-l-pink-500", bg: "bg-pink-50/30" },
                          { border: "border-l-4 border-l-teal-500", bg: "bg-teal-50/30" },
                        ];
                        const colorClass = cardColors[index % cardColors.length];
                        const isApproved = booking.stato === "confermata" || booking.stato === "completata";

                        const isHighlighted = highlightedId === booking.id;

                        return (
                          <Card
                            key={booking.id}
                            ref={(el) => {
                              bookingRefs.current[booking.id] = el;
                            }}
                            className={`hover:shadow-lg transition-all ${colorClass.border} ${colorClass.bg} ${isHighlighted ? "ring-4 ring-blue-500 ring-offset-2 shadow-2xl" : ""}`}
                          >
                    <CardContent className="p-4 md:p-6">
                      <div className="flex justify-between items-start gap-6">
                        {/* Info prenotazione */}
                        <div className="flex-1 space-y-3">
                          {/* Intestazione */}
                          <div className="flex items-center justify-between">
                            <div>
                              <h3 className="text-lg font-bold font-playfair text-blue-gray flex items-center gap-2">
                                {booking.cliente.nome} {booking.cliente.cognome}
                                {booking.isManual && (
                                  <Badge
                                    variant="outline"
                                    className="bg-purple-50 text-purple-700 border-purple-200 text-xs"
                                  >
                                    👤 Walk-in
                                  </Badge>
                                )}
                              </h3>
                              <p className="text-sm text-gray-600">
                                {getCampaignName(booking.campaignId)}
                              </p>
                            </div>
                            {getStatoBadge(booking.stato)}
                          </div>

                          {/* Dettagli */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                            <div className="flex items-center gap-2 text-gray-700">
                              <Calendar className="w-4 h-4 text-sage" />
                              <span>
                                {formatDateTime(booking.dataShootingInizio)}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-gray-700">
                              <Clock className="w-4 h-4 text-sage" />
                              <span>
                                {formatTime(booking.dataShootingInizio)} -{" "}
                                {formatTime(booking.dataShootingFine)}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-gray-700">
                              <Mail className="w-4 h-4 text-sage" />
                              <a
                                href={`mailto:${booking.cliente.email}`}
                                className="hover:underline"
                              >
                                {booking.cliente.email}
                              </a>
                            </div>
                            <div className="flex items-center gap-2 text-gray-700">
                              <Phone className="w-4 h-4 text-sage" />
                              <a
                                href={`https://wa.me/${formatPhoneForWhatsApp(booking.cliente.whatsapp)}`}
                                className="hover:underline"
                              >
                                {booking.cliente.whatsapp}
                              </a>
                            </div>
                          </div>

                          {/* Prodotti (Multi-product o singolo) - Versione Collapsabile */}
                          {(() => {
                            const associatedOrder = getOrderByBookingId(
                              booking.id,
                            );
                            const isExpanded =
                              expandedProducts[booking.id] || false;

                            // Se esiste un ordine con prodotti multipli
                            if (
                              associatedOrder &&
                              associatedOrder.prodotti &&
                              associatedOrder.prodotti.length > 0
                            ) {
                              return (
                                <div className="bg-blue-50 border border-blue-200 rounded-lg overflow-hidden">
                                  <button
                                    onClick={() =>
                                      setExpandedProducts((prev) => ({
                                        ...prev,
                                        [booking.id]: !prev[booking.id],
                                      }))
                                    }
                                    className="w-full p-3 flex items-center justify-between hover:bg-blue-100 transition-colors"
                                  >
                                    <p className="text-sm font-semibold text-blue-900 flex items-center gap-2">
                                      <Package className="w-4 h-4" />
                                      Prodotti (
                                      {associatedOrder.prodotti.length})
                                    </p>
                                    <svg
                                      className={`w-5 h-5 text-blue-700 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M19 9l-7 7-7-7"
                                      />
                                    </svg>
                                  </button>
                                  {isExpanded && (
                                    <div className="px-3 pb-3 space-y-1.5">
                                      {associatedOrder.prodotti.map(
                                        (prodotto, idx) => {
                                          const isBundle = prodotto.isBundle && prodotto.bundleItems && prodotto.bundleItems.length > 0;
                                          const totalPhotos = isBundle && prodotto.bundleItems
                                            ? prodotto.bundleItems.reduce((sum: number, bi: any) => sum + (bi.numeroFoto || 0) * (bi.quantita || 1), 0)
                                            : prodotto.prodottoNumeroFoto || 0;
                                          
                                          return (
                                          <div key={idx}>
                                          <div
                                            className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 bg-white p-2 rounded border border-blue-100 text-sm"
                                          >
                                            <div className="flex items-center gap-2">
                                              <span className="font-medium text-gray-800">
                                                {prodotto.prodottoNome}
                                              </span>
                                              {isBundle && (
                                                <Badge
                                                  variant="outline"
                                                  className="bg-amber-50 text-amber-700 border-amber-200 text-xs"
                                                >
                                                  📦 Bundle
                                                </Badge>
                                              )}
                                              {!prodotto.prodottoId && !isBundle && (
                                                <Badge
                                                  variant="outline"
                                                  className="bg-purple-50 text-purple-700 border-purple-200 text-xs"
                                                >
                                                  Custom
                                                </Badge>
                                              )}
                                            </div>
                                            <div className="flex items-center gap-3 text-xs text-gray-600">
                                              {totalPhotos > 0 && (
                                                <span className="flex items-center gap-1">
                                                  <ImageIcon className="w-3 h-3" />
                                                  {totalPhotos}{" "}
                                                  foto
                                                </span>
                                              )}
                                              <span className="font-semibold text-sage">
                                                €
                                                {prodotto.prodottoPrezzo.toFixed(
                                                  2,
                                                )}
                                              </span>
                                            </div>
                                          </div>
                                          {isBundle && prodotto.bundleItems && (
                                            <div className="ml-4 mt-1 pl-2 border-l-2 border-amber-200 space-y-1">
                                              {prodotto.bundleItems.map((item: any, itemIdx: number) => (
                                                <div key={itemIdx} className="text-xs text-gray-600 flex items-center justify-between">
                                                  <span>└ {item.prodottoNome}{item.quantita > 1 ? ` x${item.quantita}` : ''}</span>
                                                  {item.numeroFoto > 0 && (
                                                    <span className="text-gray-400">({item.numeroFoto * item.quantita} foto)</span>
                                                  )}
                                                </div>
                                              ))}
                                            </div>
                                          )}
                                          </div>
                                        )},
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            }

                            // Fallback: prodotto singolo legacy (senza ordine)
                            if (booking.prodottoNome) {
                              // Cerca il prodotto dalla lista per mostrare bundleItems se è un bundle
                              const bookingProduct = booking.prodottoId 
                                ? products.find(p => p.id === booking.prodottoId) 
                                : null;
                              const isBundle = bookingProduct?.isBundle && bookingProduct?.bundleItems && bookingProduct.bundleItems.length > 0;
                              const totalPhotos = isBundle && bookingProduct?.bundleItems
                                ? bookingProduct.bundleItems.reduce((sum, bi) => sum + (bi.numeroFoto || 0) * (bi.quantita || 1), 0)
                                : bookingProduct?.numeroFoto || 0;
                              
                              return (
                                <div className="space-y-1">
                                  <div className="flex items-center justify-between gap-2 text-gray-700 text-sm">
                                    <div className="flex items-center gap-2">
                                      <Package className="w-4 h-4 text-sage" />
                                      <span className="font-medium">{booking.prodottoNome}</span>
                                      {isBundle && (
                                        <Badge
                                          variant="outline"
                                          className="bg-amber-50 text-amber-700 border-amber-200 text-xs"
                                        >
                                          📦 Bundle
                                        </Badge>
                                      )}
                                    </div>
                                    {totalPhotos > 0 && (
                                      <span className="text-xs text-gray-500 flex items-center gap-1">
                                        <ImageIcon className="w-3 h-3" />
                                        {totalPhotos} foto
                                      </span>
                                    )}
                                  </div>
                                  {/* Mostra prodotti inclusi nel bundle */}
                                  {isBundle && bookingProduct?.bundleItems && (
                                    <div className="ml-6 pl-2 border-l-2 border-amber-200 space-y-1">
                                      {bookingProduct.bundleItems.map((item, itemIdx) => (
                                        <div key={itemIdx} className="text-xs text-gray-600 flex items-center justify-between">
                                          <span>└ {item.prodottoNome}{item.quantita > 1 ? ` x${item.quantita}` : ''}</span>
                                          {item.numeroFoto > 0 && (
                                            <span className="text-gray-400">({item.numeroFoto * item.quantita} foto)</span>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            }

                            return null;
                          })()}

                          {/* Note */}
                          {booking.note && (
                            <div className="bg-gray-50 p-3 rounded-lg">
                              <p className="text-sm text-gray-700">
                                <strong>Note:</strong> {booking.note}
                              </p>
                            </div>
                          )}

                          {/* Gallerie Collegate */}
                          {(() => {
                            const galleries = getGalleriesByBookingId(
                              booking.id,
                            );
                            if (galleries.length === 0) return null;

                            return (
                              <div className="bg-purple-50 border border-purple-200 p-3 rounded-lg space-y-2">
                                <p className="text-sm font-semibold text-purple-900 flex items-center gap-2">
                                  <ImageIcon className="w-4 h-4" />
                                  Gallerie Collegate ({galleries.length})
                                </p>
                                <div className="space-y-1.5">
                                  {galleries.map((gallery) => (
                                    <div
                                      key={gallery.id}
                                      className="flex items-center justify-between gap-2 bg-white p-2 rounded border border-purple-100"
                                    >
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                          <a
                                            href={`/gallery/${gallery.code}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-sm font-medium text-purple-700 hover:text-purple-900 hover:underline truncate"
                                            data-testid={`link-gallery-${gallery.code}`}
                                          >
                                            {gallery.name}
                                          </a>
                                          {gallery.selectionStatus ===
                                            "completed" && (
                                            <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs shrink-0">
                                              ✓ Selezione OK
                                            </Badge>
                                          )}
                                        </div>
                                        <p className="text-xs text-gray-500 font-mono">
                                          Codice: {gallery.code}
                                        </p>
                                      </div>
                                      <ShareGalleryButton
                                        galleryCode={gallery.code}
                                        galleryName={gallery.name}
                                        clientPhone={booking.cliente?.whatsapp}
                                        clientName={`${booking.cliente?.nome || ''} ${booking.cliente?.cognome || ''}`.trim()}
                                      />
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })()}

                          {/* Email status */}
                          <div className="flex gap-2">
                            {booking.emailRicevutaInviata && (
                              <Badge
                                variant="outline"
                                className="text-xs bg-blue-50 text-blue-700 border-blue-200"
                              >
                                ✉️ Email ricevuta inviata
                              </Badge>
                            )}
                            {booking.emailConfermataInviata && (
                              <Badge
                                variant="outline"
                                className="text-xs bg-green-50 text-green-700 border-green-200"
                              >
                                ✉️ Email conferma inviata
                              </Badge>
                            )}
                          </div>
                        </div>

                        {/* Azioni */}
                        <div className="flex flex-col gap-2 min-w-[180px]">
                          {/* Badge NUOVA se non ancora visualizzata */}
                          {!booking.dataVisualizzazione && (
                            <Badge className="bg-red-500 text-white hover:bg-red-600 animate-pulse justify-center">
                              🔔 NUOVA
                            </Badge>
                          )}

                          {/* Badge Ordine/Galleria Creati - SOLO SE APPROVATA */}
                          {isApproved && getOrderByBookingId(booking.id) && (
                            <Badge
                              className="bg-green-50 text-green-700 border-green-200"
                              variant="outline"
                            >
                              <ShoppingCart className="w-3 h-3 mr-1" />
                              Ordine Creato
                            </Badge>
                          )}

                          {isApproved && getGalleryByBookingId(booking.id) && (
                            <Badge
                              className="bg-purple-50 text-purple-700 border-purple-200"
                              variant="outline"
                            >
                              <ImageIcon className="w-3 h-3 mr-1" />
                              Galleria Creata
                            </Badge>
                          )}

                          {/* Badge Selezione Completata - SOLO SE APPROVATA */}
                          {isApproved &&
                            (() => {
                              const gallery = getGalleryByBookingId(booking.id);
                              return (
                                gallery &&
                                gallery.selectionStatus === "completed" && (
                                  <Badge
                                    className="bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold"
                                    variant="outline"
                                  >
                                    ✓ Selezione Completata
                                  </Badge>
                                )
                              );
                            })()}

                          {/* Pulsante Dettagli - Sempre Visibile */}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenDetails(booking)}
                            data-testid={`button-view-${booking.id}`}
                            className="w-full h-12"
                          >
                            <Eye className="w-4 h-4 mr-1" />
                            Dettagli
                          </Button>

                          {/* Azioni con icone e tooltip */}
                          <TooltipProvider>
                            <div className="flex items-center gap-2 w-full">
                              {/* Pulsante Ordine */}
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant={getOrderByBookingId(booking.id) && expandedOrders[booking.id] ? "default" : "outline"}
                                    size="icon"
                                    disabled={!isApproved}
                                    onClick={() => {
                                      const order = getOrderByBookingId(booking.id);
                                      if (!order) {
                                        setSelectedBookingForOrder(booking);
                                      } else {
                                        toggleOrderExpansion(booking.id);
                                      }
                                    }}
                                    data-testid={`button-order-${booking.id}`}
                                    className={`h-10 w-10 ${getOrderByBookingId(booking.id) && expandedOrders[booking.id] ? 'bg-sage text-white' : ''}`}
                                  >
                                    {!getOrderByBookingId(booking.id) ? (
                                      <Plus className="w-4 h-4" />
                                    ) : expandedOrders[booking.id] ? (
                                      <ChevronUp className="w-4 h-4" />
                                    ) : (
                                      <Receipt className="w-4 h-4" />
                                    )}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>
                                    {!getOrderByBookingId(booking.id)
                                      ? "Crea Ordine"
                                      : expandedOrders[booking.id]
                                        ? "Chiudi Ordine"
                                        : "Gestisci Ordine"}
                                  </p>
                                </TooltipContent>
                              </Tooltip>

                              {/* Pulsante Galleria - Gestisci */}
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="outline"
                                    size="icon"
                                    disabled={!isApproved}
                                    onClick={async () => {
                                      const gallery = getGalleryByBookingId(
                                        booking.id,
                                      );
                                      if (!gallery) {
                                        // Risolvi clienteId PRIMA di aprire il modal
                                        setIsResolvingCliente(true);
                                        let resolvedId: string | undefined = undefined;
                                        
                                        if (booking.clienteId) {
                                          resolvedId = booking.clienteId;
                                        } else {
                                          const email = booking.cliente?.email;
                                          if (email) {
                                            try {
                                              const cliente = await getClienteByEmail(email);
                                              if (cliente) {
                                                console.log(`🔍 Cliente trovato per email ${email}: ${cliente.id}`);
                                                resolvedId = cliente.id;
                                              }
                                            } catch (error) {
                                              console.error('Errore ricerca cliente per email:', error);
                                            }
                                          }
                                        }
                                        
                                        setResolvedClienteId(resolvedId);
                                        setSelectedBookingForGallery(booking);
                                        setIsResolvingCliente(false);
                                      } else {
                                        window.open(`/admin/gallery/${gallery.id}/manage`, '_blank');
                                      }
                                    }}
                                    data-testid={`button-gallery-${booking.id}`}
                                    className="h-10 w-10"
                                  >
                                    {!getGalleryByBookingId(booking.id) ? (
                                      <Plus className="w-4 h-4" />
                                    ) : (
                                      <ImageIcon className="w-4 h-4" />
                                    )}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>
                                    {!getGalleryByBookingId(booking.id)
                                      ? "Crea Galleria"
                                      : "Gestisci Galleria"}
                                  </p>
                                </TooltipContent>
                              </Tooltip>

                              {/* Pulsante Galleria - Visualizza (come cliente) */}
                              {getGalleryByBookingId(booking.id) && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="outline"
                                      size="icon"
                                      onClick={() => {
                                        const gallery = getGalleryByBookingId(booking.id);
                                        if (gallery) {
                                          window.open(`/gallery/${gallery.code}`, '_blank');
                                        }
                                      }}
                                      data-testid={`button-view-gallery-${booking.id}`}
                                      className="h-10 w-10 text-sage hover:bg-sage/10"
                                    >
                                      <Eye className="w-4 h-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Visualizza Galleria</p>
                                  </TooltipContent>
                                </Tooltip>
                              )}

                              {/* Pulsante Elimina */}
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="outline"
                                    size="icon"
                                    disabled={false}
                                    onClick={() =>
                                      handleRequestCascadeDelete(booking.id)
                                    }
                                    className="text-destructive hover:bg-destructive/10 h-10 w-10"
                                    data-testid={`button-delete-${booking.id}`}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Elimina Prenotazione</p>
                                </TooltipContent>
                              </Tooltip>
                            </div>
                          </TooltipProvider>

                          {/* Pulsanti Approva/Rifiuta - Solo se in_attesa */}
                          {booking.stato === "in_attesa" && (
                            <div className="grid grid-cols-2 gap-2 w-full">
                              <Button
                                size="sm"
                                onClick={() =>
                                  approveMutation.mutate(booking.id)
                                }
                                disabled={
                                  approveMutation.isPending ||
                                  rejectMutation.isPending
                                }
                                className="bg-sage hover:bg-dark-sage h-12"
                                data-testid={`button-approve-${booking.id}`}
                              >
                                {approveMutation.isPending ? (
                                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                                ) : (
                                  <CheckCircle className="w-4 h-4 mr-1" />
                                )}
                                Approva
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  rejectMutation.mutate(booking.id)
                                }
                                disabled={
                                  approveMutation.isPending ||
                                  rejectMutation.isPending
                                }
                                className="border-red-200 text-red-600 hover:bg-red-50 h-12"
                                data-testid={`button-reject-${booking.id}`}
                              >
                                {rejectMutation.isPending ? (
                                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                                ) : (
                                  <XCircle className="w-4 h-4 mr-1" />
                                )}
                                Rifiuta
                              </Button>
                            </div>
                          )}

                          {/* Workflow State Dropdown - Solo per booking confermati */}
                          {isApproved && (
                            <div className="w-full pt-2 border-t border-gray-200">
                              <Label className="text-xs text-gray-600 mb-1 block">
                                Stato Workflow
                              </Label>
                              <Select
                                value={booking.statoWorkflow || undefined}
                                onValueChange={(value) =>
                                  handleWorkflowStateChange(booking, value)
                                }
                                data-testid={`select-workflow-${booking.id}`}
                              >
                                <SelectTrigger className="w-full h-12 text-sm">
                                  <SelectValue placeholder="- Imposta stato -" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem
                                    value={WorkflowState.SHOOTING_DA_SVOLGERE}
                                  >
                                    <span className="flex items-center gap-2">
                                      <Camera className="h-4 w-4" />
                                      Shooting da svolgere
                                    </span>
                                  </SelectItem>
                                  <SelectItem
                                    value={WorkflowState.SHOOTING_COMPLETATO}
                                  >
                                    <span className="flex items-center gap-2">
                                      <CheckCircle2 className="h-4 w-4" />
                                      Shooting completato
                                    </span>
                                  </SelectItem>
                                  <SelectItem
                                    value={WorkflowState.IN_LAVORAZIONE}
                                  >
                                    <span className="flex items-center gap-2">
                                      <Palette className="h-4 w-4" />
                                      In lavorazione
                                    </span>
                                  </SelectItem>
                                  <SelectItem
                                    value={WorkflowState.IN_ATTESA_SELEZIONE}
                                  >
                                    <span className="flex items-center gap-2">
                                      <Timer className="h-4 w-4" />
                                      In attesa selezione
                                    </span>
                                  </SelectItem>
                                  <SelectItem value={WorkflowState.COMPLETATO}>
                                    <span className="flex items-center gap-2">
                                      <PartyPopper className="h-4 w-4" />
                                      Completato
                                    </span>
                                  </SelectItem>
                                  <SelectItem value={WorkflowState.CONSEGNATO}>
                                    <span className="flex items-center gap-2">
                                      <PackageCheck className="h-4 w-4" />
                                      Consegnato
                                    </span>
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          )}
                        </div>
                      </div>
                      
                      {/* Sezione Ordine Espandibile - Solo se c'è un ordine */}
                      {isApproved && getOrderByBookingId(booking.id) && expandedOrders[booking.id] && (() => {
                        const order = getOrderByBookingId(booking.id)!;
                        const totals = getOrderTotals(order);
                        const isPaidFull = totals.saldoResiduo === 0;
                        const hasPartialPayment = totals.totalePagato > 0 && totals.saldoResiduo > 0;
                        
                        return (
                          <div className="mt-4 pt-4 border-t border-sage/30 bg-sage/5 rounded-lg p-4 animate-in slide-in-from-top-2 duration-200">
                            <div className="flex items-center justify-between mb-3">
                              <h4 className="font-semibold text-sage flex items-center gap-2">
                                <Receipt className="w-4 h-4" />
                                Gestione Ordine
                              </h4>
                              <Badge 
                                variant="outline" 
                                className={isPaidFull 
                                  ? "bg-green-50 text-green-700 border-green-200" 
                                  : hasPartialPayment 
                                    ? "bg-yellow-50 text-yellow-700 border-yellow-200"
                                    : "bg-gray-50 text-gray-600 border-gray-200"
                                }
                              >
                                {isPaidFull ? "✓ Saldato" : hasPartialPayment ? "Acconto Versato" : "Da Pagare"}
                              </Badge>
                            </div>
                            
                            {/* Riepilogo Pagamenti */}
                            <div className="grid grid-cols-3 gap-3 mb-4 text-center">
                              <div className="bg-white rounded-lg p-2 border">
                                <p className="text-xs text-gray-500">Totale</p>
                                <p className="font-bold text-lg">€{totals.totale.toFixed(2)}</p>
                              </div>
                              <div className="bg-white rounded-lg p-2 border">
                                <p className="text-xs text-gray-500">Pagato</p>
                                <p className="font-bold text-lg text-green-600">€{totals.totalePagato.toFixed(2)}</p>
                              </div>
                              <div className="bg-white rounded-lg p-2 border">
                                <p className="text-xs text-gray-500">Saldo</p>
                                <p className={`font-bold text-lg ${totals.saldoResiduo > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                                  €{totals.saldoResiduo.toFixed(2)}
                                </p>
                              </div>
                            </div>
                            
                            {/* Prodotti */}
                            {order.prodotti && order.prodotti.length > 0 && (
                              <div className="mb-4 p-2 bg-white rounded border text-sm">
                                <p className="text-xs text-gray-500 mb-1">Prodotti:</p>
                                {order.prodotti.map((p, idx) => (
                                  <span key={idx} className="inline-block bg-sage/10 text-sage px-2 py-0.5 rounded text-xs mr-1 mb-1">
                                    {p.prodottoNome}{p.quantita > 1 ? ` x${p.quantita}` : ''}
                                  </span>
                                ))}
                              </div>
                            )}
                            
                            {/* Cronologia Pagamenti (se esistono transactions) */}
                            {order.transactions && order.transactions.length > 0 && (
                              <div className="mb-4 p-2 bg-white rounded border">
                                <p className="text-xs text-gray-500 mb-2 flex items-center gap-1">
                                  <History className="w-3 h-3" /> Cronologia Pagamenti
                                </p>
                                <div className="space-y-1">
                                  {order.transactions.map((t, idx) => (
                                    <div key={idx} className="flex justify-between items-center text-xs py-1 border-b last:border-0">
                                      <span className={t.tipo === 'acconto' ? 'text-blue-600' : 'text-green-600'}>
                                        {t.tipo === 'acconto' ? '💳 Acconto' : '✅ Saldo'}
                                      </span>
                                      <span className="font-medium">€{t.importo.toFixed(2)}</span>
                                      <span className="text-gray-400">
                                        {t.data?.toDate ? format(t.data.toDate(), 'dd/MM/yy', { locale: it }) : '-'}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            
                            {/* Pulsanti Azione */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                              {/* Registra Acconto */}
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={isPaidFull}
                                onClick={() => {
                                  setPaymentDialog({ orderId: order.id, tipo: 'acconto', bookingId: booking.id });
                                  setPaymentAmount('');
                                  setPaymentNote('');
                                  setPaymentMethod('contante');
                                }}
                                className="h-10"
                              >
                                <Wallet className="w-4 h-4 mr-1" />
                                Acconto
                              </Button>
                              
                              {/* Registra Saldo */}
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={isPaidFull || totals.saldoResiduo === 0}
                                onClick={() => {
                                  setPaymentDialog({ orderId: order.id, tipo: 'saldo', bookingId: booking.id });
                                  setPaymentNote('');
                                  setPaymentMethod('contante');
                                }}
                                className="h-10"
                              >
                                <Euro className="w-4 h-4 mr-1" />
                                Saldo
                              </Button>
                              
                              {/* Modifica Ordine */}
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setEditingOrder(order)}
                                className="h-10"
                              >
                                <Edit className="w-4 h-4 mr-1" />
                                Modifica
                              </Button>
                              
                              {/* WhatsApp */}
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openWhatsAppForOrder(order, booking)}
                                className="h-10 text-green-600 hover:text-green-700 hover:bg-green-50"
                              >
                                <MessageCircle className="w-4 h-4 mr-1" />
                                WhatsApp
                              </Button>
                            </div>
                          </div>
                        );
                      })()}
                    </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Controlli Paginazione - disabilitati per vista raggruppata per giorno */}
          {false && !isLoading && bookings.length > 0 && totalPages > 1 && (
            <Card className="mt-4">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-600">
                    Pagina <strong>{currentPage}</strong> di{" "}
                    <strong>{totalPages}</strong>
                    <span className="ml-2 text-gray-500">
                      ({paginatedBookings.length} di {bookings.length}{" "}
                      prenotazioni)
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setCurrentPage((prev) => Math.max(1, prev - 1))
                      }
                      disabled={currentPage === 1}
                      data-testid="button-prev-page"
                    >
                      <ChevronLeft className="w-4 h-4 mr-1" />
                      Precedente
                    </Button>

                    {/* Page numbers */}
                    <div className="flex gap-1">
                      {Array.from(
                        { length: Math.min(5, totalPages) },
                        (_, i) => {
                          let pageNum;
                          if (totalPages <= 5) {
                            pageNum = i + 1;
                          } else if (currentPage <= 3) {
                            pageNum = i + 1;
                          } else if (currentPage >= totalPages - 2) {
                            pageNum = totalPages - 4 + i;
                          } else {
                            pageNum = currentPage - 2 + i;
                          }

                          return (
                            <Button
                              key={pageNum}
                              variant={
                                currentPage === pageNum ? "default" : "outline"
                              }
                              size="sm"
                              onClick={() => setCurrentPage(pageNum)}
                              className={
                                currentPage === pageNum
                                  ? "bg-sage hover:bg-dark-sage"
                                  : ""
                              }
                              data-testid={`button-page-${pageNum}`}
                            >
                              {pageNum}
                            </Button>
                          );
                        },
                      )}
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setCurrentPage((prev) => Math.min(totalPages, prev + 1))
                      }
                      disabled={currentPage === totalPages}
                      data-testid="button-next-page"
                    >
                      Successiva
                      <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Dialog dettagli prenotazione */}
          <Dialog
            open={!!selectedBooking}
            onOpenChange={() => setSelectedBooking(null)}
          >
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="font-playfair text-2xl">
                  Dettagli Prenotazione
                </DialogTitle>
                <DialogDescription>
                  Gestisci lo stato e visualizza tutti i dettagli
                </DialogDescription>
              </DialogHeader>

              {selectedBooking && (
                <div className="space-y-6 py-4">
                  {/* Stato corrente */}
                  <div>
                    <Label className="text-sm font-medium">Stato Attuale</Label>
                    <div className="mt-2">
                      {getStatoBadge(selectedBooking.stato)}
                    </div>
                  </div>

                  {/* Cambia stato */}
                  <div>
                    <Label className="text-sm font-medium mb-2 block">
                      Cambia Stato
                    </Label>
                    <Select
                      value={selectedBooking.stato}
                      onValueChange={(value) =>
                        changeStatusMutation.mutate({
                          id: selectedBooking.id,
                          stato: value,
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent position="popper" sideOffset={4} className="z-[9999]">
                        <SelectItem value="in_attesa">In Attesa</SelectItem>
                        <SelectItem value="confermata">Confermata</SelectItem>
                        <SelectItem value="completata">Completata</SelectItem>
                        <SelectItem value="annullata">Annullata</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Info cliente */}
                  <div className="space-y-3">
                    <h4 className="font-semibold text-blue-gray">
                      Informazioni Cliente
                    </h4>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-600">Nome:</span>
                        <p className="font-medium">
                          {selectedBooking.cliente.nome}{" "}
                          {selectedBooking.cliente.cognome}
                        </p>
                      </div>
                      <div>
                        <span className="text-gray-600">Email:</span>
                        <p className="font-medium">
                          {selectedBooking.cliente.email}
                        </p>
                      </div>
                      <div>
                        <span className="text-gray-600">WhatsApp:</span>
                        <p className="font-medium">
                          {selectedBooking.cliente.whatsapp}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Info prenotazione */}
                  <div className="space-y-3">
                    <h4 className="font-semibold text-blue-gray">
                      Dettagli Prenotazione
                    </h4>
                    <div className="space-y-2 text-sm">
                      <div>
                        <span className="text-gray-600">Campagna:</span>
                        <p className="font-medium">
                          {getCampaignName(selectedBooking.campaignId)}
                        </p>
                      </div>
                      <div>
                        <span className="text-gray-600">Data e Ora:</span>
                        <p className="font-medium">
                          {formatDateTime(selectedBooking.dataShootingInizio)}
                        </p>
                      </div>
                      <div>
                        <span className="text-gray-600">Orario:</span>
                        <p className="font-medium">
                          {formatTime(selectedBooking.dataShootingInizio)} -{" "}
                          {formatTime(selectedBooking.dataShootingFine)}
                        </p>
                      </div>

                      {/* Prodotti (Multi-product o singolo) - Versione Collapsabile nel Dialog */}
                      {(() => {
                        const associatedOrder = getOrderByBookingId(
                          selectedBooking.id,
                        );
                        const isExpanded =
                          expandedProducts[`dialog-${selectedBooking.id}`] ||
                          false;

                        // Se esiste un ordine con prodotti multipli
                        if (
                          associatedOrder &&
                          associatedOrder.prodotti &&
                          associatedOrder.prodotti.length > 0
                        ) {
                          return (
                            <div className="bg-blue-50 border border-blue-200 rounded-lg overflow-hidden">
                              <button
                                onClick={() =>
                                  setExpandedProducts((prev) => ({
                                    ...prev,
                                    [`dialog-${selectedBooking.id}`]:
                                      !prev[`dialog-${selectedBooking.id}`],
                                  }))
                                }
                                className="w-full p-3 flex items-center justify-between hover:bg-blue-100 transition-colors"
                              >
                                <span className="text-sm font-semibold text-blue-900 flex items-center gap-2">
                                  <Package className="w-4 h-4" />
                                  Prodotti ({associatedOrder.prodotti.length})
                                </span>
                                <svg
                                  className={`w-5 h-5 text-blue-700 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M19 9l-7 7-7-7"
                                  />
                                </svg>
                              </button>
                              {isExpanded && (
                                <div className="px-3 pb-3 space-y-2">
                                  {associatedOrder.prodotti.map(
                                    (prodotto, idx) => {
                                      const isBundle = prodotto.isBundle && prodotto.bundleItems && prodotto.bundleItems.length > 0;
                                      const totalPhotos = isBundle && prodotto.bundleItems
                                        ? prodotto.bundleItems.reduce((sum, bi) => sum + (bi.numeroFoto || 0) * (bi.quantita || 1), 0)
                                        : prodotto.prodottoNumeroFoto || 0;
                                      
                                      return (
                                        <div
                                          key={idx}
                                          className="bg-white border border-blue-100 p-3 rounded-lg"
                                        >
                                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                            <div className="flex items-center gap-2">
                                              <Package className="w-4 h-4 text-sage" />
                                              <span className="font-medium text-gray-800">
                                                {prodotto.prodottoNome}
                                              </span>
                                              {isBundle && (
                                                <Badge
                                                  variant="outline"
                                                  className="bg-amber-50 text-amber-700 border-amber-200 text-xs"
                                                >
                                                  📦 Bundle
                                                </Badge>
                                              )}
                                              {!prodotto.prodottoId && (
                                                <Badge
                                                  variant="outline"
                                                  className="bg-purple-50 text-purple-700 border-purple-200 text-xs"
                                                >
                                                  Custom
                                                </Badge>
                                              )}
                                            </div>
                                            <div className="flex items-center gap-3 text-xs text-gray-600">
                                              {totalPhotos > 0 && (
                                                <span className="flex items-center gap-1">
                                                  <ImageIcon className="w-3 h-3" />
                                                  {totalPhotos} foto
                                                </span>
                                              )}
                                              <span className="font-semibold text-sage">
                                                €{prodotto.prodottoPrezzo.toFixed(2)}
                                              </span>
                                            </div>
                                          </div>
                                          {isBundle && prodotto.bundleItems && (
                                            <div className="mt-2 pl-6 space-y-1 border-l-2 border-amber-200">
                                              {prodotto.bundleItems.map((item, itemIdx) => (
                                                <div key={itemIdx} className="flex items-center justify-between text-xs text-gray-600">
                                                  <span className="flex items-center gap-1">
                                                    <span className="text-amber-500">└</span>
                                                    {item.prodottoNome}
                                                    {item.quantita > 1 && <span className="text-gray-400 ml-1">x{item.quantita}</span>}
                                                  </span>
                                                  {item.numeroFoto > 0 && (
                                                    <span className="text-gray-500">
                                                      {item.numeroFoto * item.quantita} foto
                                                    </span>
                                                  )}
                                                </div>
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                      );
                                    },
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        }

                        // Fallback: prodotto singolo legacy
                        if (selectedBooking.prodottoNome) {
                          return (
                            <div>
                              <span className="text-gray-600">Prodotto:</span>
                              <p className="font-medium">
                                {selectedBooking.prodottoNome}
                              </p>
                            </div>
                          );
                        }

                        return null;
                      })()}

                      {selectedBooking.note && (
                        <div>
                          <span className="text-gray-600">Note:</span>
                          <p className="font-medium">{selectedBooking.note}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Azioni rapide */}
                  {selectedBooking.stato === "in_attesa" && (
                    <Alert className="bg-yellow-50 border-yellow-200">
                      <AlertCircle className="w-4 h-4 text-yellow-600" />
                      <AlertDescription className="text-yellow-800">
                        Questa prenotazione è in attesa di approvazione. Clicca
                        su "Approva Ora" per confermare e inviare l'email al
                        cliente.
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              )}

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (selectedBooking) {
                      handleOpenEdit(selectedBooking);
                      setSelectedBooking(null);
                    }
                  }}
                  data-testid="button-edit-booking"
                >
                  ✏️ Modifica Dati
                </Button>
                {selectedBooking?.stato === "in_attesa" && (
                  <>
                    <Button
                      onClick={() => approveMutation.mutate(selectedBooking.id)}
                      disabled={
                        approveMutation.isPending || rejectMutation.isPending
                      }
                      className="bg-sage hover:bg-dark-sage"
                    >
                      {approveMutation.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Approvazione...
                        </>
                      ) : (
                        <>
                          <CheckCircle className="w-4 h-4 mr-2" />
                          Approva Ora
                        </>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => rejectMutation.mutate(selectedBooking.id)}
                      disabled={
                        approveMutation.isPending || rejectMutation.isPending
                      }
                      className="border-red-200 text-red-600 hover:bg-red-50"
                      data-testid="button-reject-booking-detail"
                    >
                      {rejectMutation.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Rifiuto...
                        </>
                      ) : (
                        <>
                          <XCircle className="w-4 h-4 mr-2" />
                          Rifiuta
                        </>
                      )}
                    </Button>
                  </>
                )}
                <Button
                  variant="outline"
                  onClick={() => setSelectedBooking(null)}
                >
                  Chiudi
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Dialog conferma eliminazione */}
          <Dialog
            open={!!deleteConfirmId}
            onOpenChange={() => setDeleteConfirmId(null)}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Conferma Eliminazione</DialogTitle>
                <DialogDescription>
                  Sei sicuro di voler eliminare questa prenotazione? Questa
                  azione è irreversibile.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setDeleteConfirmId(null)}
                >
                  Annulla
                </Button>
                <Button
                  variant="destructive"
                  onClick={() =>
                    deleteConfirmId && deleteMutation.mutate(deleteConfirmId)
                  }
                  disabled={deleteMutation.isPending}
                >
                  {deleteMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4 mr-2" />
                  )}
                  Elimina
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Dialog modifica prenotazione */}
          <Dialog
            open={!!editBooking}
            onOpenChange={() => setEditBooking(null)}
          >
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="font-playfair text-2xl">
                  ✏️ Modifica Prenotazione
                </DialogTitle>
                <DialogDescription>
                  Modifica i dati della prenotazione. Se cambi l'email, verrà
                  inviata una notifica al cliente.
                </DialogDescription>
              </DialogHeader>

              {editBooking && (
                <div className="space-y-4 py-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="edit-nome">Nome *</Label>
                      <Input
                        id="edit-nome"
                        value={editNome}
                        onChange={(e) => setEditNome(e.target.value)}
                        placeholder="Nome cliente"
                        data-testid="input-edit-nome"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-cognome">Cognome *</Label>
                      <Input
                        id="edit-cognome"
                        value={editCognome}
                        onChange={(e) => setEditCognome(e.target.value)}
                        placeholder="Cognome cliente"
                        data-testid="input-edit-cognome"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="edit-email">Email *</Label>
                    <Input
                      id="edit-email"
                      type="email"
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                      placeholder="email@esempio.com"
                      data-testid="input-edit-email"
                    />
                    {editEmail !== editBooking.cliente.email && (
                      <Alert className="bg-orange-50 border-orange-200">
                        <AlertCircle className="w-4 h-4 text-orange-600" />
                        <AlertDescription className="text-orange-800 text-sm">
                          📧 <strong>Attenzione:</strong> Stai modificando
                          l'email. Verrà inviata automaticamente una notifica al
                          cliente al nuovo indirizzo.
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="edit-whatsapp">WhatsApp *</Label>
                    <Input
                      id="edit-whatsapp"
                      value={editWhatsapp}
                      onChange={(e) => setEditWhatsapp(e.target.value)}
                      placeholder="+39 XXX XXX XXXX"
                      data-testid="input-edit-whatsapp"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="edit-note">Note</Label>
                    <Input
                      id="edit-note"
                      value={editNote}
                      onChange={(e) => setEditNote(e.target.value)}
                      placeholder="Note aggiuntive (opzionale)"
                      data-testid="input-edit-note"
                    />
                  </div>

                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <p className="text-sm text-blue-800">
                      ℹ️ <strong>Info:</strong> I campi marcati con * sono
                      obbligatori. Le modifiche verranno salvate immediatamente.
                    </p>
                  </div>
                </div>
              )}

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setEditBooking(null)}
                  disabled={updateBookingMutation.isPending}
                >
                  Annulla
                </Button>
                <Button
                  onClick={handleSaveEdit}
                  disabled={updateBookingMutation.isPending}
                  className="bg-sage hover:bg-dark-sage"
                  data-testid="button-save-edit"
                >
                  {updateBookingMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Salvataggio...
                    </>
                  ) : (
                    <>✓ Salva Modifiche</>
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Dialog creazione ordine da booking */}
          {selectedBookingForOrder && (
            <CreateOrderDialog
              booking={selectedBookingForOrder}
              products={products}
              categories={productCategories}
              campaigns={campaigns}
              onClose={() => setSelectedBookingForOrder(null)}
              onSubmit={(orderData) => createOrderMutation.mutate(orderData)}
              isPending={createOrderMutation.isPending}
            />
          )}

          {/* Dialog creazione galleria da booking */}
          {selectedBookingForGallery && !isResolvingCliente &&
            (() => {
              const campaign = campaigns.find(
                (c) => c.id === selectedBookingForGallery.campaignId,
              );
              const associatedOrder = getOrderByBookingId(
                selectedBookingForGallery.id,
              );

              // Se esiste un ordine con multipli prodotti, usa availableProducts
              // Altrimenti usa il vecchio comportamento (prodottoId singolo)
              const prePopulateData: any = {
                name: campaign
                  ? `${selectedBookingForGallery.cliente.nome} ${selectedBookingForGallery.cliente.cognome} - ${campaign.nome}`
                  : `${selectedBookingForGallery.cliente.nome} ${selectedBookingForGallery.cliente.cognome}`,
                date: formatDateForInput(
                  selectedBookingForGallery.dataShootingInizio,
                ),
                specialTheme: campaign?.temaStagionale || undefined,
                bookingId: selectedBookingForGallery.id,
                clienteId: resolvedClienteId, // Client association resolved from booking.clienteId or email lookup
                clienteEmail: selectedBookingForGallery.cliente.email,
                clienteNome: `${selectedBookingForGallery.cliente.nome} ${selectedBookingForGallery.cliente.cognome}`,
              };

              if (
                associatedOrder &&
                associatedOrder.prodotti &&
                associatedOrder.prodotti.length > 0
              ) {
                // Ordine con multipli prodotti - usa availableProducts
                // BUNDLE SUPPORT: Espandi bundle nei loro componenti
                const expandedProducts: Array<{
                  prodottoId?: string;
                  prodottoNome: string;
                  prodottoNumeroFoto?: number;
                  isFromBundle?: boolean;
                  bundleParentName?: string;
                }> = [];
                
                // Guard: check if products are loaded
                if (products.length === 0) {
                  console.warn('⚠️ Products not loaded yet, cannot expand bundles properly');
                }
                
                for (const orderItem of associatedOrder.prodotti) {
                  // Get order item quantity (default to 1)
                  const orderItemQuantity = orderItem.quantita || 1;
                  
                  // PRIORITY: Usa orderItem.isBundle e orderItem.bundleItems come sorgente principale
                  // Fallback al catalogo products solo se orderItem non ha bundleItems
                  const hasOrderItemBundle = orderItem.isBundle && orderItem.bundleItems && orderItem.bundleItems.length > 0;
                  const fullProduct = products.find(p => p.id === orderItem.prodottoId);
                  const hasCatalogBundle = fullProduct?.isBundle && fullProduct.bundleItems && fullProduct.bundleItems.length > 0;
                  
                  // Usa bundleItems dall'orderItem se presenti, altrimenti dal catalogo
                  const bundleItems = hasOrderItemBundle 
                    ? orderItem.bundleItems 
                    : (hasCatalogBundle ? fullProduct!.bundleItems : null);
                  const bundleParentName = orderItem.prodottoNome || fullProduct?.nome || 'Bundle';
                  
                  if (bundleItems && bundleItems.length > 0) {
                    // Expand bundle items (multiplied by order item quantity)
                    for (let orderQty = 0; orderQty < orderItemQuantity; orderQty++) {
                      for (const bundleItem of bundleItems) {
                        // Validate bundleItem - allow numeroFoto = 0 (unlimited selection)
                        if (!bundleItem.quantita || bundleItem.quantita <= 0) continue;
                        if (bundleItem.numeroFoto === undefined || bundleItem.numeroFoto < 0) continue;
                        
                        for (let i = 0; i < bundleItem.quantita; i++) {
                          const bundlePrefix = orderItemQuantity > 1 
                            ? `[${orderQty + 1}/${orderItemQuantity}] ` 
                            : '';
                          // prodottoId esiste solo in BundleItem (catalogo), non in BundleItemSnapshot (ordine)
                          const bundleItemId = 'prodottoId' in bundleItem ? (bundleItem as { prodottoId: string }).prodottoId : undefined;
                          expandedProducts.push({
                            prodottoId: bundleItemId,
                            prodottoNome: bundleItem.quantita > 1 
                              ? `${bundlePrefix}${bundleItem.prodottoNome} (${i + 1}/${bundleItem.quantita}) - ${bundleParentName}`
                              : `${bundlePrefix}${bundleItem.prodottoNome} - ${bundleParentName}`,
                            prodottoNumeroFoto: bundleItem.numeroFoto,
                            isFromBundle: true,
                            bundleParentName: bundleParentName,
                          });
                        }
                      }
                    }
                    const totalExpandedCount = bundleItems.reduce(
                      (sum, item) => sum + (item.quantita || 1), 0
                    ) * orderItemQuantity;
                    console.log(`📦 Bundle "${bundleParentName}" x${orderItemQuantity} espanso in ${totalExpandedCount} prodotti`);
                  } else {
                    // Regular product - add as-is (respecting order item quantity)
                    for (let i = 0; i < orderItemQuantity; i++) {
                      expandedProducts.push({
                        prodottoId: orderItem.prodottoId || undefined,
                        prodottoNome: orderItemQuantity > 1 
                          ? `${orderItem.prodottoNome} (${i + 1}/${orderItemQuantity})`
                          : orderItem.prodottoNome,
                        // FIX: Usa 0 invece di undefined per coerenza (0 = selezione libera)
                        prodottoNumeroFoto: orderItem.prodottoNumeroFoto ?? 0,
                      });
                    }
                  }
                }
                
                prePopulateData.availableProducts = expandedProducts;
                console.log(
                  `📦 Ordine trovato con ${associatedOrder.prodotti.length} prodotti (espansi a ${expandedProducts.length}) per booking ${selectedBookingForGallery.id}`,
                );
              } else {
                // Nessun ordine o ordine senza prodotti - fallback al prodotto del booking
                prePopulateData.prodottoId =
                  selectedBookingForGallery.prodottoId;
                console.log(
                  `📦 Nessun ordine trovato, usando prodotto dal booking: ${selectedBookingForGallery.prodottoId}`,
                );
              }

              return (
                <NewGalleryModal
                  isOpen={true}
                  onClose={() => setSelectedBookingForGallery(null)}
                  onGalleryCreated={(galleryId) => {
                    queryClient.invalidateQueries({ queryKey: ["galleries"] });
                    setSelectedBookingForGallery(null);
                    toast({
                      title: "Galleria creata",
                      description:
                        "Reindirizzamento alla schermata di caricamento foto...",
                    });
                    // Navigate to gallery management page
                    navigate(`/admin/gallery/${galleryId}/manage`);
                  }}
                  prePopulate={prePopulateData}
                />
              );
            })()}
        </>

      {/* Manual Booking Modal */}
      <ManualBookingModal
        isOpen={showManualBookingModal}
        onClose={() => setShowManualBookingModal(false)}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["bookings"] });
          refetch();
        }}
      />

      {/* Edit Order Modal */}
      {editingOrder && (
        <EditOrderModal
          order={editingOrder}
          products={products}
          onClose={() => {
            queryClient.invalidateQueries({ queryKey: ["orders"] });
            setEditingOrder(null);
          }}
        />
      )}

      {/* Dialog Registrazione Pagamento */}
      <Dialog
        open={!!paymentDialog}
        onOpenChange={() => setPaymentDialog(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {paymentDialog?.tipo === 'acconto' ? (
                <>
                  <Wallet className="w-5 h-5 text-blue-600" />
                  Registra Acconto
                </>
              ) : (
                <>
                  <Euro className="w-5 h-5 text-green-600" />
                  Registra Saldo
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              {paymentDialog?.tipo === 'acconto' 
                ? 'Inserisci l\'importo dell\'acconto ricevuto'
                : 'Conferma il pagamento del saldo residuo'}
            </DialogDescription>
          </DialogHeader>

          {paymentDialog && (() => {
            const order = allOrders.find((o: Order) => o.id === paymentDialog.orderId);
            if (!order) return null;
            const totals = getOrderTotals(order);
            
            return (
              <div className="space-y-4 py-4">
                {/* Info ordine */}
                <div className="bg-gray-50 rounded-lg p-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Totale ordine:</span>
                    <span className="font-medium">€{totals.totale.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Già pagato:</span>
                    <span className="text-green-600">€{totals.totalePagato.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between border-t pt-2 mt-2">
                    <span className="text-gray-600 font-medium">Saldo residuo:</span>
                    <span className="font-bold text-orange-600">€{totals.saldoResiduo.toFixed(2)}</span>
                  </div>
                </div>

                {/* Importo (solo per acconto) */}
                {paymentDialog.tipo === 'acconto' && (
                  <div className="space-y-2">
                    <Label htmlFor="payment-amount">Importo Acconto *</Label>
                    <div className="relative">
                      <Euro className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <Input
                        id="payment-amount"
                        type="number"
                        min="0"
                        max={totals.saldoResiduo}
                        step="0.01"
                        value={paymentAmount}
                        onChange={(e) => setPaymentAmount(e.target.value)}
                        placeholder="0.00"
                        className="pl-9"
                        data-testid="input-payment-amount"
                      />
                    </div>
                    {parseFloat(paymentAmount) > totals.saldoResiduo && (
                      <p className="text-xs text-red-500">
                        L'importo non può superare il saldo residuo
                      </p>
                    )}
                  </div>
                )}

                {/* Metodo di pagamento */}
                <div className="space-y-2">
                  <Label>Metodo di Pagamento</Label>
                  <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as "contante" | "carta" | "bonifico" | "paypal")}>
                    <SelectTrigger data-testid="select-payment-method">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="contante">Contante</SelectItem>
                      <SelectItem value="bonifico">Bonifico</SelectItem>
                      <SelectItem value="carta">Carta</SelectItem>
                      <SelectItem value="paypal">PayPal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Note */}
                <div className="space-y-2">
                  <Label htmlFor="payment-note">Note (opzionale)</Label>
                  <Input
                    id="payment-note"
                    value={paymentNote}
                    onChange={(e) => setPaymentNote(e.target.value)}
                    placeholder="Note aggiuntive..."
                    data-testid="input-payment-note"
                  />
                </div>

              </div>
            );
          })()}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPaymentDialog(null)}
              disabled={accontoMutation.isPending || saldoMutation.isPending}
            >
              Annulla
            </Button>
            <Button
              onClick={() => {
                if (!paymentDialog) return;
                const foundOrder = allOrders.find((o: Order) => o.id === paymentDialog.orderId);
                if (!foundOrder) return;
                
                if (paymentDialog.tipo === 'acconto') {
                  const amount = parseFloat(paymentAmount);
                  if (isNaN(amount) || amount <= 0) {
                    toast({ title: "Inserisci un importo valido", variant: "destructive" });
                    return;
                  }
                  accontoMutation.mutate({
                    orderId: foundOrder.id,
                    importo: amount,
                    metodo: paymentMethod,
                    note: paymentNote || undefined,
                  });
                } else {
                  saldoMutation.mutate({
                    orderId: foundOrder.id,
                    metodo: paymentMethod,
                    note: paymentNote || undefined,
                  });
                }
              }}
              disabled={
                accontoMutation.isPending || 
                saldoMutation.isPending ||
                (paymentDialog?.tipo === 'acconto' && (!paymentAmount || parseFloat(paymentAmount) <= 0))
              }
              className="bg-sage hover:bg-dark-sage"
              data-testid="button-confirm-payment"
            >
              {(accontoMutation.isPending || saldoMutation.isPending) ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Salvataggio...
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Conferma Pagamento
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AlertDialog Cancellazione a Cascata */}
      <AlertDialog
        open={!!deleteBookingCascadeId}
        onOpenChange={() => {
          setDeleteBookingCascadeId(null);
          setCascadeDeleteCounts(null);
          setCancelReason("");
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-600">
              <AlertCircle className="w-5 h-5" />
              Conferma Eliminazione Prenotazione
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p className="font-medium">
                Stai per eliminare questa prenotazione e{" "}
                <strong>tutti i dati associati</strong>:
              </p>

              {cascadeDeleteCounts && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-700">
                      Ordini associati:
                    </span>
                    <span className="font-bold text-red-600">
                      {cascadeDeleteCounts.ordersCount}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-700">
                      Gallerie associate:
                    </span>
                    <span className="font-bold text-red-600">
                      {cascadeDeleteCounts.galleriesCount}
                    </span>
                  </div>
                </div>
              )}

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                <p className="text-sm text-yellow-800 font-medium">
                  ⚠️ Questa azione è <strong>irreversibile</strong>. Tutti i
                  dati saranno eliminati permanentemente.
                </p>
              </div>

              {/* Motivo cancellazione (opzionale) */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">
                  Motivo della cancellazione (opzionale)
                </label>
                <Textarea
                  placeholder="Inserisci un motivo che verrà comunicato al cliente via email..."
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  rows={3}
                  className="resize-none"
                  data-testid="input-cancel-reason"
                />
                <p className="text-xs text-gray-500">
                  Se compili questo campo, il cliente riceverà un'email con il motivo indicato.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmCascadeDelete}
              disabled={deleteBookingCascadeMutation.isPending}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              {deleteBookingCascadeMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Eliminazione...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Elimina Tutto
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* AlertDialog Conferma Workflow State Change */}
      <AlertDialog
        open={!!workflowChangeBooking}
        onOpenChange={() => setWorkflowChangeBooking(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-blue-600" />
              Conferma Cambio Stato Workflow
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              {workflowChangeBooking && (
                <>
                  <p className="font-medium">
                    Stai per aggiornare lo stato workflow di:
                  </p>

                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-700">Cliente:</span>
                      <span className="font-bold text-blue-900">
                        {workflowChangeBooking.booking.cliente.nome}{" "}
                        {workflowChangeBooking.booking.cliente.cognome}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-700">
                        Nuovo stato:
                      </span>
                      <span className="font-bold text-blue-900 flex items-center gap-2">
                        {workflowChangeBooking.newState ===
                          WorkflowState.SHOOTING_DA_SVOLGERE && (
                          <><Camera className="h-4 w-4" /> Shooting da svolgere</>
                        )}
                        {workflowChangeBooking.newState ===
                          WorkflowState.SHOOTING_COMPLETATO && (
                          <><CheckCircle2 className="h-4 w-4" /> Shooting completato</>
                        )}
                        {workflowChangeBooking.newState ===
                          WorkflowState.IN_LAVORAZIONE && (
                          <><Palette className="h-4 w-4" /> In lavorazione</>
                        )}
                        {workflowChangeBooking.newState ===
                          WorkflowState.IN_ATTESA_SELEZIONE && (
                          <><Timer className="h-4 w-4" /> In attesa selezione</>
                        )}
                        {workflowChangeBooking.newState ===
                          WorkflowState.COMPLETATO && (
                          <><PartyPopper className="h-4 w-4" /> Completato</>
                        )}
                        {workflowChangeBooking.newState ===
                          WorkflowState.CONSEGNATO && (
                          <><PackageCheck className="h-4 w-4" /> Consegnato</>
                        )}
                      </span>
                    </div>
                  </div>

                  <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                    <p className="text-sm text-green-800 font-medium flex items-center gap-2">
                      <Mail className="w-4 h-4" />
                      Una email automatica sarà inviata al cliente (
                      {workflowChangeBooking.booking.cliente.email})
                    </p>
                  </div>

                  <p className="text-sm text-gray-600">
                    Vuoi procedere con l'aggiornamento?
                  </p>
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmWorkflowChange}
              disabled={workflowStateMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700 focus:ring-blue-600"
            >
              {workflowStateMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Aggiornamento...
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Conferma
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/**
 * Dialog creazione ordine da booking
 */
interface CreateOrderDialogProps {
  booking: Booking;
  products: Product[];
  categories: ProductCategory[];
  campaigns: BookingCampaignFE[];
  onClose: () => void;
  onSubmit: (orderData: any) => void;
  isPending: boolean;
}

interface CustomProduct {
  id: string;
  nome: string;
  prezzo: number;
  numeroFoto: number;
  quantita: number;
}

function CreateOrderDialog({
  booking,
  products,
  categories,
  campaigns,
  onClose,
  onSubmit,
  isPending,
}: CreateOrderDialogProps) {
  const [selectedProducts, setSelectedProducts] = useState<
    Array<{
      prodottoId: string;
      quantita: number;
    }>
  >([]);
  const [customProducts, setCustomProducts] = useState<CustomProduct[]>([]);
  const [acconto, setAcconto] = useState<number>(0);
  const [sconto, setSconto] = useState<number>(0);
  const [note, setNote] = useState<string>("");
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customNome, setCustomNome] = useState("");
  const [customPrezzo, setCustomPrezzo] = useState<number>(0);
  const [customNumeroFoto, setCustomNumeroFoto] = useState<number>(0);
  
  const campaign = campaigns.find((c) => c.id === booking.campaignId);
  
  // Categoria default basata sul tema della campagna (come ManualBookingModal)
  const defaultCategory = useMemo(() => {
    if (!campaign?.temaStagionale) return 'all';
    const tema = campaign.temaStagionale.toLowerCase();
    const exactMatch = categories.find(c => c.value === tema);
    if (exactMatch) return exactMatch.value;
    const partialMatch = categories.find(c => c.value.toLowerCase().startsWith(tema));
    if (partialMatch) return partialMatch.value;
    return 'all';
  }, [campaign?.temaStagionale, categories]);

  // Pre-popola prodotti da booking (multi-prodotto o singolo prodottoId)
  useEffect(() => {
    // Priorità: booking.prodotti (multi-prodotto) > booking.prodottoId (legacy)
    if (booking.prodotti && booking.prodotti.length > 0) {
      const preselected = booking.prodotti
        .filter(p => products.some(prod => prod.id === p.prodottoId))
        .map(p => ({ prodottoId: p.prodottoId, quantita: p.quantita || 1 }));
      if (preselected.length > 0) {
        setSelectedProducts(preselected);
      }
    } else if (booking.prodottoId) {
      const isAvailable = products.some((p) => p.id === booking.prodottoId);
      if (isAvailable) {
        setSelectedProducts([{ prodottoId: booking.prodottoId, quantita: 1 }]);
      }
    }
  }, [products, booking.prodotti, booking.prodottoId]);

  // Helper: Aggiungi prodotto vuoto
  const addProduct = () => {
    setSelectedProducts([...selectedProducts, { prodottoId: "", quantita: 1 }]);
  };

  // Helper: Rimuovi prodotto
  const removeProduct = (index: number) => {
    setSelectedProducts(selectedProducts.filter((_, i) => i !== index));
  };

  // Helper: Aggiorna prodotto
  const updateProduct = (
    index: number,
    field: "prodottoId" | "quantita",
    value: string | number,
  ) => {
    const updated = [...selectedProducts];
    updated[index] = { ...updated[index], [field]: value };
    setSelectedProducts(updated);
  };

  // Helper: Calcola subtotale per prodotto catalogo
  const getProductSubtotal = (prodottoId: string, quantita: number): number => {
    const product = products.find((p) => p.id === prodottoId);
    if (!product) return 0;
    return product.prezzoFinale * quantita;
  };
  
  // Helper: Aggiungi prodotto da ProductSelector
  const handleAddProductFromSelector = (productId: string) => {
    if (!productId) return;
    const existingIndex = selectedProducts.findIndex(p => p.prodottoId === productId);
    if (existingIndex >= 0) {
      const updated = [...selectedProducts];
      updated[existingIndex].quantita += 1;
      setSelectedProducts(updated);
    } else {
      setSelectedProducts([...selectedProducts, { prodottoId: productId, quantita: 1 }]);
    }
  };

  // Helper: Calcola subtotale prodotti (senza sconto)
  const calculateSubtotale = (): number => {
    const catalogoTotale = selectedProducts.reduce((sum, item) => {
      return sum + getProductSubtotal(item.prodottoId, item.quantita);
    }, 0);
    const customTotale = customProducts.reduce((sum, item) => {
      return sum + item.prezzo * item.quantita;
    }, 0);
    return catalogoTotale + customTotale;
  };

  // Helper: Calcola totale ordine (subtotale - sconto)
  const calculateTotale = (): number => {
    const subtotale = calculateSubtotale();
    return Math.max(0, subtotale - sconto);
  };

  // Helper: Aggiungi prodotto personalizzato con validazione robusta
  const addCustomProduct = () => {
    // Validazione nome
    if (!customNome.trim()) {
      return;
    }
    
    // Validazione prezzo (deve essere > 0)
    if (typeof customPrezzo !== 'number' || isNaN(customPrezzo) || customPrezzo <= 0) {
      return;
    }
    
    // Validazione numeroFoto (deve essere >= 0)
    const validNumeroFoto = typeof customNumeroFoto === 'number' && !isNaN(customNumeroFoto) && customNumeroFoto >= 0
      ? customNumeroFoto
      : 0;
    
    const newCustom: CustomProduct = {
      id: `custom_${Date.now()}`,
      nome: customNome.trim(),
      prezzo: customPrezzo,
      numeroFoto: validNumeroFoto,
      quantita: 1,
    };
    setCustomProducts([...customProducts, newCustom]);
    setCustomNome("");
    setCustomPrezzo(0);
    setCustomNumeroFoto(0);
    setShowCustomForm(false);
  };

  // Helper: Rimuovi prodotto personalizzato
  const removeCustomProduct = (id: string) => {
    setCustomProducts(customProducts.filter((p) => p.id !== id));
  };

  // Helper: Aggiorna quantità prodotto personalizzato
  const updateCustomQuantita = (id: string, quantita: number) => {
    setCustomProducts(
      customProducts.map((p) =>
        p.id === id ? { ...p, quantita: Math.max(1, quantita) } : p
      )
    );
  };

  // Handler: Submit ordine con validazione robusta
  const handleSubmit = () => {
    // Validation: almeno un prodotto
    if (selectedProducts.length === 0 && customProducts.length === 0) {
      alert("Seleziona almeno un prodotto");
      return;
    }

    // Verifica che tutti prodotti catalogo siano selezionati con quantità valida
    if (selectedProducts.some((p) => !p.prodottoId || p.quantita <= 0)) {
      alert("Completa tutti i prodotti con quantità valida");
      return;
    }
    
    // Validazione prodotti custom: prezzo > 0 e quantità > 0
    const invalidCustomProducts = customProducts.filter(
      (p) => !p.nome?.trim() || p.prezzo <= 0 || p.quantita <= 0
    );
    if (invalidCustomProducts.length > 0) {
      alert("Tutti i prodotti personalizzati devono avere nome, prezzo positivo e quantità valida");
      return;
    }
    
    // Validazione acconto: non può superare il totale
    const totaleOrdine = calculateTotale();
    if (acconto < 0) {
      alert("L'acconto non può essere negativo");
      return;
    }
    if (acconto > totaleOrdine) {
      alert(`L'acconto (€${acconto.toFixed(2)}) non può superare il totale ordine (€${totaleOrdine.toFixed(2)})`);
      return;
    }

    // Costruisci array OrderItem con snapshot (prodotti catalogo)
    const catalogoOrderItems: OrderItem[] = selectedProducts.map((item) => {
      const product = products.find((p: Product) => p.id === item.prodottoId)!;
      // Per bundle: calcola totale foto da bundleItems
      const totalPhotos = product.isBundle && product.bundleItems && product.bundleItems.length > 0
        ? product.bundleItems.reduce((sum: number, bi: BundleItem) => sum + (bi.numeroFoto || 0) * (bi.quantita || 1), 0)
        : product.numeroFoto;
      return {
        prodottoId: product.id,
        prodottoNome: product.nome,
        prodottoPrezzo: product.prezzoFinale,
        prodottoNumeroFoto: totalPhotos,
        quantita: item.quantita,
        // Salva bundleItems se è un bundle per espansione in gallery
        ...(product.isBundle && product.bundleItems ? { isBundle: true, bundleItems: product.bundleItems } : {}),
      };
    });

    // Prodotti personalizzati (prodottoId null/vuoto)
    const customOrderItems: OrderItem[] = customProducts.map((item) => ({
      prodottoId: item.id,
      prodottoNome: item.nome,
      prodottoPrezzo: item.prezzo,
      prodottoNumeroFoto: item.numeroFoto,
      quantita: item.quantita,
      isCustom: true,
    }));

    const prodottiOrderItems = [...catalogoOrderItems, ...customOrderItems];

    // Crea ordine
    const orderData = {
      bookingId: booking.id,
      nomeCliente: `${booking.cliente.nome} ${booking.cliente.cognome}`,
      emailCliente: booking.cliente.email,
      whatsappCliente: booking.cliente.whatsapp,
      prodotti: prodottiOrderItems,
      sconto: sconto > 0 ? sconto : undefined,
      acconto,
      note,
      stato: "bozza" as const,
    };

    onSubmit(orderData);
  };

  const totale = calculateTotale();

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-playfair text-2xl flex items-center gap-2">
            <ShoppingCart className="w-6 h-6 text-sage" />
            Crea Ordine da Prenotazione
          </DialogTitle>
          <DialogDescription>
            Cliente: {booking.cliente.nome} {booking.cliente.cognome}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Info campagna */}
          {campaign && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-sm text-blue-800">
                <span className="font-medium">Campagna:</span> {campaign.nome}
                {campaign.prodottiDisponibili?.length > 0 && (
                  <span className="ml-2 text-blue-600">
                    ({campaign.prodottiDisponibili.length} prodotti campagna)
                  </span>
                )}
              </p>
            </div>
          )}

          {/* Prodotti da catalogo con ProductSelector */}
          <div className="space-y-4">
            <Label className="text-base font-semibold">Prodotti da Catalogo</Label>
            
            {/* ProductSelector con filtri integrati - mostra tutti i prodotti */}
            <ProductSelector
              products={products}
              categories={categories}
              onSelectProduct={handleAddProductFromSelector}
              placeholder="Cerca e aggiungi prodotto..."
              defaultCategory={defaultCategory}
            />

            {/* Lista prodotti selezionati */}
            {selectedProducts.length === 0 ? (
              <div className="text-center py-6 text-gray-500 bg-gray-50 rounded-lg">
                <Package className="w-10 h-10 mx-auto mb-2 text-gray-400" />
                <p className="text-sm">Nessun prodotto catalogo aggiunto</p>
              </div>
            ) : (
              <div className="space-y-3">
                {selectedProducts.map((item, index) => {
                  const product = products.find(
                    (p) => p.id === item.prodottoId,
                  );
                  const subtotale = getProductSubtotal(
                    item.prodottoId,
                    item.quantita,
                  );

                  return (
                    <div
                      key={index}
                      className="flex items-center gap-3 p-4 border rounded-lg bg-white"
                    >
                      <div className="flex-1">
                        {product ? (
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{product.nome}</span>
                            <span className="text-sm text-muted-foreground">
                              €{product.prezzoFinale.toFixed(2)}
                            </span>
                            {product.isBundle && <span>📦</span>}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">Prodotto non trovato</span>
                        )}
                      </div>

                      <div className="w-24">
                        <Input
                          type="number"
                          min="1"
                          value={item.quantita}
                          onChange={(e) =>
                            updateProduct(
                              index,
                              "quantita",
                              parseInt(e.target.value) || 1,
                            )
                          }
                          placeholder="Qtà"
                          data-testid={`input-quantity-${index}`}
                        />
                      </div>

                      <div className="w-28 text-right font-medium">
                        €{subtotale.toFixed(2)}
                      </div>

                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => removeProduct(index)}
                        data-testid={`button-remove-product-${index}`}
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Prodotti Personalizzati */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold">Prodotti Personalizzati</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setShowCustomForm(true)}
                className="border-amber-500 text-amber-600 hover:bg-amber-500 hover:text-white"
                data-testid="button-add-custom-product"
              >
                <Plus className="w-4 h-4 mr-1" />
                Aggiungi Personalizzato
              </Button>
            </div>

            {/* Form nuovo prodotto personalizzato */}
            {showCustomForm && (
              <div className="p-4 border-2 border-dashed border-amber-300 rounded-lg bg-amber-50 space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-3 sm:col-span-1">
                    <Label className="text-xs mb-1 block">Nome Prodotto *</Label>
                    <Input
                      value={customNome}
                      onChange={(e) => setCustomNome(e.target.value)}
                      placeholder="es. Servizio Extra"
                      data-testid="input-custom-nome"
                    />
                  </div>
                  <div>
                    <Label className="text-xs mb-1 block">Prezzo (€) *</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={customPrezzo || ""}
                      onChange={(e) => setCustomPrezzo(parseFloat(e.target.value) || 0)}
                      placeholder="0.00"
                      data-testid="input-custom-prezzo"
                    />
                  </div>
                  <div>
                    <Label className="text-xs mb-1 block">N. Foto</Label>
                    <Input
                      type="number"
                      min="0"
                      value={customNumeroFoto || ""}
                      onChange={(e) => setCustomNumeroFoto(parseInt(e.target.value) || 0)}
                      placeholder="0"
                      data-testid="input-custom-foto"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setShowCustomForm(false);
                      setCustomNome("");
                      setCustomPrezzo(0);
                      setCustomNumeroFoto(0);
                    }}
                  >
                    Annulla
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={addCustomProduct}
                    disabled={!customNome.trim() || customPrezzo <= 0}
                    className="bg-amber-500 hover:bg-amber-600 text-white"
                    data-testid="button-confirm-custom"
                  >
                    Conferma
                  </Button>
                </div>
              </div>
            )}

            {/* Lista prodotti personalizzati */}
            {customProducts.length > 0 && (
              <div className="space-y-2">
                {customProducts.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 p-3 border border-amber-200 rounded-lg bg-amber-50"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{item.nome}</span>
                        <span className="text-xs bg-amber-200 text-amber-800 px-2 py-0.5 rounded">
                          Personalizzato
                        </span>
                      </div>
                      <p className="text-sm text-gray-600">
                        €{item.prezzo.toFixed(2)}
                        {item.numeroFoto > 0 && ` - ${item.numeroFoto} foto`}
                      </p>
                    </div>

                    <div className="w-20">
                      <Input
                        type="number"
                        min="1"
                        value={item.quantita}
                        onChange={(e) =>
                          updateCustomQuantita(item.id, parseInt(e.target.value) || 1)
                        }
                        className="text-center"
                        data-testid={`input-custom-qty-${item.id}`}
                      />
                    </div>

                    <div className="w-24 text-right font-medium">
                      €{(item.prezzo * item.quantita).toFixed(2)}
                    </div>

                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => removeCustomProduct(item.id)}
                      data-testid={`button-remove-custom-${item.id}`}
                    >
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Sconto */}
          <div>
            <Label htmlFor="sconto" className="mb-2 block">
              Sconto (€) - opzionale
            </Label>
            <Input
              id="sconto"
              type="number"
              min="0"
              max={calculateSubtotale()}
              step="0.01"
              value={sconto || ''}
              onChange={(e) => setSconto(parseFloat(e.target.value) || 0)}
              placeholder="Inserisci sconto in euro"
              data-testid="input-sconto"
            />
          </div>

          {/* Riepilogo totale */}
          <div className="bg-sage/10 p-4 rounded-lg space-y-2">
            {sconto > 0 && (
              <>
                <div className="flex justify-between items-center text-sm text-gray-600">
                  <span>Subtotale:</span>
                  <span>€{calculateSubtotale().toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center text-sm text-green-600">
                  <span>Sconto:</span>
                  <span>-€{sconto.toFixed(2)}</span>
                </div>
              </>
            )}
            <div className="flex justify-between items-center text-lg font-bold">
              <span>Totale Ordine:</span>
              <span className="text-sage">€{totale.toFixed(2)}</span>
            </div>
          </div>

          {/* Acconto */}
          <div>
            <Label htmlFor="acconto" className="mb-2 block">
              Acconto (opzionale)
            </Label>
            <Input
              id="acconto"
              type="number"
              min="0"
              max={totale}
              step="0.01"
              value={acconto}
              onChange={(e) => setAcconto(parseFloat(e.target.value) || 0)}
              placeholder="Inserisci acconto in euro"
              data-testid="input-acconto"
            />
            {acconto > 0 && (
              <p className="text-sm text-gray-600 mt-1">
                Saldo da versare: €{(totale - acconto).toFixed(2)}
              </p>
            )}
          </div>

          {/* Note */}
          <div>
            <Label htmlFor="note" className="mb-2 block">
              Note (opzionale)
            </Label>
            <Input
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Note aggiuntive per l'ordine"
              data-testid="input-note"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Annulla
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isPending || (selectedProducts.length === 0 && customProducts.length === 0)}
            className="bg-sage hover:bg-dark-sage"
            data-testid="button-submit-order"
          >
            {isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Creazione...
              </>
            ) : (
              <>
                <ShoppingCart className="w-4 h-4 mr-2" />
                Crea Ordine
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
