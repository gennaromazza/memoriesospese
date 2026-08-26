import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { useLocation, Link } from "wouter";
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  collectionGroup,
  setDoc,
  getDoc,
  where,
} from "firebase/firestore";
import { getAuth, signOut } from "firebase/auth";
import { db, storage, auth } from "@/lib/firebase";
import { useFirebaseAuth } from "@/context/FirebaseAuthContext";
import { createUrl } from "@/lib/basePath";
import { GalleryService, type Gallery } from "@/lib/galleries";
import { useQuery } from "@tanstack/react-query";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  formatPasswordRequestsForExcel,
  exportToExcel,
} from "@/lib/excelExport";
import {
  ref,
  listAll,
  deleteObject,
  uploadBytes,
  getDownloadURL,
} from "firebase/storage";
import Navigation from "@/components/Navigation";
import NewGalleryModal from "@/components/NewGalleryModal";
import EditGalleryModal from "@/components/EditGalleryModal";
import ShareGalleryButton from "@/components/ShareGalleryButton";
import SlideshowManager from "@/components/SlideshowManager";
import ClientiManager from "@/components/ClientiManager";
import EmailStatusPanel from "@/components/EmailStatusPanel";
import ProductsManager from "@/components/ProductsManager";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useQueryClient } from "@tanstack/react-query";
import {
  Search,
  Plus,
  Edit,
  Trash,
  Eye,
  EyeOff,
  RefreshCw,
  Download,
  Key,
  ChevronLeft,
  ChevronRight,
  Users,
  Play,
  Mail,
  HelpCircle,
  Settings,
  Sparkles,
  Package,
  Calendar,
  CalendarCheck,
  ShoppingBag,
  Wallet,
  FolderOpen,
  Briefcase,
  FileText,
  ChevronDown,
  ChevronRight as ChevronRightIcon,
  Grid3x3,
  BookOpen,
  Upload,
  Home,
  Palette,
  Camera,
  CheckCircle,
  List,
  Link2,
  AlertCircle,
  ExternalLink,
  Database,
  HardDrive,
  ClipboardList,
} from "lucide-react";
import QuestionnaireManager from "./admin/QuestionnaireManager";
import InfoFormTemplateManager from "./admin/InfoFormTemplateManager";
import PhotobooksManager from "@/components/photobook/PhotobooksManager";
import PhotobookChangesScreen from "@/components/photobook/PhotobookChangesScreen";
import CampaignsManager from "@/components/CampaignsManager";
import BookingsManager from "@/components/BookingsManager";
import CashDashboard from "@/components/CashDashboard";
import { getAllThemes } from "@shared/special-themes";
import { isWeddingJobType } from "@/lib/wedding-seo";
import JobsManager from "@/components/jobs/JobsManager";
import ContractClausesManager from "@/components/contract-clauses/ContractClausesManager";
import JobTypesManager from "@/components/job-types/JobTypesManager";
import LabsManager from "@/components/labs/LabsManager";
import { getActiveJobTypes } from "@/lib/job-types";
import type { JobTypeFE } from "@shared/job-types";
import ProductCategoriesManager from "@/components/product-categories/ProductCategoriesManager";
import ConsultationTemplatesManager from "./admin/ConsultationTemplatesManager";
import ConsultationsManager from "./admin/ConsultationsManager";
import PhotosMigration from "@/components/PhotosMigration";
import PhotoDatesBackfill from "@/components/PhotoDatesBackfill";
import GalleryJobTypeBackfill from "@/components/GalleryJobTypeBackfill";
import SyncClientJobRefs from "@/components/SyncClientJobRefs";
import GalleryRecoveryTool from "@/components/admin/GalleryRecoveryTool";
import CalendarioManager from "@/components/admin/CalendarioManager";
import { NotificationBell } from "@/components/NotificationBell";
import { useNotifications } from "@/hooks/useNotifications";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { BarChart3, Clock, Globe, Phone, Star, MapPin, CreditCard, Share2, Monitor, Building2, Instagram, Facebook } from "lucide-react";
import { CollaboratoriManager } from "@/components/collaboratori/CollaboratoriManager";
import PortfolioManager from "@/components/admin/PortfolioManager";
import BlogManager from "@/components/admin/BlogManager";
import EmailLogsManager from "@/components/admin/EmailLogsManager";
import WeddingVideosManager from "@/components/admin/WeddingVideosManager";
import ReminderManager from "@/components/admin/ReminderManager";
import ReviewEmailManager from "@/components/admin/ReviewEmailManager";
import TodayJobsSummary from "@/components/admin/TodayJobsSummary";
import BulkEmailSender from "./BulkEmailSender";
import QuoteTemplatesManager from "@/components/quotes/QuoteTemplatesManager";
import { AdminCommandPalette } from "@/components/admin/AdminCommandPalette";
import {
  ADMIN_NAV_GROUPS,
  type NavTarget,
} from "@/components/admin/adminNavigation";
import OspitiQrCard from "@/components/admin/OspitiQrCard";
import HomepageContentEditor from "@/components/admin/HomepageContentEditor";
import {
  DEFAULT_HOMEPAGE_CONTENT,
  resolveHomepageContent,
  type HomepageContent,
} from "@shared/homepage-content";
// Lazy load StudioAssistant per migliorare il caricamento iniziale
const StudioAssistant = lazy(
  () => import("@/components/studio-assistant/StudioAssistant"),
);

function GoogleCalendarStatus({
  toast,
}: {
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const [status, setStatus] = useState<{
    connected: boolean;
    accountEmail?: string;
    calendarId?: string;
    authMethod?: string;
    error?: string;
    loading: boolean;
  }>({ connected: false, loading: true });

  const checkStatus = async () => {
    setStatus((prev) => ({ ...prev, loading: true }));
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        setStatus({
          connected: false,
          loading: false,
          error: "Non autenticato",
        });
        return;
      }

      const response = await fetch("/api/calendar/connection-status", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      setStatus({ ...data, loading: false });
    } catch (error: any) {
      setStatus({ connected: false, loading: false, error: error.message });
    }
  };

  useEffect(() => {
    checkStatus();
  }, []);

  if (status.loading) {
    return (
      <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
        <RefreshCw className="h-5 w-5 text-gray-400 animate-spin" />
        <span className="text-sm text-gray-600">
          Verifica connessione in corso...
        </span>
      </div>
    );
  }

  if (status.connected) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-200">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-600" />
            <div>
              <span className="text-sm text-green-800">
                Service Account: <strong>{status.accountEmail}</strong>
              </span>
              <p className="text-xs text-green-600">
                Calendario: {status.calendarId} — Connessione permanente
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={checkStatus}
            className="text-green-700 hover:text-green-800"
            data-testid="button-refresh-calendar"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 p-3 bg-red-50 rounded-lg border border-red-200">
        <AlertCircle className="h-5 w-5 text-red-600" />
        <div className="flex-1">
          <span className="text-sm text-red-800 font-medium">
            Google Calendar non connesso
          </span>
          {status.error && (
            <p className="text-xs text-red-600 mt-1">{status.error}</p>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={checkStatus}
          className="text-red-700"
          data-testid="button-retry-calendar"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
        <p className="text-sm text-blue-800 mb-2">
          <strong>Per connettere Google Calendar:</strong>
        </p>
        <ol className="text-sm text-blue-700 list-decimal list-inside space-y-1">
          <li>Vai nella sezione "Deployments" del tuo progetto Replit</li>
          <li>Clicca su "Integrations"</li>
          <li>Trova "Google Calendar" e clicca "Connect"</li>
          <li>Autorizza l'accesso con l'account desiderato</li>
        </ol>
      </div>
    </div>
  );
}

// Componente di paginazione riutilizzabile
interface PaginationControlsProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onPrevious: () => void;
  onNext: () => void;
}

function PaginationControls({
  currentPage,
  totalPages,
  onPageChange,
  onPrevious,
  onNext,
}: PaginationControlsProps) {
  // Non mostrare controlli se c'è solo una pagina
  if (totalPages <= 1) return null;

  return (
    <div className="flex justify-center items-center mt-6 space-x-1">
      <Button
        variant="outline"
        size="sm"
        onClick={onPrevious}
        disabled={currentPage === 1}
      >
        <ChevronLeft className="h-4 w-4 mr-1" /> Prec
      </Button>

      {totalPages <= 5 ? (
        // Se ci sono 5 o meno pagine, mostra tutti i numeri
        Array.from({ length: totalPages }, (_, i) => (
          <Button
            key={i}
            variant={currentPage === i + 1 ? "default" : "outline"}
            size="sm"
            className="w-8"
            onClick={() => onPageChange(i + 1)}
          >
            {i + 1}
          </Button>
        ))
      ) : (
        // Se ci sono più di 5 pagine, mostra un sottoinsieme con "..."
        <>
          {/* Prima pagina */}
          <Button
            variant={currentPage === 1 ? "default" : "outline"}
            size="sm"
            className="w-8"
            onClick={() => onPageChange(1)}
          >
            1
          </Button>

          {/* Ellipsis o pagine vicine all'attuale */}
          {currentPage > 3 && <span className="mx-1">...</span>}

          {/* Pagine adiacenti */}
          {currentPage > 2 && (
            <Button
              variant="outline"
              size="sm"
              className="w-8"
              onClick={() => onPageChange(currentPage - 1)}
            >
              {currentPage - 1}
            </Button>
          )}

          {/* Pagina corrente (se non è la prima o l'ultima) */}
          {currentPage !== 1 && currentPage !== totalPages && (
            <Button variant="default" size="sm" className="w-8">
              {currentPage}
            </Button>
          )}

          {/* Pagina successiva */}
          {currentPage < totalPages - 1 && (
            <Button
              variant="outline"
              size="sm"
              className="w-8"
              onClick={() => onPageChange(currentPage + 1)}
            >
              {currentPage + 1}
            </Button>
          )}

          {/* Ellipsis finale */}
          {currentPage < totalPages - 2 && <span className="mx-1">...</span>}

          {/* Ultima pagina */}
          <Button
            variant={currentPage === totalPages ? "default" : "outline"}
            size="sm"
            className="w-8"
            onClick={() => onPageChange(totalPages)}
          >
            {totalPages}
          </Button>
        </>
      )}

      <Button
        variant="outline"
        size="sm"
        onClick={onNext}
        disabled={currentPage === totalPages}
      >
        Succ <ChevronRight className="h-4 w-4 ml-1" />
      </Button>
    </div>
  );
}

interface GalleryItem {
  id: string;
  name: string;
  code: string;
  date: string;
  active: boolean;
  photoCount: number;
  createdAt: any;
  location?: string;
  description?: string;
  coverImageUrl?: string;
  coverImageMobile?: string;
  coverImageDesktop?: string;
  youtubeUrl?: string;
  youtubeUrls?: string[];
  password?: string;
  specialTheme?: string;
  specialPin?: string;
  selectionStatus?: string;
  selectionEnabled?: boolean;
  requiredPhotoCount?: number;
  selectionDeadline?: any;
  selectionDeadlineEnforced?: boolean;
  selectedPhotoIds?: string[];
  productRequirements?: any[];
  bookingId?: string;
  clientEmail?: string;
  clientName?: string;
}

interface StudioSettings {
  name: string;
  slogan: string;
  address: string;
  phone: string;
  email: string;
  websiteUrl: string;
  socialLinks: {
    facebook?: string;
    instagram?: string;
    twitter?: string;
  };
  about: string;
  logo?: string;
  // Testi personalizzabili della Hero Section
  heroTitle: string;
  heroSubtitle: string;
  heroButtonText: string;
  // Testi personalizzabili della sezione WhatsApp
  whatsappTitle: string;
  whatsappSubtitle: string;
  whatsappText: string;
  whatsappButtonText: string;
  partitaIVA?: string;
  codiceFiscale?: string;
  fiscalVia?: string;
  fiscalCap?: string;
  fiscalComune?: string;
  fiscalProvincia?: string;
  regimeFiscale?: string;
  whatsapp?: string;
  googleReviewUrl?: string;
  homepageContent: HomepageContent;
}

export default function AdminDashboard() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedGallery, setSelectedGallery] = useState<GalleryItem | null>(
    null,
  );
  const [searchQuery, setSearchQuery] = useState<string>(
    () => sessionStorage.getItem("gallerySearchQuery") || "",
  );
  const [galleryTypeFilter, setGalleryTypeFilter] = useState<
    "all" | "generic" | "special"
  >(
    () =>
      (sessionStorage.getItem("galleryTypeFilter") as
        | "all"
        | "generic"
        | "special") || "generic",
  );
  const [selectionFilter, setSelectionFilter] = useState<"all" | "approved">(
    () =>
      (sessionStorage.getItem("gallerySelectionFilter") as
        | "all"
        | "approved") || "all",
  );
  const [galleryJobTypeFilter, setGalleryJobTypeFilter] = useState<string>(
    () => sessionStorage.getItem("galleryJobTypeFilter") || "all",
  );
  const [dashboardJobTypes, setDashboardJobTypes] = useState<JobTypeFE[]>([]); // 🏷️ Tipi evento disponibili
  const [passwordRequests, setPasswordRequests] = useState<any[]>([]);
  const [isSettingsLoading, setIsSettingsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<
    | "galleries"
    | "users"
    | "clienti"
    | "slideshow"
    | "requests"
    | "email"
    | "questionnaire"
    | "settings"
    | "cassa"
    | "bookings"
    | "commesse"
    | "themes"
    | "lavori"
    | "consulenze"
    | "consulenze-templates"
    | "calendario"
    | "collaboratori"
    | "sitoPublico"
    | "videos"
    | "quote-templates"
    | "photobooks"
    | "photobook-changes"
  >(() => {
    return (sessionStorage.getItem("activeTab") as any) || "calendario";
  });
  const [activeBookingSection, setActiveBookingSection] = useState<
    "bookings-list" | "campaigns"
  >(() => {
    const stored = sessionStorage.getItem("activeBookingSection") as any;
    // Sanitize legacy values
    if (!["bookings-list", "campaigns"].includes(stored)) {
      return "bookings-list";
    }
    return stored || "bookings-list";
  });
  const [activeConsultationSection, setActiveConsultationSection] = useState<
    "consulenze" | "consulenze-templates"
  >(() => {
    return (
      (sessionStorage.getItem("activeConsultationSection") as any) ||
      "consulenze"
    );
  });
  const [settingsSection, setSettingsSection] = useState<
    | "studio"
    | "slideshow"
    | "products"
    | "product-categories"
    | "migration"
    | "email-logs"
    | "integrations"
  >(() => {
    return (sessionStorage.getItem("settingsSection") as any) || "studio";
  });
  const [activeSitoSection, setActiveSitoSection] = useState<
    "portfolio" | "blog"
  >(() => {
    return (sessionStorage.getItem("activeSitoSection") as any) || "portfolio";
  });
  const [activeJobSection, setActiveJobSection] = useState<
    | "jobs-list"
    | "clienti"
    | "job-types"
    | "laboratori"
    | "contract-clauses"
    | "quote-templates"
    | "moduli-informativi"
  >(() => {
    return (sessionStorage.getItem("activeJobSection") as any) || "jobs-list";
  });
  const [highlightBookingId, setHighlightBookingId] = useState<string | null>(
    null,
  );
  const [highlightConsultationId, setHighlightConsultationId] = useState<
    string | null
  >(null);

  // Stati per la gestione dei Collapsible
  const [galleriesExpanded, setGalleriesExpanded] = useState(true);
  const [clientiExpanded, setClientiExpanded] = useState(true);
  const [bookingsExpanded, setBookingsExpanded] = useState(true);
  const [emailExpanded, setEmailExpanded] = useState(true);
  const [requestsExpanded, setRequestsExpanded] = useState(true);

  // Detect if admin came from a specific gallery
  const [referrerGallery, setReferrerGallery] = useState<{
    name: string;
    code?: string;
    from: string;
  } | null>(null);

  // Stati per la paginazione delle gallerie
  const [currentGalleryPage, setCurrentGalleryPage] = useState(1);
  const [galleriesPerPage] = useState(5); // Numero di gallerie per pagina

  // Stati per la paginazione delle richieste password
  const [currentRequestPage, setCurrentRequestPage] = useState(1);
  const [requestsPerPage] = useState(10); // Numero di richieste per pagina
  const [studioSettings, setStudioSettings] = useState<StudioSettings>({
    name: "",
    slogan: "",
    address: "",
    phone: "",
    email: "",
    websiteUrl: "",
    socialLinks: {
      facebook: "",
      instagram: "",
      twitter: "",
    },
    about: "",
    logo: "",
    // Valori predefiniti per i testi personalizzabili
    heroTitle: "Catturiamo i momenti più preziosi",
    heroSubtitle: "Ogni scatto racconta una storia unica",
    heroButtonText: "Prenota il tuo shooting",
    // Valori predefiniti per la sezione WhatsApp
    whatsappTitle: "Contattaci su WhatsApp",
    whatsappSubtitle: "Siamo qui per te",
    whatsappText:
      "Hai domande sulle nostre gallerie o vuoi prenotare un servizio? Scrivici su WhatsApp!",
    whatsappButtonText: "Scrivici su WhatsApp",
    whatsapp: "",
    googleReviewUrl: "",
    homepageContent: DEFAULT_HOMEPAGE_CONTENT,
    fiscalVia: "",
    fiscalCap: "",
    fiscalComune: "",
    fiscalProvincia: "",
    regimeFiscale: "",
  });
  const [location, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Hook Firebase Auth per verifica autenticazione asincrona
  const {
    user,
    isLoading: authLoading,
    isAdmin: isFirebaseAdmin,
  } = useFirebaseAuth();

  // Query React Query per gallerie (solo quando auth è pronto)
  const {
    data: galleries = [],
    isLoading,
    error: galleriesError,
  } = useQuery<Gallery[]>({
    queryKey: ["galleries", "admin"],
    queryFn: GalleryService.getAllGalleriesForAdmin,
    enabled: !authLoading && !!user,
    retry: 2,
    staleTime: 3 * 60 * 1000, // 3 minuti - riduce richieste Firestore
  });

  // Hook notifiche per prenotazioni in attesa
  const { data: notifications = [] } = useNotifications();
  const pendingBookings = notifications.filter(
    (n) => n?.type === "booking" && !n?.isRead,
  );
  const hasPendingBookings = pendingBookings.length > 0;

  // Persist state changes to sessionStorage
  useEffect(() => {
    sessionStorage.setItem("activeTab", activeTab);
  }, [activeTab]);

  useEffect(() => {
    sessionStorage.setItem("activeBookingSection", activeBookingSection);
  }, [activeBookingSection]);

  useEffect(() => {
    sessionStorage.setItem(
      "activeConsultationSection",
      activeConsultationSection,
    );
  }, [activeConsultationSection]);

  useEffect(() => {
    sessionStorage.setItem("settingsSection", settingsSection);
  }, [settingsSection]);

  useEffect(() => {
    sessionStorage.setItem("activeSitoSection", activeSitoSection);
  }, [activeSitoSection]);

  useEffect(() => {
    sessionStorage.setItem("activeJobSection", activeJobSection);
  }, [activeJobSection]);

  useEffect(() => {
    sessionStorage.setItem("gallerySearchQuery", searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    sessionStorage.setItem("galleryTypeFilter", galleryTypeFilter);
  }, [galleryTypeFilter]);

  useEffect(() => {
    sessionStorage.setItem("gallerySelectionFilter", selectionFilter);
  }, [selectionFilter]);

  useEffect(() => {
    sessionStorage.setItem("galleryJobTypeFilter", galleryJobTypeFilter);
  }, [galleryJobTypeFilter]);

  // Carica JobTypes per il filtro gallerie
  useEffect(() => {
    getActiveJobTypes()
      .then((types) => setDashboardJobTypes(types))
      .catch(console.error);
  }, []);

  // Funzione per pulire l'URL (rimuove query params)
  const cleanDeeplinkUrl = useCallback(() => {
    const cleanPath = window.location.pathname;
    window.history.replaceState({}, "", cleanPath);
  }, []);

  // Callback quando highlight booking è completato
  const handleBookingHighlightComplete = useCallback(() => {
    setHighlightBookingId(null);
    cleanDeeplinkUrl();
  }, [cleanDeeplinkUrl]);

  // Callback quando highlight consultation è completato
  const handleConsultationHighlightComplete = useCallback(() => {
    setHighlightConsultationId(null);
    cleanDeeplinkUrl();
  }, [cleanDeeplinkUrl]);

  // 🔧 Deeplink handler - reagisce a navigate() da wouter usando location tuple
  useEffect(() => {
    const params = new URLSearchParams(location.split("?")[1] || "");
    const tab = params.get("tab");
    const section = params.get("section");
    const booking = params.get("booking");
    const consultation = params.get("consultation");
    const gallery = params.get("gallery");

    // Se non ci sono parametri, esci subito
    if (!tab && !booking && !consultation && !gallery) return;

    const tabMapping: Record<string, string> = {
      prenotazioni: "bookings",
      consulenze: "consulenze",
      gallerie: "galleries",
      clienti: "clienti",
      impostazioni: "settings",
      calendario: "calendario",
      assistente: "assistente",
    };

    const sectionMapping: Record<string, string> = {
      bookings: "bookings-list",
      commesse: "orders",
      "bookings-list": "bookings-list",
      campaigns: "campaigns",
      orders: "orders",
    };

    // Gestione BOOKING (prenotazioni e selezioni)
    // L'URL verrà pulito da handleBookingHighlightComplete quando l'highlight è fatto
    if (booking && tab === "prenotazioni") {
      setActiveTab("bookings");
      setActiveBookingSection("bookings-list");
      sessionStorage.setItem("activeTab", "bookings");
      sessionStorage.setItem("activeBookingSection", "bookings-list");
      // Imposta highlight - BookingsManager gestirà scroll e highlight
      // quando i dati sono pronti, poi chiamerà onHighlightComplete
      setHighlightBookingId(booking);
      return;
    }

    // Gestione CONSULTATION (consulenze)
    // L'URL verrà pulito da handleConsultationHighlightComplete
    if (consultation && tab === "consulenze") {
      setActiveTab("consulenze");
      setActiveConsultationSection("consulenze");
      sessionStorage.setItem("activeTab", "consulenze");
      sessionStorage.setItem("activeConsultationSection", "consulenze");
      setHighlightConsultationId(consultation);
      return;
    }

    // Gestione GALLERY (gallerie) - redirect diretto
    if (gallery && tab === "gallerie") {
      navigate(`/admin/galleries/${gallery}`);
      return;
    }

    // Gestione TAB generica (senza highlight specifico)
    if (tab) {
      const mappedTab = tabMapping[tab] || tab;
      setActiveTab(mappedTab as any);

      if (mappedTab === "bookings" && section) {
        const mappedSection = sectionMapping[section] || section;
        setActiveBookingSection(mappedSection as any);
      }

      if (mappedTab === "consulenze") {
        setActiveConsultationSection("consulenze");
      }

      // Pulisci URL dopo cambio tab (nessun highlight da aspettare)
      cleanDeeplinkUrl();
    }
  }, [location, navigate, cleanDeeplinkUrl]); // Dependency: reagisce a navigate() da wouter

  // Check authentication and referrer gallery
  useEffect(() => {
    // Aspetta che Firebase Auth completi il caricamento
    if (authLoading) {
      return;
    }

    // IMPORTANTE: Ora che il loading è completato, se non c'è user significa che NON è autenticato
    // Verifica localStorage (controllo primario per redirect rapido)
    const localAdminFlag = localStorage.getItem("isAdmin");
    if (!localAdminFlag || !user) {
      // Redirect silenzioso senza errori se non c'è flag localStorage
      if (!localAdminFlag) {
        navigate(createUrl("/admin"));
        return;
      }

      // Se c'è flag localStorage ma non c'è user, mostra errore
      if (!user) {
        console.error("❌ Firebase Auth: utente non autenticato");
        toast({
          variant: "destructive",
          title: "Errore di autenticazione",
          description:
            "Devi essere autenticato come admin per accedere a questa sezione. Effettua il logout e riprova.",
        });
        // Redirect al login admin dopo 2 secondi
        setTimeout(() => {
          localStorage.removeItem("isAdmin");
          navigate(createUrl("/admin"));
        }, 2000);
        return;
      }
    }

    // Verifica email admin
    if (user.email !== "gennaro.mazzacane@gmail.com") {
      console.error("❌ Firebase Auth: utente non admin");
      toast({
        variant: "destructive",
        title: "Accesso negato",
        description: "Non hai i permessi per accedere a questa sezione.",
      });
      setTimeout(() => {
        localStorage.removeItem("isAdmin");
        navigate(createUrl("/admin"));
      }, 2000);
      return;
    }

    console.log("✅ Firebase Auth verificato:", user.email);

    // Controlla se l'admin proviene da una galleria specifica
    const referrerData = sessionStorage.getItem("adminReferrerGallery");
    if (referrerData) {
      try {
        const parsed = JSON.parse(referrerData);
        setReferrerGallery(parsed);
      } catch (e) {
        // Rimuovi dati corrotti e continua silenziosamente
        sessionStorage.removeItem("adminReferrerGallery");
      }
    }
  }, [authLoading, user, isFirebaseAdmin, navigate, toast]);

  // Fetch data (galleries, password requests and studio settings)
  useEffect(() => {
    async function loadAllData() {
      // Gallerie caricate via React Query (vedi hook sopra)

      // Carica richieste password
      try {
        const requestsCollection = collection(db, "passwordRequests");
        const requestsSnapshot = await getDocs(requestsCollection);

        const requestsList = requestsSnapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            timestamp: data.createdAt?.toDate?.() || new Date(),
          };
        });

        // Sort by creation date, newest first
        requestsList.sort(
          (a, b) => b.timestamp.getTime() - a.timestamp.getTime(),
        );

        setPasswordRequests(requestsList);
      } catch (error) {
        console.error("Errore caricamento richieste password:", error);
      }

      // Carica impostazioni studio
      try {
        setIsSettingsLoading(true);
        const settingsDoc = doc(db, "settings", "studio");
        const settingsSnapshot = await getDoc(settingsDoc);

        if (settingsSnapshot.exists()) {
          const settingsData =
            settingsSnapshot.data() as Partial<StudioSettings>;
          // Merge con i valori di default per garantire che tutti i campi siano presenti
          setStudioSettings((prev) => ({
            ...prev,
            ...settingsData,
            socialLinks: { ...prev.socialLinks, ...(settingsData.socialLinks || {}) },
            homepageContent: resolveHomepageContent(settingsData.homepageContent),
          }));
        }
      } catch (error) {
        console.error(
          "Errore nel caricamento delle impostazioni studio:",
          error,
        );
      } finally {
        setIsSettingsLoading(false);
      }
    }

    // Carica dati solo quando autenticazione è completata e user esiste
    if (!authLoading && user) {
      loadAllData();
    }
  }, [authLoading, user]);

  // Funzione per gestire il cambio di valore nei campi delle impostazioni
  const handleSettingsChange = (
    field: string,
    value: string,
    nestedField?: string,
  ) => {
    if (nestedField) {
      setStudioSettings((prev) => ({
        ...prev,
        [field]: {
          ...(prev[field as keyof StudioSettings] as object),
          [nestedField]: value,
        },
      }));
    } else {
      setStudioSettings((prev) => ({
        ...prev,
        [field]: value,
      }));
    }
  };

  const handleHomepageContentChange = <Section extends keyof Omit<HomepageContent, 'version'>>(
    section: Section,
    field: keyof HomepageContent[Section],
    value: string,
  ) => {
    setStudioSettings((prev) => ({
      ...prev,
      homepageContent: {
        ...resolveHomepageContent(prev.homepageContent),
        [section]: {
          ...resolveHomepageContent(prev.homepageContent)[section],
          [field]: value,
        },
      },
    }));
  };

  // Funzione per gestire l'upload del logo
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;

    const file = e.target.files[0];
    // Accetta solo immagini
    if (!file.type.startsWith("image/")) {
      toast({
        title: "Tipo di file non supportato",
        description: "Seleziona un'immagine (PNG, JPG o SVG)",
        variant: "destructive",
      });
      return;
    }

    try {
      // Riferimento allo storage per il logo (path admin: autorizzato dalle Storage Rules).
      // Path fisso: l'overwrite evita l'accumulo di file orfani; Firebase rigenera
      // il token di download ad ogni upload, quindi la cache resta valida.
      const logoRef = ref(storage, `admin/studio-logo`);

      // Upload del file
      await uploadBytes(logoRef, file, { contentType: file.type });

      // Ottieni URL di download
      const downloadUrl = await getDownloadURL(logoRef);

      // Aggiorna lo stato delle impostazioni
      setStudioSettings((prev) => ({
        ...prev,
        logo: downloadUrl,
      }));

      toast({
        title: "Logo caricato",
        description: "Il logo è stato caricato con successo.",
      });
    } catch (error) {
      console.error("[handleLogoUpload] Errore upload logo:", error);
      const message =
        error instanceof Error ? error.message : "Errore sconosciuto";
      toast({
        title: "Errore",
        description: `Caricamento logo non riuscito: ${message}`,
        variant: "destructive",
      });
    }
  };

  // Funzione per effettuare il logout
  const handleLogout = async () => {
    try {
      // Esegui logout da Firebase
      await signOut(auth);
      // Rimuovi il flag di amministratore
      localStorage.removeItem("isAdmin");
      // Reindirizza alla pagina di login usando il percorso assoluto
      navigate(createUrl("/admin"));
    } catch (error) {
      toast({
        title: "Errore",
        description: "Si è verificato un errore durante il logout.",
        variant: "destructive",
      });
    }
  };

  // Funzione per salvare le impostazioni dello studio
  const saveStudioSettings = async () => {
    try {
      const settingsRef = doc(db, "settings", "studio");
      await setDoc(settingsRef, {
        ...studioSettings,
        homepageContent: resolveHomepageContent(studioSettings.homepageContent),
      }, { merge: true });

      toast({
        title: "Impostazioni salvate",
        description:
          "Le impostazioni dello studio sono state salvate con successo.",
      });
    } catch (error) {
      toast({
        title: "Errore",
        description:
          "Si è verificato un errore nel salvataggio delle impostazioni.",
        variant: "destructive",
      });
    }
  };

  const openModal = () => {
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    // Refresh the gallery list via React Query
    queryClient.invalidateQueries({ queryKey: ["galleries", "admin"] });
  };

  const openEditModal = (gallery: GalleryItem) => {
    // Redirect to GalleryManagementWorkspace instead of opening modal
    navigate(`/admin/gallery/${gallery.id}/manage`);
  };

  const closeEditModal = () => {
    setIsEditModalOpen(false);
    setSelectedGallery(null);
    // Refresh the gallery list via React Query
    queryClient.invalidateQueries({ queryKey: ["galleries", "admin"] });
  };

  // Handler: Apri booking specifico e scroll + highlight
  const handleOpenBooking = (bookingId: string) => {
    setHighlightBookingId(bookingId);
    setActiveTab("bookings");
    setActiveBookingSection("bookings-list");
    sessionStorage.setItem("activeTab", "bookings");
    sessionStorage.setItem("activeBookingSection", "bookings-list");
  };

  // Handler: Apri gestione selezioni foto
  const handleOpenPhotoSelection = (gallery: Gallery) => {
    navigate(`/admin/gallery/${gallery.id}/manage`);
  };

  // Verifica se l'utente corrente è admin
  const getCurrentUser = () => auth.currentUser;
  const isCurrentUserAdmin = () => {
    const user = getCurrentUser();
    return user?.email === "gennaro.mazzacane@gmail.com";
  };

  // Error handling per gallerie (React Query)
  useEffect(() => {
    if (galleriesError) {
      console.error("Errore caricamento gallerie:", galleriesError);
      toast({
        title: "Errore",
        description:
          "Si è verificato un errore nel caricamento delle gallerie.",
        variant: "destructive",
      });
    }
  }, [galleriesError, toast]);

  // Elimina una richiesta di password
  const deletePasswordRequest = async (requestId: string) => {
    if (!requestId) return;

    try {
      // Riferimento al documento nella collezione passwordRequests
      const requestRef = doc(db, "passwordRequests", requestId);

      // Elimina il documento
      await deleteDoc(requestRef);

      // Aggiorna lo stato rimuovendo la richiesta eliminata
      setPasswordRequests((prevRequests) =>
        prevRequests.filter((request) => request.id !== requestId),
      );

      toast({
        title: "Richiesta eliminata",
        description: "La richiesta è stata eliminata con successo.",
      });
    } catch (error) {
      toast({
        title: "Errore",
        description: "Si è verificato un errore durante l'eliminazione.",
        variant: "destructive",
      });
    }
  };

  // Esporta le richieste di password in un file Excel
  const exportPasswordRequests = () => {
    try {
      if (passwordRequests.length === 0) {
        toast({
          title: "Nessun dato da esportare",
          description: "Non ci sono richieste di password da esportare.",
          variant: "destructive",
        });
        return;
      }

      // Formatta i dati per l'export
      const formattedData = formatPasswordRequestsForExcel(passwordRequests);

      // Genera nome file con data corrente
      const today = new Date();
      const dateStr = today.toISOString().split("T")[0]; // formato YYYY-MM-DD
      const fileName = `richieste_password_${dateStr}.xlsx`;

      // Esporta in Excel
      exportToExcel(formattedData, fileName, "Richieste Password");

      toast({
        title: "Esportazione completata",
        description: `Le richieste sono state esportate in ${fileName}`,
      });
    } catch (error) {
      toast({
        title: "Errore",
        description:
          "Si è verificato un errore durante l'esportazione delle richieste.",
        variant: "destructive",
      });
    }
  };

  const toggleGalleryStatus = async (gallery: GalleryItem) => {
    try {
      const galleryRef = doc(db, "galleries", gallery.id);
      const newActiveStatus = !gallery.active;

      await updateDoc(galleryRef, {
        active: newActiveStatus,
        updatedAt: new Date(), // Track when the status was changed
      });

      // Update local state via React Query
      queryClient.invalidateQueries({ queryKey: ["galleries", "admin"] });

      toast({
        title: newActiveStatus ? "Galleria attivata" : "Galleria disattivata",
        description: `La galleria "${gallery.name}" è stata ${newActiveStatus ? "attivata" : "disattivata"} con successo.`,
      });
    } catch (error) {
      toast({
        title: "Errore",
        description:
          "Non è stato possibile modificare lo stato della galleria.",
        variant: "destructive",
      });
    }
  };

  const deleteGallery = async (gallery: GalleryItem) => {
    if (
      !window.confirm(
        `Sei sicuro di voler eliminare la galleria "${gallery.name}"? Questa operazione rimuoverà TUTTE le foto e non può essere annullata.`,
      )
    ) {
      return;
    }

    toast({
      title: "Eliminazione in corso",
      description:
        "L'eliminazione della galleria potrebbe richiedere alcuni minuti...",
    });

    try {
      // Array di percorsi dello storage da controllare
      const storagePaths = [
        `gallery-photos/${gallery.id}`,
        `gallery-photos/${gallery.code}`,
        `galleries/${gallery.id}`,
        `galleries/${gallery.code}`,
        `galleries/covers/${gallery.code}_cover`,
      ];

      // Funzione helper per aggiungere un delay
      const delay = (ms: number) =>
        new Promise((resolve) => setTimeout(resolve, ms));

      // 1. Elimina tutti i file dallo Storage in modo più controllato
      for (const path of storagePaths) {
        try {
          const storageRef = ref(storage, path);

          const listResult = await listAll(storageRef);
          if (listResult.items.length > 0) {
            // Dividi l'array in gruppi più piccoli per evitare sovraccarichi
            const chunkSize = 10;
            const chunks = [];

            for (let i = 0; i < listResult.items.length; i += chunkSize) {
              chunks.push(listResult.items.slice(i, i + chunkSize));
            }

            // Elabora un gruppo alla volta con un breve ritardo tra i gruppi
            for (const chunk of chunks) {
              const deletePromises = chunk.map(async (itemRef) => {
                try {
                  await deleteObject(itemRef);
                } catch (deleteError) {}
              });

              await Promise.all(deletePromises);

              // Piccolo ritardo tra i gruppi per evitare throttling
              await delay(500);
            }
          }
        } catch (error) {}
      }

      // Piccolo ritardo prima di procedere con le operazioni sul database
      await delay(1000);

      // 2. Elimina documenti dalle collezioni
      const collections = [
        {
          ref: collection(db, "galleries", gallery.id, "photos"),
          name: "photos",
        },
        {
          ref: collection(db, "galleries", gallery.id, "chapters"),
          name: "chapters",
        },
      ];

      for (const col of collections) {
        try {
          const snapshot = await getDocs(col.ref);

          if (snapshot.docs.length > 0) {
            // Dividi l'eliminazione in gruppi più piccoli
            const chunkSize = 20;
            const chunks = [];

            for (let i = 0; i < snapshot.docs.length; i += chunkSize) {
              chunks.push(snapshot.docs.slice(i, i + chunkSize));
            }

            // Elabora un gruppo alla volta
            for (const chunk of chunks) {
              const deletePromises = chunk.map((doc) => deleteDoc(doc.ref));
              await Promise.all(deletePromises);

              // Piccolo ritardo tra i gruppi
              await delay(500);
            }
          }
        } catch (error) {}
      }

      // Piccolo ritardo prima di procedere
      await delay(1000);

      // 3. Elimina documenti dalla collezione gallery-photos
      try {
        const galleryPhotosRef = collection(db, "gallery-photos");
        const q = query(galleryPhotosRef, where("galleryId", "==", gallery.id));
        const snapshot = await getDocs(q);

        if (snapshot.docs.length > 0) {
          // Dividi l'eliminazione in gruppi più piccoli
          const chunkSize = 20;
          const chunks = [];

          for (let i = 0; i < snapshot.docs.length; i += chunkSize) {
            chunks.push(snapshot.docs.slice(i, i + chunkSize));
          }

          // Elabora un gruppo alla volta
          for (const chunk of chunks) {
            const deletePromises = chunk.map((doc) => deleteDoc(doc.ref));
            await Promise.all(deletePromises);

            // Piccolo ritardo tra i gruppi
            await delay(500);
          }
        }
      } catch (error) {}

      // 3b. CASCADE DELETE: Elimina documenti dalla collezione top-level 'photos'
      try {
        const photosRef = collection(db, "photos");
        const photosQuery = query(
          photosRef,
          where("galleryId", "==", gallery.id),
        );
        const photosSnapshot = await getDocs(photosQuery);

        if (photosSnapshot.docs.length > 0) {
          console.log(
            `🗑️ Eliminando ${photosSnapshot.docs.length} foto dalla collezione photos`,
          );
          const chunkSize = 20;
          const chunks = [];

          for (let i = 0; i < photosSnapshot.docs.length; i += chunkSize) {
            chunks.push(photosSnapshot.docs.slice(i, i + chunkSize));
          }

          for (const chunk of chunks) {
            const deletePromises = chunk.map((doc) => deleteDoc(doc.ref));
            await Promise.all(deletePromises);
            await delay(500);
          }
          console.log(
            `✅ Eliminate ${photosSnapshot.docs.length} foto dalla collezione photos`,
          );
        }
      } catch (error) {
        console.error(
          "Errore eliminazione foto dalla collezione photos:",
          error,
        );
      }

      // Piccolo ritardo prima di eliminare il documento principale
      await delay(500);

      // 4. Elimina il documento principale della galleria
      await deleteDoc(doc(db, "galleries", gallery.id));

      // 5. Aggiorna lo stato locale via React Query
      queryClient.invalidateQueries({ queryKey: ["galleries", "admin"] });

      toast({
        title: "Galleria eliminata",
        description: `La galleria "${gallery.name}" e tutte le sue foto sono state eliminate con successo.`,
      });
    } catch (error) {
      toast({
        title: "Errore",
        description:
          "Non è stato possibile eliminare completamente la galleria. Alcune risorse potrebbero essere rimaste.",
        variant: "destructive",
      });
    }
  };

  // Filtra le gallerie in base alla query di ricerca E tipo (generiche/special)
  const filteredGalleries = galleries.filter((gallery) => {
    // Escludi gallerie senza dati essenziali (documenti vuoti in Firebase)
    if (!gallery.name && !gallery.code) return false;

    // Filtro ricerca testuale
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesSearch =
        (gallery.name?.toLowerCase() || "").includes(query) ||
        (gallery.code?.toLowerCase() || "").includes(query) ||
        (gallery.date?.toLowerCase() || "").includes(query);
      if (!matchesSearch) return false;
    }

    // Filtro selezioni approvate
    if (selectionFilter === "approved") {
      if (gallery.selectionStatus !== "completed") return false;
    }

    // Filtro tipo galleria
    if (galleryTypeFilter === "generic") {
      if (!!gallery.specialTheme) return false; // Generiche = senza specialTheme
    } else if (galleryTypeFilter === "special") {
      if (!gallery.specialTheme) return false; // Special = con specialTheme
    }

    // Filtro per categoria evento (jobType)
    if (galleryJobTypeFilter !== "all") {
      const galleryJobType = (gallery as any).jobType;
      if (galleryJobTypeFilter === "none") {
        if (galleryJobType) return false; // Solo senza categoria
      } else {
        if (galleryJobType !== galleryJobTypeFilter) return false;
      }
    }

    return true; // 'all' mostra tutte
  });

  // Calcola gli indici per la paginazione delle gallerie
  const indexOfLastGallery = currentGalleryPage * galleriesPerPage;
  const indexOfFirstGallery = indexOfLastGallery - galleriesPerPage;
  const currentGalleries = filteredGalleries.slice(
    indexOfFirstGallery,
    indexOfLastGallery,
  );
  const totalGalleryPages = Math.ceil(
    filteredGalleries.length / galleriesPerPage,
  );

  // Gestione del cambio pagina per le gallerie
  const paginateGalleries = (pageNumber: number) =>
    setCurrentGalleryPage(pageNumber);

  // Funzioni per navigare tra le pagine delle gallerie
  const goToNextGalleryPage = () => {
    if (currentGalleryPage < totalGalleryPages) {
      setCurrentGalleryPage(currentGalleryPage + 1);
    }
  };

  const goToPreviousGalleryPage = () => {
    if (currentGalleryPage > 1) {
      setCurrentGalleryPage(currentGalleryPage - 1);
    }
  };

  // Calcola gli indici per la paginazione delle richieste password
  const indexOfLastRequest = currentRequestPage * requestsPerPage;
  const indexOfFirstRequest = indexOfLastRequest - requestsPerPage;
  const currentRequests = passwordRequests.slice(
    indexOfFirstRequest,
    indexOfLastRequest,
  );
  const totalRequestPages = Math.ceil(
    passwordRequests.length / requestsPerPage,
  );

  // Gestione del cambio pagina per le richieste
  const paginateRequests = (pageNumber: number) =>
    setCurrentRequestPage(pageNumber);

  // Funzioni per navigare tra le pagine delle richieste
  const goToNextRequestPage = () => {
    if (currentRequestPage < totalRequestPages) {
      setCurrentRequestPage(currentRequestPage + 1);
    }
  };

  const goToPreviousRequestPage = () => {
    if (currentRequestPage > 1) {
      setCurrentRequestPage(currentRequestPage - 1);
    }
  };

  // Navigazione unificata: usata dalla barra menu e dalla Command Palette
  const navigateToTarget = (target: NavTarget) => {
    if (target.href) {
      if (target.newTab) {
        window.open(target.href, "_blank");
      } else {
        navigate(target.href);
      }
      return;
    }
    if (target.tab) {
      setActiveTab(target.tab as any);
    }
    if (target.bookingSection) {
      setActiveBookingSection(target.bookingSection as any);
    }
    if (target.consultationSection) {
      setActiveConsultationSection(target.consultationSection as any);
    }
    if (target.jobSection) {
      setActiveJobSection(target.jobSection as any);
    }
    if (target.settingsSection) {
      setSettingsSection(target.settingsSection as any);
    }
    if (target.sitoSection) {
      setActiveSitoSection(target.sitoSection as any);
    }
  };

  // Verifica se l'utente è autenticato
  if (!localStorage.getItem("isAdmin")) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-off-white">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sage mx-auto"></div>
          <p className="mt-4 text-blue-gray">Verifica autenticazione...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-off-white">
      <Navigation isAdminNav={true} />

      <header className="bg-white shadow sticky top-0 z-40">
        <div className="max-w-7xl mx-auto py-3 px-3 sm:py-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center gap-2">
            {/* Titolo responsive */}
            <h1 className="text-base sm:text-xl md:text-2xl font-bold text-blue-gray truncate">
              <span className="hidden sm:inline">Dashboard amministratore</span>
              <span className="sm:hidden">Admin</span>
            </h1>

            {/* Azioni header - Mobile Optimized */}
            <div className="flex items-center gap-1.5 sm:gap-3">
              <AdminCommandPalette onNavigate={navigateToTarget} />
              <Link href={createUrl("/")}>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 sm:h-9 px-2 sm:px-3 flex items-center gap-1"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                    />
                  </svg>
                  <span className="text-xs sm:text-sm">Home</span>
                </Button>
              </Link>
              <NotificationBell />
              <Button
                variant="destructive"
                size="sm"
                onClick={handleLogout}
                className="h-8 sm:h-9 px-2 sm:px-3 text-xs sm:text-sm"
              >
                Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Banner informativo se l'admin proviene da una galleria */}
      {referrerGallery && (
        <div className="bg-sage text-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
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
                <span className="text-sm font-medium">
                  Sei arrivato dalla galleria:{" "}
                  <strong>{referrerGallery.name}</strong>
                </span>
                {referrerGallery.code && (
                  <Link to={createUrl(`/gallery/${referrerGallery.code}`)}>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-white hover:text-gray-200 ml-2"
                    >
                      <svg
                        className="h-4 w-4 mr-1"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M10 19l-7-7m0 0l7-7m-7 7h18"
                        />
                      </svg>
                      Torna alla galleria
                    </Button>
                  </Link>
                )}
              </div>
              <button
                onClick={() => {
                  sessionStorage.removeItem("adminReferrerGallery");
                  setReferrerGallery(null);
                }}
                className="text-white hover:text-gray-200 transition"
                aria-label="Chiudi banner"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🔔 Banner prominente per prenotazioni in attesa di approvazione */}
      {hasPendingBookings && (
        <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500 text-white animate-pulse">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-4">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <CalendarCheck className="h-6 w-6 sm:h-7 sm:w-7" />
                  <span className="absolute -top-1 -right-1 bg-white text-orange-600 text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
                    {pendingBookings.length}
                  </span>
                </div>
                <div>
                  <p className="font-bold text-sm sm:text-base">
                    {pendingBookings.length === 1
                      ? "Hai 1 nuova prenotazione da approvare!"
                      : `Hai ${pendingBookings.length} nuove prenotazioni da approvare!`}
                  </p>
                  <p className="text-xs sm:text-sm opacity-90">
                    {pendingBookings[0]?.description}
                  </p>
                </div>
              </div>
              <Button
                onClick={() => {
                  const firstPending = pendingBookings[0];
                  if (firstPending?.resourceId) {
                    setActiveTab("bookings");
                    setActiveBookingSection("bookings-list");
                    setHighlightBookingId(firstPending.resourceId);
                  }
                }}
                variant="secondary"
                size="sm"
                className="bg-white text-orange-600 hover:bg-orange-100 font-semibold shadow-lg whitespace-nowrap"
                data-testid="button-go-to-pending-booking"
              >
                <CalendarCheck className="h-4 w-4 mr-2" />
                Vai alla prenotazione
              </Button>
            </div>
          </div>
        </div>
      )}

      <main>
        <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
          <Tabs
            defaultValue="calendario"
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as any)}
          >
            {/* Barra menu unificata: generata da ADMIN_NAV_GROUPS (adminNavigation.ts) */}
            <div className="mb-4 sm:mb-6 flex flex-wrap justify-start gap-0.5 sm:gap-1 h-auto p-1 bg-muted rounded-lg overflow-x-auto touch-manipulation">
              {ADMIN_NAV_GROUPS.map((group) => {
                const GroupIcon = group.icon;
                const isActive = group.tabs.includes(activeTab);
                const triggerClasses =
                  "flex-shrink-0 px-1.5 py-1.5 sm:px-2 sm:py-1.5 text-[10px] sm:text-xs md:text-sm md:px-3 md:py-2 whitespace-nowrap flex items-center gap-1 sm:gap-2 min-h-[36px] sm:min-h-[40px]";

                if (!group.items) {
                  return (
                    <Button
                      key={group.id}
                      variant={isActive ? "default" : "ghost"}
                      className={triggerClasses}
                      onClick={() =>
                        group.target && navigateToTarget(group.target)
                      }
                      data-testid={`nav-${group.id}`}
                    >
                      <GroupIcon className="h-3 w-3 sm:h-3.5 sm:w-3.5 md:h-4 md:w-4 flex-shrink-0" />
                      <span>{group.label}</span>
                    </Button>
                  );
                }

                return (
                  <DropdownMenu key={group.id}>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant={isActive ? "default" : "ghost"}
                        className={triggerClasses}
                        data-testid={`nav-${group.id}`}
                      >
                        <GroupIcon className="h-3 w-3 sm:h-3.5 sm:w-3.5 md:h-4 md:w-4 flex-shrink-0" />
                        <span>{group.label}</span>
                        <ChevronDown className="h-2.5 w-2.5 sm:h-3 sm:w-3 ml-0.5 sm:ml-1" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-60">
                      {group.items.map((item, index) => {
                        const ItemIcon = item.icon;
                        return (
                          <div key={item.id}>
                            {item.sectionLabel && (
                              <>
                                {index > 0 && <DropdownMenuSeparator />}
                                <DropdownMenuLabel className="text-xs text-muted-foreground">
                                  {item.sectionLabel}
                                </DropdownMenuLabel>
                              </>
                            )}
                            <DropdownMenuItem
                              onClick={() => navigateToTarget(item.target)}
                              data-testid={`nav-item-${item.id}`}
                            >
                              <ItemIcon className="h-4 w-4 mr-2" />
                              <span className="flex-1">{item.label}</span>
                              {item.target.newTab && (
                                <ExternalLink className="h-3.5 w-3.5 ml-2 text-muted-foreground" />
                              )}
                            </DropdownMenuItem>
                          </div>
                        );
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>
                );
              })}
            </div>

            {/* Contenuto Tab Calendario */}
            <TabsContent value="calendario">
              <div className="space-y-6">
                {/* Riepilogo Lavori del Giorno */}
                <TodayJobsSummary />

                {/* Calendario e Promemoria */}
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                  <div className="lg:col-span-3">
                    <CalendarioManager />
                  </div>
                  <div className="lg:col-span-1">
                    <ReminderManager />
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Contenuto Tab Assistente Studio - Vista Completa (Lazy loaded) */}
            <TabsContent value="assistente">
              <Suspense
                fallback={
                  <Card>
                    <CardHeader>
                      <Skeleton className="h-6 w-48" />
                      <Skeleton className="h-4 w-64 mt-2" />
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <Skeleton className="h-24 w-full" />
                      <Skeleton className="h-24 w-full" />
                      <Skeleton className="h-24 w-full" />
                    </CardContent>
                  </Card>
                }
              >
                <StudioAssistant mode="full" showHeader={true} />
              </Suspense>
            </TabsContent>

            {/* Gallerie Tab */}
            <TabsContent value="galleries">
              <div className="space-y-4">
                {/* Header con statistiche - Collapsibile */}
                <Collapsible
                  open={galleriesExpanded}
                  onOpenChange={setGalleriesExpanded}
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <CollapsibleTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="p-0 h-auto"
                        >
                          {galleriesExpanded ? (
                            <ChevronDown className="h-5 w-5" />
                          ) : (
                            <ChevronRightIcon className="h-5 w-5" />
                          )}
                        </Button>
                      </CollapsibleTrigger>
                      <div>
                        <h2 className="text-2xl font-bold text-blue-gray">
                          📸 Gestione Gallerie
                        </h2>
                        <p className="text-sm text-muted-foreground">
                          {referrerGallery && (
                            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-light-mint text-dark-sage text-xs font-medium mb-2">
                              <span>
                                🔗 Collegato da: {referrerGallery.name}
                              </span>
                              {referrerGallery.code && (
                                <code className="text-[10px] bg-mint px-1.5 py-0.5 rounded">
                                  {referrerGallery.code}
                                </code>
                              )}
                              <button
                                onClick={() => {
                                  sessionStorage.removeItem(
                                    "adminReferrerGallery",
                                  );
                                  setReferrerGallery(null);
                                }}
                                className="ml-1 hover:text-blue-gray"
                                title="Rimuovi collegamento"
                              >
                                ✕
                              </button>
                            </span>
                          )}
                          {galleries.length} gallerie totali
                        </p>
                      </div>
                    </div>
                  </div>

                  <CollapsibleContent>
                    <div className="bg-off-white shadow sm:rounded-lg p-5">
                      <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
                        <div className="w-full sm:w-auto">
                          <h3 className="text-xl font-semibold text-blue-gray mb-2">
                            Gallerie Eventi
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            Crea, modifica e gestisci le gallerie fotografiche.
                          </p>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                          <div className="relative w-full sm:w-60">
                            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                              placeholder="Cerca gallerie..."
                              className="pl-8"
                              value={searchQuery}
                              onChange={(e) => setSearchQuery(e.target.value)}
                            />
                          </div>
                          <Button
                            onClick={openModal}
                            className="whitespace-nowrap"
                          >
                            <Plus className="mr-2 h-4 w-4" /> Nuova Galleria
                            Evento
                          </Button>
                        </div>
                      </div>

                      {/* 🎨 Filtri Tipo Galleria - Migliorati per mobile */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                        {/* Filtro Tipo Galleria */}
                        <div className="space-y-2">
                          <label className="text-xs font-medium text-dark-sage uppercase tracking-wider">
                            Tipo Galleria
                          </label>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              variant={
                                galleryTypeFilter === "generic"
                                  ? "default"
                                  : "outline"
                              }
                              size="sm"
                              onClick={() => setGalleryTypeFilter("generic")}
                              className="flex-1 sm:flex-initial min-w-[100px] flex items-center justify-center gap-2 transition-all"
                              data-testid="filter-generic-galleries"
                            >
                              <Home className="h-4 w-4" />
                              <span className="text-xs sm:text-sm">
                                Generiche
                              </span>
                            </Button>
                            <Button
                              variant={
                                galleryTypeFilter === "special"
                                  ? "default"
                                  : "outline"
                              }
                              size="sm"
                              onClick={() => setGalleryTypeFilter("special")}
                              className="flex-1 sm:flex-initial min-w-[100px] flex items-center justify-center gap-2 transition-all"
                              data-testid="filter-special-galleries"
                            >
                              <Palette className="h-4 w-4" />
                              <span className="text-xs sm:text-sm">
                                Tematiche
                              </span>
                            </Button>
                            <Button
                              variant={
                                galleryTypeFilter === "all"
                                  ? "default"
                                  : "outline"
                              }
                              size="sm"
                              onClick={() => setGalleryTypeFilter("all")}
                              className="flex-1 sm:flex-initial min-w-[100px] flex items-center justify-center gap-2 transition-all"
                              data-testid="filter-all-galleries"
                            >
                              <List className="h-4 w-4" />
                              <span className="text-xs sm:text-sm">Tutte</span>
                            </Button>
                          </div>
                        </div>

                        {/* Filtro Selezioni */}
                        <div className="space-y-2">
                          <label className="text-xs font-medium text-dark-sage uppercase tracking-wider">
                            Selezioni Foto
                          </label>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              variant={
                                selectionFilter === "all"
                                  ? "default"
                                  : "outline"
                              }
                              size="sm"
                              onClick={() => setSelectionFilter("all")}
                              className="flex-1 sm:flex-initial min-w-[100px] flex items-center justify-center gap-2 transition-all"
                              data-testid="filter-all-selections"
                            >
                              <Camera className="h-4 w-4" />
                              <span className="text-xs sm:text-sm">Tutte</span>
                            </Button>
                            <Button
                              variant={
                                selectionFilter === "approved"
                                  ? "default"
                                  : "outline"
                              }
                              size="sm"
                              onClick={() => setSelectionFilter("approved")}
                              className="flex-1 sm:flex-initial min-w-[140px] flex items-center justify-center gap-2 transition-all bg-light-mint hover:bg-mint border-sage text-dark-sage"
                              data-testid="filter-approved-selections"
                            >
                              <CheckCircle className="h-4 w-4" />
                              <span className="text-xs sm:text-sm">
                                Approvate
                              </span>
                            </Button>
                          </div>
                        </div>
                      </div>

                      {/* Filtro Categoria Evento */}
                      {dashboardJobTypes.length > 0 && (
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <span className="text-xs font-medium text-dark-sage uppercase tracking-wider mr-1">
                            Categoria:
                          </span>
                          <button
                            onClick={() => setGalleryJobTypeFilter("all")}
                            className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${galleryJobTypeFilter === "all" ? "bg-sage text-white border-sage" : "bg-off-white text-dark-sage border-beige hover:border-sage"}`}
                          >
                            Tutte
                          </button>
                          <button
                            onClick={() => setGalleryJobTypeFilter("none")}
                            className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${galleryJobTypeFilter === "none" ? "bg-blue-gray text-white border-blue-gray" : "bg-off-white text-dark-sage border-beige hover:border-blue-gray"}`}
                          >
                            Senza cat.
                          </button>
                          {dashboardJobTypes.map((jt) => (
                            <button
                              key={jt.slug}
                              onClick={() => setGalleryJobTypeFilter(jt.slug)}
                              className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${galleryJobTypeFilter === jt.slug ? "bg-terracotta text-white border-terracotta" : "bg-off-white text-dark-sage border-beige hover:border-terracotta"}`}
                            >
                              {jt.icona ? `${jt.icona} ` : ""}
                              {jt.nome}
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Skeleton loader durante il caricamento */}
                      {isLoading ? (
                        <div className="space-y-4">
                          {[...Array(3)].map((_, i) => (
                            <div key={i} className="mb-4">
                              <Skeleton className="h-10 w-full mb-2" />
                              <Skeleton className="h-6 w-4/5" />
                            </div>
                          ))}
                        </div>
                      ) : galleries.length === 0 ? (
                        <div className="p-8 text-center">
                          <p className="text-gray-500">
                            Nessuna galleria eventi trovata.
                          </p>
                          <Button
                            onClick={openModal}
                            variant="outline"
                            className="mt-4"
                          >
                            <Plus className="mr-2 h-4 w-4" /> Crea la tua prima
                            galleria evento
                          </Button>
                        </div>
                      ) : (
                        <>
                          {/* Vista Desktop - Tabella */}
                          <div className="hidden lg:block overflow-x-auto">
                            <table className="min-w-full divide-y divide-beige">
                              <thead className="bg-cream/40">
                                <tr>
                                  <th
                                    scope="col"
                                    className="px-4 py-3 text-left text-xs font-medium text-dark-sage uppercase tracking-wider"
                                  >
                                    Nome
                                  </th>
                                  <th
                                    scope="col"
                                    className="px-4 py-3 text-left text-xs font-medium text-dark-sage uppercase tracking-wider"
                                  >
                                    Codice
                                  </th>
                                  <th
                                    scope="col"
                                    className="px-4 py-3 text-left text-xs font-medium text-dark-sage uppercase tracking-wider"
                                  >
                                    Data
                                  </th>
                                  <th
                                    scope="col"
                                    className="px-4 py-3 text-left text-xs font-medium text-dark-sage uppercase tracking-wider"
                                  >
                                    Foto
                                  </th>
                                  <th
                                    scope="col"
                                    className="px-4 py-3 text-left text-xs font-medium text-dark-sage uppercase tracking-wider"
                                  >
                                    Selezione
                                  </th>
                                  <th
                                    scope="col"
                                    className="px-4 py-3 text-left text-xs font-medium text-dark-sage uppercase tracking-wider"
                                  >
                                    Stato
                                  </th>
                                  <th
                                    scope="col"
                                    className="px-4 py-3 text-left text-xs font-medium text-dark-sage uppercase tracking-wider"
                                  >
                                    Azioni
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="bg-off-white divide-y divide-beige">
                                {currentGalleries.map((gallery) => (
                                  <tr
                                    key={gallery.id}
                                    className="hover:bg-light-mint/40 transition-colors"
                                  >
                                    <td className="px-4 py-4">
                                      <div className="text-sm font-medium text-blue-gray">
                                        {gallery.name}
                                      </div>
                                      {(gallery as any).jobType &&
                                        (() => {
                                          const jt = dashboardJobTypes.find(
                                            (t) =>
                                              t.slug ===
                                              (gallery as any).jobType,
                                          );
                                          return (
                                            <span className="inline-flex items-center gap-0.5 mt-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-terracotta/10 text-terracotta border border-terracotta/20">
                                              {jt?.icona && (
                                                <span>{jt.icona}</span>
                                              )}
                                              {jt?.nome ||
                                                (gallery as any).jobType}
                                            </span>
                                          );
                                        })()}
                                    </td>
                                    <td className="px-4 py-4">
                                      <code className="text-xs bg-cream/60 text-blue-gray px-2 py-1 rounded">
                                        {gallery.code}
                                      </code>
                                    </td>
                                    <td className="px-4 py-4 whitespace-nowrap">
                                      <div className="text-sm text-dark-sage">
                                        {gallery.date}
                                      </div>
                                    </td>
                                    <td className="px-4 py-4 whitespace-nowrap">
                                      <span className="text-sm font-semibold text-blue-gray">
                                        {gallery.photoCount || 0}
                                      </span>
                                    </td>
                                    <td className="px-4 py-4 whitespace-nowrap">
                                      {gallery.selectionStatus ===
                                      "completed" ? (
                                        <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-light-mint text-dark-sage">
                                          ✅ Completata
                                        </span>
                                      ) : gallery.selectionEnabled ? (
                                        <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-cream/70 text-terracotta">
                                          ⏳ In attesa
                                        </span>
                                      ) : (
                                        <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-beige/50 text-dark-sage">
                                          -
                                        </span>
                                      )}
                                    </td>
                                    <td className="px-4 py-4 whitespace-nowrap">
                                      <span
                                        className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                          gallery.active
                                            ? "bg-light-mint text-dark-sage"
                                            : "bg-terracotta/15 text-terracotta"
                                        }`}
                                      >
                                        {gallery.active
                                          ? "Attiva"
                                          : "Disattivata"}
                                      </span>
                                    </td>
                                    <td className="px-4 py-4 whitespace-nowrap">
                                      <div className="flex gap-1">
                                        <Link
                                          to={createUrl(
                                            `/gallery/${gallery.code}`,
                                          )}
                                        >
                                          <Button
                                            variant="outline"
                                            size="icon"
                                            className="h-9 w-9 bg-light-mint hover:bg-mint border-sage transition-colors"
                                            title="Visualizza galleria (bypass admin)"
                                          >
                                            <Eye className="h-4 w-4 text-dark-sage" />
                                          </Button>
                                        </Link>
                                        <ShareGalleryButton
                                          galleryId={gallery.id}
                                          galleryCode={gallery.code}
                                          galleryName={gallery.name}
                                          clienteId={(gallery as any).clienteId}
                                        />
                                        {isWeddingJobType(gallery.jobType) && (
                                          <Link
                                            to={createUrl(
                                              `/admin/gallery/${gallery.id}/manage?tab=real-wedding`,
                                            )}
                                          >
                                            <Button
                                              variant="outline"
                                              size="icon"
                                              className="h-9 w-9 bg-cream/60 hover:bg-cream border-terracotta/40 transition-colors"
                                              title="Apri la storia Real Wedding"
                                              data-testid={`button-real-wedding-${gallery.id}`}
                                            >
                                              <BookOpen className="h-4 w-4 text-terracotta" />
                                            </Button>
                                          </Link>
                                        )}
                                        {gallery.jobId && (
                                          <Link to={createUrl(`/admin/jobs/${gallery.jobId}`)}>
                                            <Button
                                              variant="outline"
                                              size="icon"
                                              className="h-9 w-9 bg-mint/60 hover:bg-mint border-sage transition-colors"
                                              title="Apri il lavoro associato"
                                              data-testid={`button-linked-job-${gallery.id}`}
                                            >
                                              <Briefcase className="h-4 w-4 text-dark-sage" />
                                            </Button>
                                          </Link>
                                        )}
                                        {isCurrentUserAdmin() && (
                                          <Link
                                            to={createUrl(
                                              `/admin/gallery/${gallery.id}/manage`,
                                            )}
                                          >
                                            <Button
                                              variant="outline"
                                              size="icon"
                                              className="h-9 w-9 bg-blue-gray/10 hover:bg-blue-gray/20 border-blue-gray/30 transition-colors"
                                              title="Gestisci galleria"
                                              data-testid="button-manage-gallery"
                                            >
                                              <FolderOpen className="h-4 w-4 text-blue-gray" />
                                            </Button>
                                          </Link>
                                        )}
                                        <Button
                                          variant={
                                            gallery.active
                                              ? "destructive"
                                              : "default"
                                          }
                                          size="icon"
                                          className="h-9 w-9 transition-colors"
                                          onClick={() =>
                                            toggleGalleryStatus(gallery)
                                          }
                                          title={
                                            gallery.active
                                              ? "Disattiva galleria"
                                              : "Attiva galleria"
                                          }
                                        >
                                          {gallery.active ? (
                                            <EyeOff className="h-4 w-4" />
                                          ) : (
                                            <Eye className="h-4 w-4" />
                                          )}
                                        </Button>
                                        <Link
                                          to={createUrl(
                                            `/admin/galleries/${gallery.id}/questionnaire`,
                                          )}
                                        >
                                          <Button
                                            variant="outline"
                                            size="icon"
                                            className="h-9 w-9 bg-cream/60 hover:bg-cream border-terracotta/40 transition-colors"
                                            title="Gestisci questionario"
                                          >
                                            <HelpCircle className="h-4 w-4 text-terracotta" />
                                          </Button>
                                        </Link>
                                        <Button
                                          variant="destructive"
                                          size="icon"
                                          className="h-9 w-9 transition-colors"
                                          onClick={() => deleteGallery(gallery)}
                                          title="Elimina galleria"
                                        >
                                          <Trash className="h-4 w-4" />
                                        </Button>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>

                          {/* Vista Mobile/Tablet - Card */}
                          <div className="lg:hidden space-y-4">
                            {currentGalleries.map((gallery) => (
                              <div
                                key={gallery.id}
                                className="bg-off-white border border-beige rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow"
                              >
                                <div className="flex items-start justify-between mb-3">
                                  <div className="flex-1 min-w-0">
                                    <h3 className="text-base font-semibold text-blue-gray truncate">
                                      {gallery.name}
                                    </h3>
                                    <div className="flex items-center gap-2 mt-1">
                                      <code className="text-xs bg-cream/60 text-blue-gray px-2 py-1 rounded">
                                        {gallery.code}
                                      </code>
                                      <span
                                        className={`px-2 py-1 inline-flex text-xs font-semibold rounded-full ${
                                          gallery.active
                                            ? "bg-light-mint text-dark-sage"
                                            : "bg-terracotta/15 text-terracotta"
                                        }`}
                                      >
                                        {gallery.active ? "✓ Attiva" : "✕ Off"}
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3 text-sm mb-3">
                                  <div>
                                    <span className="text-dark-sage">Data:</span>
                                    <p className="font-medium text-blue-gray">
                                      {gallery.date}
                                    </p>
                                  </div>
                                  <div>
                                    <span className="text-dark-sage">Foto:</span>
                                    <p className="font-semibold text-blue-gray">
                                      {gallery.photoCount || 0}
                                    </p>
                                  </div>
                                  <div className="col-span-2">
                                    <span className="text-dark-sage block mb-1">
                                      Selezione:
                                    </span>
                                    {gallery.selectionStatus === "completed" ? (
                                      <span className="px-3 py-1 inline-flex text-xs font-semibold rounded-full bg-light-mint text-dark-sage">
                                        ✅ Completata
                                      </span>
                                    ) : gallery.selectionEnabled ? (
                                      <span className="px-3 py-1 inline-flex text-xs font-semibold rounded-full bg-cream/70 text-terracotta">
                                        ⏳ In attesa
                                      </span>
                                    ) : (
                                      <span className="px-3 py-1 inline-flex text-xs font-semibold rounded-full bg-beige/50 text-dark-sage">
                                        Non attiva
                                      </span>
                                    )}
                                  </div>
                                </div>

                                <div className="flex flex-wrap gap-2 pt-3 border-t border-beige">
                                  <Link
                                    to={createUrl(`/gallery/${gallery.code}`)}
                                    target="_blank"
                                    className="flex-1 min-w-[120px]"
                                  >
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="w-full bg-light-mint hover:bg-mint border-sage text-dark-sage"
                                    >
                                      <Eye className="h-4 w-4 mr-1" />
                                      Visualizza
                                    </Button>
                                  </Link>
                                  {isCurrentUserAdmin() && (
                                    <Link
                                      to={createUrl(
                                        `/admin/gallery/${gallery.id}/manage`,
                                      )}
                                      className="flex-1 min-w-[120px]"
                                    >
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="w-full bg-blue-gray/10 hover:bg-blue-gray/20 border-blue-gray/30 text-blue-gray"
                                        data-testid="button-manage-gallery"
                                      >
                                        <FolderOpen className="h-4 w-4 mr-1" />
                                        Gestisci
                                      </Button>
                                    </Link>
                                  )}
                                  <ShareGalleryButton
                                    galleryId={gallery.id}
                                    galleryCode={gallery.code}
                                    galleryName={gallery.name}
                                    clienteId={(gallery as any).clienteId}
                                    variant="button"
                                    size="sm"
                                    className="flex-1 min-w-[100px]"
                                  />
                                  {isWeddingJobType(gallery.jobType) && (
                                    <Link
                                      to={createUrl(
                                        `/admin/gallery/${gallery.id}/manage?tab=real-wedding`,
                                      )}
                                      className="flex-1 min-w-[140px]"
                                    >
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="w-full bg-cream/60 hover:bg-cream border-terracotta/40 text-terracotta"
                                        data-testid={`button-real-wedding-${gallery.id}`}
                                      >
                                        <BookOpen className="h-4 w-4 mr-1" />
                                        Real Wedding
                                      </Button>
                                    </Link>
                                  )}
                                  {gallery.jobId && (
                                    <Link
                                      to={createUrl(`/admin/jobs/${gallery.jobId}`)}
                                      className="flex-1 min-w-[120px]"
                                    >
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="w-full bg-mint/60 hover:bg-mint border-sage text-dark-sage"
                                        data-testid={`button-linked-job-${gallery.id}`}
                                      >
                                        <Briefcase className="h-4 w-4 mr-1" />
                                        Lavoro
                                      </Button>
                                    </Link>
                                  )}
                                  <Button
                                    variant={
                                      gallery.active ? "destructive" : "default"
                                    }
                                    size="sm"
                                    className="flex-1 min-w-[100px]"
                                    onClick={() => toggleGalleryStatus(gallery)}
                                  >
                                    {gallery.active ? (
                                      <EyeOff className="h-4 w-4 mr-1" />
                                    ) : (
                                      <Eye className="h-4 w-4 mr-1" />
                                    )}
                                    {gallery.active ? "Disattiva" : "Attiva"}
                                  </Button>
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="flex-1 min-w-[80px]"
                                      >
                                        Altro
                                        <ChevronRight className="h-4 w-4 ml-1" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      <DropdownMenuItem asChild>
                                        <Link
                                          to={createUrl(
                                            `/admin/galleries/${gallery.id}/questionnaire`,
                                          )}
                                        >
                                          <HelpCircle className="h-4 w-4 mr-2" />
                                          Questionario
                                        </Link>
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        onClick={() => deleteGallery(gallery)}
                                        className="text-red-600"
                                      >
                                        <Trash className="h-4 w-4 mr-2" />
                                        Elimina
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </div>
                              </div>
                            ))}
                          </div>
                        </>
                      )}

                      {/* Controlli di paginazione per le gallerie */}
                      <PaginationControls
                        currentPage={currentGalleryPage}
                        totalPages={totalGalleryPages}
                        onPageChange={paginateGalleries}
                        onPrevious={goToPreviousGalleryPage}
                        onNext={goToNextGalleryPage}
                      />
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>
            </TabsContent>

            {/* Contenuto Tab Questionari */}
            <TabsContent value="questionnaire">
              <div className="bg-white shadow sm:rounded-lg p-5">
                <div className="mb-6">
                  <h2 className="text-xl font-semibold text-blue-gray mb-2">
                    Gestione Questionari
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Crea e gestisci questionari per sposi con generazione link
                    sicuri e export ChatGPT.
                  </p>
                </div>
                <QuestionnaireManager />
              </div>
            </TabsContent>

            {/* Contenuto Tab Fotolibri */}
            <TabsContent value="photobooks">
              <div className="bg-white shadow sm:rounded-lg p-5">
                <div className="mb-6">
                  <h2 className="text-xl font-semibold text-blue-gray mb-2">
                    Fotolibri
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Carica le pagine del fotolibro, verifica le foto
                    riconosciute e condividi il link di revisione con il
                    cliente.
                  </p>
                </div>
                <PhotobooksManager />
              </div>
            </TabsContent>

            {/* Contenuto Tab Modifiche Fotolibro */}
            <TabsContent value="photobook-changes">
              <div className="bg-white shadow sm:rounded-lg p-5">
                <div className="mb-6">
                  <h2 className="text-xl font-semibold text-blue-gray mb-2">
                    Modifiche Fotolibro
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Richieste di modifica inviate dai clienti, raggruppate per
                    cliente e versione del fotolibro.
                  </p>
                </div>
                <PhotobookChangesScreen />
              </div>
            </TabsContent>

            {/* Contenuto Tab Temi Stagionali */}
            <TabsContent value="themes">
              <div className="bg-white shadow sm:rounded-lg p-5">
                <div className="mb-6">
                  <h2 className="text-xl font-semibold text-blue-gray mb-2">
                    Temi Stagionali
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Visualizza i temi disponibili e le gallerie associate. I
                    temi possono essere assegnati durante la creazione di una
                    galleria.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {getAllThemes().map((theme) => {
                    const galleriesWithTheme = galleries.filter(
                      (g) => g.specialTheme === theme.id,
                    );

                    return (
                      <Card
                        key={theme.id}
                        className="border-2"
                        style={{ borderColor: theme.colors.primary + "30" }}
                      >
                        <CardHeader className="pb-3">
                          <div className="flex items-center gap-3">
                            <span className="text-3xl">{theme.icon}</span>
                            <div>
                              <CardTitle className="text-lg">
                                {theme.name}
                              </CardTitle>
                              {theme.description && (
                                <CardDescription className="text-xs mt-1">
                                  {theme.description}
                                </CardDescription>
                              )}
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div className="flex items-center gap-2 text-sm">
                            <div
                              className="w-4 h-4 rounded-full border"
                              style={{ backgroundColor: theme.colors.primary }}
                            />
                            <span className="text-xs text-muted-foreground">
                              Colore principale
                            </span>
                          </div>

                          <div className="pt-2 border-t">
                            <p className="text-xs font-medium text-muted-foreground mb-2">
                              Gallerie con questo tema:{" "}
                              {galleriesWithTheme.length}
                            </p>
                            {galleriesWithTheme.length > 0 && (
                              <div className="space-y-1">
                                {galleriesWithTheme
                                  .slice(0, 3)
                                  .map((gallery) => (
                                    <div
                                      key={gallery.id}
                                      className="text-xs bg-muted p-2 rounded flex items-center justify-between"
                                    >
                                      <span className="font-medium truncate">
                                        {gallery.name}
                                      </span>
                                      {gallery.hasSpecialPin && (
                                        <span className="ml-2 px-2 py-0.5 bg-primary/10 text-primary rounded text-xs font-mono">
                                          PIN protetto
                                        </span>
                                      )}
                                    </div>
                                  ))}
                                {galleriesWithTheme.length > 3 && (
                                  <p className="text-xs text-muted-foreground pt-1">
                                    +{galleriesWithTheme.length - 3} altre...
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>

                <div className="mt-8 p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
                  <h3 className="font-medium text-blue-900 dark:text-blue-100 mb-2">
                    Come usare i temi stagionali
                  </h3>
                  <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1 list-disc list-inside">
                    <li>Crea una nuova galleria dal tab "Gallerie"</li>
                    <li>Seleziona un tema stagionale dal dropdown</li>
                    <li>Assegna un PIN univoco per l'accesso</li>
                    <li>
                      La galleria sarà accessibile tramite la sezione "Gallerie
                      Speciali" in homepage
                    </li>
                  </ul>
                </div>
              </div>
            </TabsContent>

            {/* Contenuto Tab Richieste Password */}
            <TabsContent value="requests">
              <div className="space-y-4">
                <Collapsible
                  open={requestsExpanded}
                  onOpenChange={setRequestsExpanded}
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <CollapsibleTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="p-0 h-auto"
                        >
                          {requestsExpanded ? (
                            <ChevronDown className="h-5 w-5" />
                          ) : (
                            <ChevronRightIcon className="h-5 w-5" />
                          )}
                        </Button>
                      </CollapsibleTrigger>
                      <div>
                        <h2 className="text-2xl font-bold text-blue-gray">
                          🔑 Richieste Password
                        </h2>
                        <p className="text-sm text-muted-foreground">
                          {passwordRequests.length} richieste totali
                        </p>
                      </div>
                    </div>

                    <Button
                      onClick={exportPasswordRequests}
                      disabled={passwordRequests.length === 0}
                    >
                      <Download className="mr-2 h-4 w-4" /> Esporta in Excel
                    </Button>
                  </div>

                  <CollapsibleContent>
                    <div className="bg-white shadow sm:rounded-lg p-5">
                      {passwordRequests.length === 0 ? (
                        <div className="p-8 text-center">
                          <p className="text-gray-500">
                            Nessuna richiesta di password ricevuta.
                          </p>
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                              <tr>
                                <th
                                  scope="col"
                                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                                >
                                  Data
                                </th>
                                <th
                                  scope="col"
                                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                                >
                                  Nome
                                </th>
                                <th
                                  scope="col"
                                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                                >
                                  Email
                                </th>
                                <th
                                  scope="col"
                                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                                >
                                  Galleria
                                </th>
                                <th
                                  scope="col"
                                  className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider"
                                >
                                  Azioni
                                </th>
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                              {currentRequests.map((request) => (
                                <tr key={request.id}>
                                  <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="text-sm text-gray-500">
                                      {request.timestamp.toLocaleDateString()}
                                    </div>
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="text-sm font-medium text-gray-900">
                                      {request.firstName} {request.lastName}
                                    </div>
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="text-sm text-gray-500">
                                      {request.email}
                                    </div>
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap">
                                    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                                      {request.galleryCode}
                                    </span>
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() =>
                                        deletePasswordRequest(request.id)
                                      }
                                      className="text-red-600 hover:text-red-900"
                                    >
                                      <Trash className="h-4 w-4 mr-1" />
                                      <span>Elimina</span>
                                    </Button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>

                          {/* Paginazione */}
                          <PaginationControls
                            currentPage={currentRequestPage}
                            totalPages={totalRequestPages}
                            onPageChange={setCurrentRequestPage}
                            onPrevious={() =>
                              setCurrentRequestPage((p) => Math.max(1, p - 1))
                            }
                            onNext={() =>
                              setCurrentRequestPage((p) =>
                                Math.min(totalRequestPages, p + 1),
                              )
                            }
                          />
                        </div>
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>
            </TabsContent>

            {/* Contenuto Tab Prenotazioni con Sub-Tabs */}
            <TabsContent value="bookings">
              <div className="space-y-6">
                <Collapsible
                  open={bookingsExpanded}
                  onOpenChange={setBookingsExpanded}
                >
                  <Tabs
                    value={activeBookingSection}
                    onValueChange={(value: any) =>
                      setActiveBookingSection(value)
                    }
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <CollapsibleTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="p-0 h-auto"
                          >
                            {bookingsExpanded ? (
                              <ChevronDown className="h-5 w-5" />
                            ) : (
                              <ChevronRightIcon className="h-5 w-5" />
                            )}
                          </Button>
                        </CollapsibleTrigger>
                        <div>
                          <h2 className="text-2xl font-bold text-blue-gray">
                            📅 Gestione Prenotazioni
                          </h2>
                          <p className="text-sm text-muted-foreground">
                            Gestisci prenotazioni e campagne
                          </p>
                        </div>
                      </div>
                    </div>

                    <TabsList className="grid w-full grid-cols-2 gap-1 mb-4">
                      <TabsTrigger
                        value="bookings-list"
                        className="flex-shrink-0 px-3 py-2 text-sm whitespace-nowrap flex items-center gap-2"
                      >
                        <CalendarCheck className="h-4 w-4 flex-shrink-0" />
                        Prenotazioni
                      </TabsTrigger>
                      <TabsTrigger
                        value="campaigns"
                        className="flex-shrink-0 px-3 py-2 text-sm whitespace-nowrap flex items-center gap-2"
                      >
                        <Calendar className="h-4 w-4 flex-shrink-0" />
                        Campagne
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="bookings-list">
                      <BookingsManager
                        highlightBookingId={highlightBookingId}
                        onHighlightComplete={handleBookingHighlightComplete}
                      />
                    </TabsContent>

                    <TabsContent value="campaigns">
                      <CampaignsManager />
                    </TabsContent>
                  </Tabs>
                </Collapsible>
              </div>
            </TabsContent>

            {/* Contenuto Tab Lavori */}
            <TabsContent value="lavori">
              <Tabs
                value={activeJobSection}
                onValueChange={(v) => setActiveJobSection(v as any)}
                className="w-full"
              >
                <TabsList className="grid w-full grid-cols-3 lg:grid-cols-7 gap-1 mb-4">
                  <TabsTrigger value="jobs-list" data-testid="subtab-jobs-list">
                    Lista Lavori
                  </TabsTrigger>
                  <TabsTrigger value="clienti" data-testid="subtab-clienti">
                    Clienti
                  </TabsTrigger>
                  <TabsTrigger value="job-types" data-testid="subtab-job-types">
                    Tipi di Lavoro
                  </TabsTrigger>
                  <TabsTrigger value="laboratori" data-testid="subtab-laboratori">
                    Laboratori
                  </TabsTrigger>
                  <TabsTrigger
                    value="contract-clauses"
                    data-testid="subtab-contract-clauses"
                  >
                    Clausole Contrattuali
                  </TabsTrigger>
                  <TabsTrigger
                    value="quote-templates"
                    className="data-[state=active]:bg-sage data-[state=active]:text-white"
                  >
                    <FileText className="w-4 h-4 mr-2" />
                    Template Preventivi
                  </TabsTrigger>
                  <TabsTrigger value="moduli-informativi">
                    <ClipboardList className="w-4 h-4 mr-1.5" />
                    Moduli Informativi
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="jobs-list">
                  <div className="bg-white shadow sm:rounded-lg p-5">
                    <JobsManager />
                  </div>
                </TabsContent>

                <TabsContent value="clienti">
                  <div className="space-y-4">
                    <Collapsible
                      open={clientiExpanded}
                      onOpenChange={setClientiExpanded}
                    >
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <CollapsibleTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="p-0 h-auto"
                            >
                              {clientiExpanded ? (
                                <ChevronDown className="h-5 w-5" />
                              ) : (
                                <ChevronRightIcon className="h-5 w-5" />
                              )}
                            </Button>
                          </CollapsibleTrigger>
                          <div>
                            <h2 className="text-2xl font-bold text-blue-gray">
                              👥 Gestione Clienti
                            </h2>
                            <p className="text-sm text-muted-foreground">
                              Gestisci i clienti dello studio
                            </p>
                          </div>
                        </div>
                      </div>

                      <CollapsibleContent>
                        <ClientiManager />
                      </CollapsibleContent>
                    </Collapsible>
                  </div>
                </TabsContent>

                <TabsContent value="job-types">
                  <div className="bg-white shadow sm:rounded-lg p-5">
                    <JobTypesManager />
                  </div>
                </TabsContent>

                <TabsContent value="laboratori">
                  <div className="bg-white shadow sm:rounded-lg p-5">
                    <LabsManager />
                  </div>
                </TabsContent>

                <TabsContent value="contract-clauses">
                  <div className="bg-white shadow sm:rounded-lg p-5">
                    <ContractClausesManager />
                  </div>
                </TabsContent>

                <TabsContent value="quote-templates">
                  <QuoteTemplatesManager />
                </TabsContent>

                <TabsContent value="moduli-informativi">
                  <InfoFormTemplateManager />
                </TabsContent>
              </Tabs>
            </TabsContent>

            {/* Contenuto Tab Cassa */}
            <TabsContent value="cassa">
              <CashDashboard />
            </TabsContent>

            {/* Contenuto Tab Richieste Info con Sub-Tabs */}
            <TabsContent value="consulenze">
              <Tabs
                value={activeConsultationSection}
                onValueChange={(v) => setActiveConsultationSection(v as any)}
                className="w-full"
              >
                <TabsList className="mb-4 flex flex-wrap justify-start gap-1 h-auto p-1 bg-muted/50 rounded-lg">
                  <TabsTrigger
                    value="consulenze"
                    className="flex-shrink-0 px-3 py-2 text-sm whitespace-nowrap flex items-center gap-2"
                  >
                    <CalendarCheck className="h-4 w-4 flex-shrink-0" />
                    Richieste Info
                  </TabsTrigger>
                  <TabsTrigger
                    value="consulenze-templates"
                    className="flex-shrink-0 px-3 py-2 text-sm whitespace-nowrap flex items-center gap-2"
                  >
                    <FileText className="h-4 w-4 flex-shrink-0" />
                    Template Richieste
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="consulenze">
                  <ConsultationsManager
                    highlightConsultationId={highlightConsultationId}
                    onHighlightComplete={handleConsultationHighlightComplete}
                  />
                </TabsContent>

                <TabsContent value="consulenze-templates">
                  <ConsultationTemplatesManager />
                </TabsContent>
              </Tabs>
            </TabsContent>

            {/* Contenuto Tab Impostazioni con Sub-Tabs */}
            <TabsContent value="settings">
              <Tabs
                value={settingsSection}
                onValueChange={(v) => setSettingsSection(v as any)}
                className="w-full"
              >
                {/* ── Layout: Sidebar (desktop) + Pill scroll (mobile) + Content ── */}
                <div className="flex flex-col lg:flex-row gap-6 min-h-[500px]">

                  {/* ─ Sidebar navigation (desktop only) ─ */}
                  <aside className="hidden lg:flex flex-col w-52 flex-shrink-0">
                    <nav className="sticky top-4 rounded-xl border border-stone-200 bg-white shadow-sm overflow-hidden">
                      {/* Configurazione */}
                      <div className="px-3 pt-4 pb-2">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 px-2 mb-2">Configurazione</p>
                        {([
                          { id: 'studio',       icon: Building2, label: 'Studio',       desc: 'Profilo & contatti' },
                          { id: 'slideshow',    icon: Play,      label: 'Slideshow',    desc: 'Foto homepage' },
                          { id: 'integrations', icon: Link2,     label: 'Integrazioni', desc: 'Calendar & Gmail' },
                        ] as const).map(({ id, icon: Icon, label, desc }) => (
                          <button
                            key={id}
                            onClick={() => setSettingsSection(id)}
                            className={`w-full flex items-start gap-2.5 px-3 py-2.5 rounded-lg text-left transition-all group mb-0.5 ${
                              settingsSection === id
                                ? 'bg-[#6b7f6b] text-white shadow-sm'
                                : 'text-stone-600 hover:bg-stone-50'
                            }`}
                          >
                            <Icon className={`h-4 w-4 flex-shrink-0 mt-0.5 ${settingsSection === id ? 'text-white' : 'text-stone-400 group-hover:text-stone-600'}`} />
                            <span className="min-w-0">
                              <span className={`block text-sm font-medium leading-tight ${settingsSection === id ? 'text-white' : 'text-stone-700'}`}>{label}</span>
                              <span className={`block text-[11px] leading-tight mt-0.5 ${settingsSection === id ? 'text-white/70' : 'text-stone-400'}`}>{desc}</span>
                            </span>
                          </button>
                        ))}
                      </div>
                      <div className="mx-3 border-t border-stone-100" />
                      {/* Catalogo */}
                      <div className="px-3 py-2">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 px-2 mb-2 mt-1">Catalogo</p>
                        {([
                          { id: 'products',           icon: Package,    label: 'Prodotti',   desc: 'Listino & bundle' },
                          { id: 'product-categories', icon: FolderOpen, label: 'Categorie',  desc: 'Organizza prodotti' },
                        ] as const).map(({ id, icon: Icon, label, desc }) => (
                          <button
                            key={id}
                            onClick={() => setSettingsSection(id)}
                            className={`w-full flex items-start gap-2.5 px-3 py-2.5 rounded-lg text-left transition-all group mb-0.5 ${
                              settingsSection === id
                                ? 'bg-[#6b7f6b] text-white shadow-sm'
                                : 'text-stone-600 hover:bg-stone-50'
                            }`}
                          >
                            <Icon className={`h-4 w-4 flex-shrink-0 mt-0.5 ${settingsSection === id ? 'text-white' : 'text-stone-400 group-hover:text-stone-600'}`} />
                            <span className="min-w-0">
                              <span className={`block text-sm font-medium leading-tight ${settingsSection === id ? 'text-white' : 'text-stone-700'}`}>{label}</span>
                              <span className={`block text-[11px] leading-tight mt-0.5 ${settingsSection === id ? 'text-white/70' : 'text-stone-400'}`}>{desc}</span>
                            </span>
                          </button>
                        ))}
                      </div>
                      <div className="mx-3 border-t border-stone-100" />
                      {/* Strumenti */}
                      <div className="px-3 pt-2 pb-4">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 px-2 mb-2 mt-1">Strumenti</p>
                        {([
                          { id: 'migration', icon: RefreshCw, label: 'Migrazione', desc: 'Import & backup' },
                        ] as const).map(({ id, icon: Icon, label, desc }) => (
                          <button
                            key={id}
                            onClick={() => setSettingsSection(id)}
                            className={`w-full flex items-start gap-2.5 px-3 py-2.5 rounded-lg text-left transition-all group mb-0.5 ${
                              settingsSection === id
                                ? 'bg-[#6b7f6b] text-white shadow-sm'
                                : 'text-stone-600 hover:bg-stone-50'
                            }`}
                          >
                            <Icon className={`h-4 w-4 flex-shrink-0 mt-0.5 ${settingsSection === id ? 'text-white' : 'text-stone-400 group-hover:text-stone-600'}`} />
                            <span className="min-w-0">
                              <span className={`block text-sm font-medium leading-tight ${settingsSection === id ? 'text-white' : 'text-stone-700'}`}>{label}</span>
                              <span className={`block text-[11px] leading-tight mt-0.5 ${settingsSection === id ? 'text-white/70' : 'text-stone-400'}`}>{desc}</span>
                            </span>
                          </button>
                        ))}
                      </div>
                    </nav>
                  </aside>

                  {/* ─ Mobile: pill scroll nav ─ */}
                  <div className="lg:hidden flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                    {([
                      { id: 'studio',             icon: Building2,  label: 'Studio' },
                      { id: 'slideshow',           icon: Play,       label: 'Slideshow' },
                      { id: 'integrations',        icon: Link2,      label: 'Integrazioni' },
                      { id: 'products',            icon: Package,    label: 'Prodotti' },
                      { id: 'product-categories',  icon: FolderOpen, label: 'Categorie' },
                      { id: 'migration',           icon: RefreshCw,  label: 'Migrazione' },
                    ] as const).map(({ id, icon: Icon, label }) => (
                      <button
                        key={id}
                        onClick={() => setSettingsSection(id)}
                        className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                          settingsSection === id
                            ? 'bg-[#6b7f6b] text-white shadow-sm'
                            : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {label}
                      </button>
                    ))}
                  </div>

                  {/* ─ Content area ─ */}
                  <div className="flex-1 min-w-0">

                <TabsContent value="studio" className="mt-0">
                  {isSettingsLoading ? (
                    <div className="space-y-4">
                      {[...Array(5)].map((_, i) => (
                        <Skeleton key={i} className="h-32 w-full rounded-xl" />
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-5">

                      {/* ── Page header con CTA primario ── */}
                      <div className="flex items-center justify-between rounded-xl bg-gradient-to-r from-[#6b7f6b]/10 to-[#f5f0e8]/60 border border-[#6b7f6b]/20 px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#6b7f6b] text-white shadow-sm">
                            <Building2 className="h-5 w-5" />
                          </div>
                          <div>
                            <h2 className="text-base font-semibold text-stone-800 leading-tight">Impostazioni Studio</h2>
                            <p className="text-xs text-stone-500 mt-0.5">Profilo, recapiti e presenza online del tuo studio</p>
                          </div>
                        </div>
                        <Button
                          onClick={saveStudioSettings}
                          className="bg-[#6b7f6b] hover:bg-[#5a6e5a] text-white shadow-sm gap-2"
                        >
                          <CheckCircle className="h-4 w-4" />
                          Salva modifiche
                        </Button>
                      </div>

                      {/* ── QR Code Pagina Ospiti ── */}
                      <OspitiQrCard />

                      {/* ── SEZIONE 1: Identità dello Studio ── */}
                      <div className="rounded-xl border border-stone-200 bg-white shadow-sm overflow-hidden">
                        <div className="flex items-center gap-3 px-5 py-3.5 bg-stone-50 border-b border-stone-200">
                          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[#6b7f6b]/15">
                            <Camera className="h-3.5 w-3.5 text-[#6b7f6b]" />
                          </div>
                          <div>
                            <h3 className="text-sm font-semibold text-stone-700">Identità dello Studio</h3>
                            <p className="text-xs text-stone-400">Nome, slogan, logo e descrizione pubblica</p>
                          </div>
                        </div>
                        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-5">
                          {/* Colonna sinistra */}
                          <div className="space-y-4">
                            <div className="space-y-1.5">
                              <Label htmlFor="studio-name" className="text-xs font-medium text-stone-600 uppercase tracking-wide">Nome dello Studio</Label>
                              <Input
                                id="studio-name"
                                value={studioSettings.name}
                                onChange={(e) => handleSettingsChange("name", e.target.value)}
                                placeholder="es. Image Studio Photography"
                                className="border-stone-200 focus:border-[#6b7f6b] focus:ring-[#6b7f6b]/20"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label htmlFor="studio-slogan" className="text-xs font-medium text-stone-600 uppercase tracking-wide">Slogan</Label>
                              <Input
                                id="studio-slogan"
                                value={studioSettings.slogan}
                                onChange={(e) => handleSettingsChange("slogan", e.target.value)}
                                placeholder="es. Catturiamo i tuoi momenti più belli"
                                className="border-stone-200 focus:border-[#6b7f6b] focus:ring-[#6b7f6b]/20"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label htmlFor="studio-about" className="text-xs font-medium text-stone-600 uppercase tracking-wide">Descrizione</Label>
                              <Textarea
                                id="studio-about"
                                value={studioSettings.about}
                                onChange={(e) => handleSettingsChange("about", e.target.value)}
                                placeholder="Racconta la storia e la filosofia del tuo studio..."
                                rows={4}
                                className="border-stone-200 focus:border-[#6b7f6b] focus:ring-[#6b7f6b]/20 resize-none"
                              />
                            </div>
                          </div>
                          {/* Colonna destra: Logo */}
                          <div className="space-y-1.5">
                            <Label className="text-xs font-medium text-stone-600 uppercase tracking-wide">Logo dello Studio</Label>
                            <div className="mt-1 flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-stone-200 bg-stone-50 p-6 text-center gap-3 hover:border-[#6b7f6b]/40 transition-colors">
                              {studioSettings.logo ? (
                                <>
                                  <img
                                    src={studioSettings.logo}
                                    alt="Logo dello studio"
                                    className="h-24 w-auto object-contain rounded-lg shadow-sm"
                                    onError={(e) => { e.currentTarget.style.display = "none"; }}
                                  />
                                  <p className="text-xs text-stone-400">Logo attuale</p>
                                </>
                              ) : (
                                <>
                                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-stone-200">
                                    <Camera className="h-6 w-6 text-stone-400" />
                                  </div>
                                  <p className="text-sm text-stone-500">Nessun logo caricato</p>
                                  <p className="text-xs text-stone-400">PNG, JPG o SVG consigliati</p>
                                </>
                              )}
                              <Label
                                htmlFor="logo-upload"
                                className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[#6b7f6b] text-[#6b7f6b] text-sm font-medium hover:bg-[#6b7f6b] hover:text-white transition-colors"
                              >
                                <Upload className="h-3.5 w-3.5" />
                                {studioSettings.logo ? "Cambia logo" : "Carica logo"}
                              </Label>
                              <Input id="logo-upload" type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* ── SEZIONE 2: Recapiti ── */}
                      <div className="rounded-xl border border-stone-200 bg-white shadow-sm overflow-hidden">
                        <div className="flex items-center gap-3 px-5 py-3.5 bg-stone-50 border-b border-stone-200">
                          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-50">
                            <Phone className="h-3.5 w-3.5 text-blue-600" />
                          </div>
                          <div>
                            <h3 className="text-sm font-semibold text-stone-700">Recapiti</h3>
                            <p className="text-xs text-stone-400">Come ti contattano i clienti</p>
                          </div>
                        </div>
                        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                          <div className="space-y-1.5">
                            <Label htmlFor="studio-email" className="text-xs font-medium text-stone-600 uppercase tracking-wide">Email</Label>
                            <div className="relative">
                              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-stone-400" />
                              <Input
                                id="studio-email"
                                value={studioSettings.email}
                                onChange={(e) => handleSettingsChange("email", e.target.value)}
                                placeholder="studio@email.com"
                                className="pl-9 border-stone-200 focus:border-blue-400 focus:ring-blue-100"
                              />
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="studio-phone" className="text-xs font-medium text-stone-600 uppercase tracking-wide">Telefono</Label>
                            <div className="relative">
                              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-stone-400" />
                              <Input
                                id="studio-phone"
                                value={studioSettings.phone}
                                onChange={(e) => handleSettingsChange("phone", e.target.value)}
                                placeholder="+39 081 000 0000"
                                className="pl-9 border-stone-200 focus:border-blue-400 focus:ring-blue-100"
                              />
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="studio-whatsapp" className="text-xs font-medium text-stone-600 uppercase tracking-wide">WhatsApp</Label>
                            <div className="relative">
                              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-green-500" />
                              <Input
                                id="studio-whatsapp"
                                value={studioSettings.whatsapp || ""}
                                onChange={(e) => handleSettingsChange("whatsapp", e.target.value)}
                                placeholder="+39 340 000 0000"
                                className="pl-9 border-stone-200 focus:border-green-400 focus:ring-green-100"
                              />
                            </div>
                          </div>
                          <div className="space-y-1.5 sm:col-span-2">
                            <Label htmlFor="studio-address" className="text-xs font-medium text-stone-600 uppercase tracking-wide">Indirizzo</Label>
                            <div className="relative">
                              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-stone-400" />
                              <Input
                                id="studio-address"
                                value={studioSettings.address}
                                onChange={(e) => handleSettingsChange("address", e.target.value)}
                                placeholder="Via Roma 1, 81031 Aversa (CE)"
                                className="pl-9 border-stone-200 focus:border-blue-400 focus:ring-blue-100"
                              />
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="studio-website" className="text-xs font-medium text-stone-600 uppercase tracking-wide">Sito Web</Label>
                            <div className="relative">
                              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-stone-400" />
                              <Input
                                id="studio-website"
                                value={studioSettings.websiteUrl}
                                onChange={(e) => handleSettingsChange("websiteUrl", e.target.value)}
                                placeholder="https://www.tuostudio.it"
                                type="url"
                                className="pl-9 border-stone-200 focus:border-blue-400 focus:ring-blue-100"
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* ── SEZIONE 3: Dati Fiscali ── */}
                      <div className="rounded-xl border border-stone-200 bg-white shadow-sm overflow-hidden">
                        <div className="flex items-center gap-3 px-5 py-3.5 bg-stone-50 border-b border-stone-200">
                          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-amber-50">
                            <CreditCard className="h-3.5 w-3.5 text-amber-600" />
                          </div>
                          <div>
                            <h3 className="text-sm font-semibold text-stone-700">Dati Fiscali</h3>
                            <p className="text-xs text-stone-400">Dati del mittente, usati nelle ricevute e nelle fatture XML FatturaPA</p>
                          </div>
                        </div>
                        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <Label htmlFor="studio-partita-iva" className="text-xs font-medium text-stone-600 uppercase tracking-wide">Partita IVA</Label>
                            <Input
                              id="studio-partita-iva"
                              value={studioSettings.partitaIVA || ""}
                              onChange={(e) => handleSettingsChange("partitaIVA", e.target.value)}
                              placeholder="IT12345678901"
                              className="font-mono border-stone-200 focus:border-amber-400 focus:ring-amber-100"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="studio-codice-fiscale" className="text-xs font-medium text-stone-600 uppercase tracking-wide">Codice Fiscale</Label>
                            <Input
                              id="studio-codice-fiscale"
                              value={studioSettings.codiceFiscale || ""}
                              onChange={(e) => handleSettingsChange("codiceFiscale", e.target.value)}
                              placeholder="RSSMRA80A01H501Z"
                              className="font-mono border-stone-200 focus:border-amber-400 focus:ring-amber-100"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="studio-regime-fiscale" className="text-xs font-medium text-stone-600 uppercase tracking-wide">Regime fiscale FatturaPA</Label>
                            <Select value={studioSettings.regimeFiscale || ''} onValueChange={(value) => handleSettingsChange("regimeFiscale", value)}>
                              <SelectTrigger id="studio-regime-fiscale" className="border-stone-200">
                                <SelectValue placeholder="Seleziona regime fiscale" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="RF01">RF01 · Ordinario</SelectItem>
                                <SelectItem value="RF19">RF19 · Forfettario</SelectItem>
                                <SelectItem value="RF02">RF02 · Contribuenti minimi</SelectItem>
                                <SelectItem value="RF04">RF04 · Agricoltura e attività connesse</SelectItem>
                                <SelectItem value="RF18">RF18 · Altro</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="sm:col-span-2 rounded-lg border border-amber-100 bg-amber-50/50 p-3">
                            <p className="text-xs text-amber-900 mb-1">Questi sono i dati fiscali del mittente/studio, non quelli del cliente: salvali qui prima di creare una fattura XML FPR12.</p>
                            <p className="text-xs text-amber-900 mb-3">Per il regime forfettario seleziona RF19: il modulo fattura applicherà automaticamente natura N2.2, IVA zero, causale normativa e bollo quando dovuto.</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div className="space-y-1.5 sm:col-span-2">
                                <Label htmlFor="studio-fiscal-via" className="text-xs font-medium text-stone-600 uppercase tracking-wide">Via / piazza</Label>
                                <Input id="studio-fiscal-via" value={studioSettings.fiscalVia || ''} onChange={(e) => handleSettingsChange("fiscalVia", e.target.value)} placeholder="Via Roma 1" />
                              </div>
                              <div className="space-y-1.5">
                                <Label htmlFor="studio-fiscal-cap" className="text-xs font-medium text-stone-600 uppercase tracking-wide">CAP</Label>
                                <Input id="studio-fiscal-cap" value={studioSettings.fiscalCap || ''} onChange={(e) => handleSettingsChange("fiscalCap", e.target.value)} placeholder="80100" />
                              </div>
                              <div className="space-y-1.5">
                                <Label htmlFor="studio-fiscal-comune" className="text-xs font-medium text-stone-600 uppercase tracking-wide">Comune</Label>
                                <Input id="studio-fiscal-comune" value={studioSettings.fiscalComune || ''} onChange={(e) => handleSettingsChange("fiscalComune", e.target.value)} placeholder="Napoli" />
                              </div>
                              <div className="space-y-1.5">
                                <Label htmlFor="studio-fiscal-provincia" className="text-xs font-medium text-stone-600 uppercase tracking-wide">Provincia</Label>
                                <Input id="studio-fiscal-provincia" value={studioSettings.fiscalProvincia || ''} onChange={(e) => handleSettingsChange("fiscalProvincia", e.target.value.toUpperCase())} placeholder="NA" maxLength={2} />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* ── SEZIONE 4: Social & Recensioni ── */}
                      <div className="rounded-xl border border-stone-200 bg-white shadow-sm overflow-hidden">
                        <div className="flex items-center gap-3 px-5 py-3.5 bg-stone-50 border-b border-stone-200">
                          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-purple-50">
                            <Share2 className="h-3.5 w-3.5 text-purple-600" />
                          </div>
                          <div>
                            <h3 className="text-sm font-semibold text-stone-700">Social &amp; Recensioni</h3>
                            <p className="text-xs text-stone-400">Profili social e link recensione Google per email automatiche</p>
                          </div>
                        </div>
                        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                          <div className="space-y-1.5">
                            <Label htmlFor="social-instagram" className="text-xs font-medium text-stone-600 uppercase tracking-wide flex items-center gap-1.5">
                              <Instagram className="h-3 w-3" /> Instagram
                            </Label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 text-sm">@</span>
                              <Input
                                id="social-instagram"
                                value={studioSettings.socialLinks.instagram || ""}
                                onChange={(e) => handleSettingsChange("socialLinks", e.target.value, "instagram")}
                                placeholder="username"
                                className="pl-7 border-stone-200 focus:border-purple-400 focus:ring-purple-100"
                              />
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="social-facebook" className="text-xs font-medium text-stone-600 uppercase tracking-wide flex items-center gap-1.5">
                              <Facebook className="h-3 w-3" /> Facebook
                            </Label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 text-sm">@</span>
                              <Input
                                id="social-facebook"
                                value={studioSettings.socialLinks.facebook || ""}
                                onChange={(e) => handleSettingsChange("socialLinks", e.target.value, "facebook")}
                                placeholder="username o ID pagina"
                                className="pl-7 border-stone-200 focus:border-purple-400 focus:ring-purple-100"
                              />
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="social-twitter" className="text-xs font-medium text-stone-600 uppercase tracking-wide flex items-center gap-1.5">
                              <span className="font-bold text-xs">𝕏</span> Twitter / X
                            </Label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 text-sm">@</span>
                              <Input
                                id="social-twitter"
                                value={studioSettings.socialLinks.twitter || ""}
                                onChange={(e) => handleSettingsChange("socialLinks", e.target.value, "twitter")}
                                placeholder="username"
                                className="pl-7 border-stone-200 focus:border-sky-400 focus:ring-sky-100"
                              />
                            </div>
                          </div>
                          <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
                            <Label htmlFor="studio-review-url" className="text-xs font-medium text-stone-600 uppercase tracking-wide flex items-center gap-1.5">
                              <Star className="h-3 w-3 text-yellow-500" /> Recensione Google
                            </Label>
                            <Input
                              id="studio-review-url"
                              value={studioSettings.googleReviewUrl || ""}
                              onChange={(e) => handleSettingsChange("googleReviewUrl", e.target.value)}
                              placeholder="https://g.page/r/..."
                              type="url"
                              className="border-stone-200 focus:border-yellow-400 focus:ring-yellow-100"
                            />
                            <p className="text-[11px] text-stone-400 leading-snug">
                              Inviato automaticamente al cliente quando il job passa a "Consegnato"
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* ── SEZIONE 5: Campagna Recensioni (condizionale) ── */}
                      {studioSettings.googleReviewUrl && (
                        <div className="rounded-xl border border-yellow-200 bg-yellow-50/40 shadow-sm overflow-hidden">
                          <div className="flex items-center gap-3 px-5 py-3.5 border-b border-yellow-200">
                            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-yellow-100">
                              <Star className="h-3.5 w-3.5 text-yellow-600" />
                            </div>
                            <div>
                              <h3 className="text-sm font-semibold text-stone-700">Campagna Recensioni</h3>
                              <p className="text-xs text-stone-400">Invia email di richiesta recensione a tutti i clienti con job consegnato</p>
                            </div>
                          </div>
                          <div className="p-5">
                            <ReviewEmailManager />
                          </div>
                        </div>
                      )}

                      {/* ── SEZIONE 6: Testi Homepage ── */}
                      <div className="rounded-xl border border-stone-200 bg-white shadow-sm overflow-hidden">
                        <div className="flex items-center gap-3 px-5 py-3.5 bg-stone-50 border-b border-stone-200">
                          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[#c4724a]/10">
                            <Monitor className="h-3.5 w-3.5 text-[#c4724a]" />
                          </div>
                          <div>
                            <h3 className="text-sm font-semibold text-stone-700">Testi Homepage</h3>
                            <p className="text-xs text-stone-400">I testi attuali restano come fallback se un campo viene lasciato vuoto</p>
                          </div>
                        </div>
                        <div className="p-5">
                          <HomepageContentEditor
                            value={resolveHomepageContent(studioSettings.homepageContent)}
                            onChange={handleHomepageContentChange}
                          />
                        </div>
                      </div>

                      {/* ── Footer CTA ── */}
                      <div className="flex justify-end pt-2 pb-4">
                        <Button
                          onClick={saveStudioSettings}
                          size="lg"
                          className="bg-[#6b7f6b] hover:bg-[#5a6e5a] text-white shadow-sm gap-2 px-8"
                        >
                          <CheckCircle className="h-4 w-4" />
                          Salva tutte le modifiche
                        </Button>
                      </div>

                    </div>
                  )}
                </TabsContent>

                <TabsContent value="slideshow" className="mt-0">
                  <div className="bg-white shadow sm:rounded-lg p-5">
                    <h2 className="text-xl font-semibold text-blue-gray mb-4">
                      Gestione Slideshow Homepage
                    </h2>
                    <p className="text-sm text-muted-foreground mb-6">
                      Seleziona le foto da mostrare nella slideshow della
                      homepage.
                    </p>
                    <SlideshowManager />
                  </div>
                </TabsContent>

                <TabsContent value="products" className="mt-0">
                  <div className="bg-white shadow sm:rounded-lg p-5">
                    <ProductsManager />
                  </div>
                </TabsContent>

                <TabsContent value="product-categories" className="mt-0">
                  <div className="bg-white shadow sm:rounded-lg p-5">
                    <ProductCategoriesManager />
                  </div>
                </TabsContent>

                <TabsContent value="email-logs" className="mt-0">
                  <div className="bg-white shadow sm:rounded-lg p-5">
                    <EmailLogsManager />
                  </div>
                </TabsContent>

                <TabsContent value="migration" className="mt-0">
                  <div className="space-y-6">
                    <div className="bg-white shadow sm:rounded-lg p-5 border-2 border-primary/20">
                      <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
                        <Database className="h-5 w-5 text-primary" />
                        Backup e Ripristino Sistema
                      </h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        Esporta un backup completo di tutti i dati (clienti,
                        lavori, gallerie, impostazioni) per protezione da
                        disastri.
                      </p>
                      <div className="flex flex-wrap gap-3">
                        <Button
                          onClick={() => window.open("/admin/backup", "_blank")}
                          className="flex items-center gap-2"
                          data-testid="button-backup-manager"
                        >
                          <HardDrive className="h-4 w-4" />
                          Gestione Backup
                        </Button>
                        <Button
                          onClick={() => window.open("/admin/audit", "_blank")}
                          variant="outline"
                          className="flex items-center gap-2"
                          data-testid="button-audit-system"
                        >
                          <Search className="h-4 w-4" />
                          Audit Sistema
                        </Button>
                      </div>
                    </div>

                    <div className="bg-white shadow sm:rounded-lg p-5">
                      <h3 className="text-lg font-semibold mb-2">
                        Importa da Vecchio Gestionale
                      </h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        Importa lavori, ordini e preventivi dal vecchio sistema
                        con mappatura automatica dei clienti esistenti.
                      </p>
                      <Button
                        onClick={() =>
                          window.open("/admin/legacy-import", "_blank")
                        }
                        className="flex items-center gap-2"
                        data-testid="button-legacy-import"
                      >
                        <Upload className="h-4 w-4" />
                        Apri Importatore Legacy
                      </Button>
                      <Button
                        onClick={() =>
                          window.open("/admin/legacy-analyzer", "_blank")
                        }
                        className="flex items-center gap-2"
                        variant="outline"
                        data-testid="button-legacy-analyzer"
                      >
                        <Search className="h-4 w-4" />
                        Analizza Jobs Legacy
                      </Button>
                    </div>

                    <SyncClientJobRefs />

                    <PhotosMigration />

                    <PhotoDatesBackfill />

                    <GalleryJobTypeBackfill />

                    <GalleryRecoveryTool />

                    {/* Migrazione Secrets Gallerie */}
                    <div className="bg-white shadow sm:rounded-lg p-5">
                      <h3 className="text-lg font-semibold mb-2">
                        Migrazione Secrets Gallerie
                      </h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        Migra password e PIN delle gallerie dalla collection
                        pubblica alla collection protetta (gallerySecrets).
                        Questa operazione è sicura e può essere eseguita più
                        volte.
                      </p>
                      <div className="flex flex-wrap gap-3">
                        <Button
                          variant="outline"
                          onClick={async () => {
                            try {
                              const token =
                                await auth.currentUser?.getIdToken();
                              if (!token) {
                                toast({
                                  title: "Errore",
                                  description: "Devi essere autenticato",
                                  variant: "destructive",
                                });
                                return;
                              }
                              const response = await fetch(
                                "/api/email/admin/check-legacy-secrets",
                                {
                                  headers: { Authorization: `Bearer ${token}` },
                                },
                              );
                              const data = await response.json();
                              if (data.success) {
                                toast({
                                  title: `Controllo completato`,
                                  description: `Trovate ${data.legacyCount} gallerie con secrets legacy su ${data.totalGalleries} totali.${data.legacyGalleries?.length > 0 ? " Gallerie: " + data.legacyGalleries.map((g: any) => g.name).join(", ") : ""}`,
                                  duration: 10000,
                                });
                              } else {
                                toast({
                                  title: "Errore",
                                  description: data.error,
                                  variant: "destructive",
                                });
                              }
                            } catch (error: any) {
                              toast({
                                title: "Errore",
                                description: error.message,
                                variant: "destructive",
                              });
                            }
                          }}
                          className="flex items-center gap-2"
                          data-testid="button-check-legacy-secrets"
                        >
                          <Eye className="h-4 w-4" />
                          Controlla Secrets Legacy
                        </Button>
                        <Button
                          onClick={async () => {
                            try {
                              const token =
                                await auth.currentUser?.getIdToken();
                              if (!token) {
                                toast({
                                  title: "Errore",
                                  description: "Devi essere autenticato",
                                  variant: "destructive",
                                });
                                return;
                              }
                              toast({
                                title: "Migrazione in corso...",
                                description: "Attendere...",
                              });
                              const response = await fetch(
                                "/api/email/admin/migrate-legacy-secrets",
                                {
                                  method: "POST",
                                  headers: { Authorization: `Bearer ${token}` },
                                },
                              );
                              const data = await response.json();
                              if (data.success) {
                                const r = data.results;
                                toast({
                                  title: "Migrazione completata",
                                  description: `Migrate: ${r.migrated} | Già migrate: ${r.alreadyMigrated} | Password legacy: ${r.withLegacyPassword} | PIN legacy: ${r.withLegacyPin}`,
                                  duration: 10000,
                                });
                              } else {
                                toast({
                                  title: "Errore",
                                  description: data.error,
                                  variant: "destructive",
                                });
                              }
                            } catch (error: any) {
                              toast({
                                title: "Errore",
                                description: error.message,
                                variant: "destructive",
                              });
                            }
                          }}
                          className="flex items-center gap-2 bg-terracotta hover:bg-terracotta/90"
                          data-testid="button-migrate-legacy-secrets"
                        >
                          <Key className="h-4 w-4" />
                          Esegui Migrazione
                        </Button>
                      </div>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="integrations" className="mt-0">
                  <div className="space-y-6">
                    {/* Google Calendar Integration */}
                    <div className="bg-white shadow sm:rounded-lg p-5">
                      <div className="flex items-center gap-3 mb-4">
                        <Calendar className="h-6 w-6 text-blue-600" />
                        <div>
                          <h3 className="text-lg font-semibold">
                            Google Calendar
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            Sincronizzazione calendario per prenotazioni,
                            consulenze e lavori
                          </p>
                        </div>
                      </div>

                      <GoogleCalendarStatus toast={toast} />
                    </div>

                    {/* Gmail Integration Info */}
                    <div className="bg-white shadow sm:rounded-lg p-5">
                      <div className="flex items-center gap-3 mb-4">
                        <Mail className="h-6 w-6 text-red-500" />
                        <div>
                          <h3 className="text-lg font-semibold">Gmail</h3>
                          <p className="text-sm text-muted-foreground">
                            Invio email automatiche (conferme, promemoria,
                            notifiche)
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg border border-green-200">
                        <CheckCircle className="h-5 w-5 text-green-600" />
                        <span className="text-sm text-green-800">
                          Gmail connesso tramite{" "}
                          <strong>image.studio.fotografico@gmail.com</strong>
                        </span>
                      </div>
                    </div>
                  </div>
                </TabsContent>

                  </div>{/* end content area */}
                </div>{/* end flex layout */}
              </Tabs>
            </TabsContent>

            {/* Contenuto Tab Collaboratori */}
            <TabsContent value="collaboratori">
              <CollaboratoriManager />
            </TabsContent>

            {/* Contenuto Tab Email Massivo */}
            <TabsContent value="bulkEmail">
              <BulkEmailSender />
            </TabsContent>

            {/* Contenuto Tab Sito Pubblico */}
            <TabsContent value="sitoPublico">
              <Tabs
                value={activeSitoSection}
                onValueChange={(v) => setActiveSitoSection(v as any)}
                className="w-full"
              >
                <TabsList className="mb-4 flex flex-wrap justify-start gap-1 h-auto p-1 bg-muted/50 rounded-lg">
                  <TabsTrigger
                    value="portfolio"
                    className="flex-shrink-0 px-3 py-2 text-sm whitespace-nowrap flex items-center gap-2"
                    data-testid="subtab-portfolio"
                  >
                    <Grid3x3 className="h-4 w-4 flex-shrink-0" />
                    Portfolio Pubblico
                  </TabsTrigger>
                  <TabsTrigger
                    value="blog"
                    className="flex-shrink-0 px-3 py-2 text-sm whitespace-nowrap flex items-center gap-2"
                    data-testid="subtab-blog"
                  >
                    <FileText className="h-4 w-4 flex-shrink-0" />
                    Blog
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="portfolio">
                  <div className="bg-white shadow sm:rounded-lg p-5">
                    <PortfolioManager />
                  </div>
                </TabsContent>

                <TabsContent value="blog">
                  <div className="bg-white shadow sm:rounded-lg p-5">
                    <BlogManager />
                  </div>
                </TabsContent>
              </Tabs>
            </TabsContent>

            {/* Contenuto Tab Video */}
            <TabsContent value="videos">
              <WeddingVideosManager />
            </TabsContent>
          </Tabs>
        </div>
      </main>

      {/* Finestra modale per creare una nuova galleria */}
      <NewGalleryModal
        isOpen={isModalOpen}
        onClose={closeModal}
        onGalleryCreated={(galleryId, galleryCode) => {
          // Ricarichiamo le gallerie dopo la creazione via React Query
          queryClient.invalidateQueries({ queryKey: ["galleries", "admin"] });
          // Navigate to gallery management page for photo upload
          navigate(`/admin/gallery/${galleryId}/manage`);
        }}
      />

      {/* Finestra modale per modificare una galleria esistente */}
      {selectedGallery && (
        <EditGalleryModal
          isOpen={isEditModalOpen}
          onClose={closeEditModal}
          gallery={selectedGallery}
        />
      )}
    </div>
  );
}
