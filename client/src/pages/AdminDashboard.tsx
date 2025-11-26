import { useState, useEffect, useCallback } from "react";
import { useLocation, Link } from "wouter";
import { collection, getDocs, doc, updateDoc, deleteDoc, query, orderBy, collectionGroup, setDoc, getDoc, where } from "firebase/firestore";
import { getAuth, signOut } from "firebase/auth";
import { db, storage, auth } from "@/lib/firebase";
import { useFirebaseAuth } from "@/context/FirebaseAuthContext";
import { createUrl } from "@/lib/basePath";
import { GalleryService, type Gallery } from "@/lib/galleries";
import { useQuery } from "@tanstack/react-query";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { formatPasswordRequestsForExcel, exportToExcel } from "@/lib/excelExport";
import { ref, listAll, deleteObject, uploadBytes, getDownloadURL } from "firebase/storage";
import Navigation from "@/components/Navigation";
import NewGalleryModal from "@/components/NewGalleryModal";
import EditGalleryModal from "@/components/EditGalleryModal";
import SlideshowManager from "@/components/SlideshowManager";
import ClientiManager from "@/components/ClientiManager";
import EmailStatusPanel from "@/components/EmailStatusPanel";
import ProductsManager from "@/components/ProductsManager";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQueryClient } from "@tanstack/react-query";
import { Search, Plus, Edit, Trash, Eye, EyeOff, RefreshCw, Download, Key, ChevronLeft, ChevronRight, Users, Play, Mail, HelpCircle, Settings, Sparkles, Package, Calendar, CalendarCheck, ShoppingBag, Wallet, FolderOpen, Briefcase, FileText, ChevronDown, ChevronRight as ChevronRightIcon, Grid3x3, BookOpen } from "lucide-react";
import QuestionnaireManager from "./admin/QuestionnaireManager";
import CampaignsManager from "@/components/CampaignsManager";
import BookingsManager from "@/components/BookingsManager";
import { OrdersManager } from "@/components/OrdersManager";
import CashDashboard from "@/components/CashDashboard";
import { getAllThemes } from "@shared/special-themes";
import JobsManager from "@/components/jobs/JobsManager";
import ContractClausesManager from "@/components/contract-clauses/ContractClausesManager";
import JobTypesManager from "@/components/job-types/JobTypesManager";
import ProductCategoriesManager from "@/components/product-categories/ProductCategoriesManager";
import ConsultationTemplatesManager from "./admin/ConsultationTemplatesManager";
import ConsultationsManager from "./admin/ConsultationsManager";
import PhotosMigration from "@/components/PhotosMigration";
import CalendarioManager from "@/components/admin/CalendarioManager";
import { NotificationBell } from "@/components/NotificationBell";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { BarChart3, Clock, Globe } from "lucide-react";
import { CollaboratoriManager } from '@/components/collaboratori/CollaboratoriManager';
import PortfolioManager from '@/components/admin/PortfolioManager';
import BlogManager from '@/components/admin/BlogManager';
import WordPressImporter from "@/components/admin/WordPressImporter";
import WeddingVideosManager from "@/components/admin/WeddingVideosManager";
import BulkEmailSender from "./BulkEmailSender";
import QuoteManagementDemo from './admin/QuoteManagementDemo';
import QuoteTemplatesManager from '@/components/quotes/QuoteTemplatesManager';
import { AdminCommandPalette } from "@/components/admin/AdminCommandPalette";

// Componente di paginazione riutilizzabile
interface PaginationControlsProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onPrevious: () => void;
  onNext: () => void;
}

function PaginationControls({ currentPage, totalPages, onPageChange, onPrevious, onNext }: PaginationControlsProps) {
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
            <Button
              variant="default"
              size="sm"
              className="w-8"
            >
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
  selectionStatus?: string; // Aggiunto per il filtro selezioni
  selectionEnabled?: boolean; // Aggiunto per il filtro selezioni
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
}

export default function AdminDashboard() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedGallery, setSelectedGallery] = useState<GalleryItem | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [galleryTypeFilter, setGalleryTypeFilter] = useState<'all' | 'generic' | 'special'>('generic'); // 🎨 Filtro tipo galleria (default: generiche)
  const [selectionFilter, setSelectionFilter] = useState<'all' | 'approved'>('all'); // 📸 Filtro selezioni approvate
  const [passwordRequests, setPasswordRequests] = useState<any[]>([]);
  const [isSettingsLoading, setIsSettingsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'galleries' | 'users' | 'clienti' | 'slideshow' | 'requests' | 'email' | 'questionnaire' | 'settings' | 'cassa' | 'bookings' | 'commesse' | 'themes' | 'lavori' | 'consulenze' | 'consulenze-templates' | 'calendario' | 'collaboratori' | 'sitoPublico' | 'videos' | 'quote-templates'>(() => {
    return (sessionStorage.getItem('activeTab') as any) || 'calendario';
  });
  const [activeBookingSection, setActiveBookingSection] = useState<'bookings-list' | 'campaigns' | 'orders'>(() => {
    const stored = sessionStorage.getItem('activeBookingSection') as any;
    // Sanitize legacy values
    if (stored === 'commesse' || !['bookings-list', 'campaigns', 'orders'].includes(stored)) {
      return 'bookings-list';
    }
    return stored || 'bookings-list';
  });
  const [activeConsultationSection, setActiveConsultationSection] = useState<'consulenze' | 'consulenze-templates'>(() => {
    return (sessionStorage.getItem('activeConsultationSection') as any) || 'consulenze';
  });
  const [settingsSection, setSettingsSection] = useState<'studio' | 'slideshow' | 'products' | 'product-categories' | 'migration'>(() => {
    return (sessionStorage.getItem('settingsSection') as any) || 'studio';
  });
  const [activeSitoSection, setActiveSitoSection] = useState<'portfolio' | 'blog'>(() => {
    return (sessionStorage.getItem('activeSitoSection') as any) || 'portfolio';
  });
  const [activeJobSection, setActiveJobSection] = useState<'jobs-list' | 'clienti' | 'job-types' | 'contract-clauses' | 'quote-templates'>(() => {
    return (sessionStorage.getItem('activeJobSection') as any) || 'jobs-list';
  });
  const [highlightBookingId, setHighlightBookingId] = useState<string | null>(null);
  const [highlightOrderId, setHighlightOrderId] = useState<string | null>(null);
  const [highlightConsultationId, setHighlightConsultationId] = useState<string | null>(null);

  // Stati per la gestione dei Collapsible
  const [galleriesExpanded, setGalleriesExpanded] = useState(true);
  const [clientiExpanded, setClientiExpanded] = useState(true);
  const [bookingsExpanded, setBookingsExpanded] = useState(true);
  const [emailExpanded, setEmailExpanded] = useState(true);
  const [requestsExpanded, setRequestsExpanded] = useState(true);

  // Detect if admin came from a specific gallery
  const [referrerGallery, setReferrerGallery] = useState<{name: string, code?: string, from: string} | null>(null);

  // Stati per la paginazione delle gallerie
  const [currentGalleryPage, setCurrentGalleryPage] = useState(1);
  const [galleriesPerPage] = useState(5); // Numero di gallerie per pagina

  // Stati per la paginazione delle richieste password
  const [currentRequestPage, setCurrentRequestPage] = useState(1);
  const [requestsPerPage] = useState(10); // Numero di richieste per pagina
  const [studioSettings, setStudioSettings] = useState<StudioSettings>({
    name: '',
    slogan: '',
    address: '',
    phone: '',
    email: '',
    websiteUrl: '',
    socialLinks: {
      facebook: '',
      instagram: '',
      twitter: ''
    },
    about: '',
    logo: '',
    // Valori predefiniti per i testi personalizzabili
    heroTitle: 'Catturiamo i momenti più preziosi',
    heroSubtitle: 'Ogni scatto racconta una storia unica',
    heroButtonText: 'Trova la tua galleria',
    // Valori predefiniti per la sezione WhatsApp
    whatsappTitle: 'Contattaci su WhatsApp',
    whatsappSubtitle: 'Siamo qui per te',
    whatsappText: 'Hai domande sulle nostre gallerie o vuoi prenotare un servizio? Scrivici su WhatsApp!',
    whatsappButtonText: 'Scrivici su WhatsApp'
  });
  const [location, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Hook Firebase Auth per verifica autenticazione asincrona
  const { user, isLoading: authLoading, isAdmin: isFirebaseAdmin } = useFirebaseAuth();

  // Query React Query per gallerie (solo quando auth è pronto)
  const {
    data: galleries = [],
    isLoading,
    error: galleriesError
  } = useQuery<Gallery[]>({
    queryKey: ['galleries', 'admin'],
    queryFn: GalleryService.getAllGalleriesForAdmin,
    enabled: !authLoading && !!user, // Abilita solo quando auth è pronto e user esiste
    retry: 2, // Riprova 2 volte in caso di errore
    staleTime: 30000, // Cache valida per 30 secondi
  });

  // Persist state changes to sessionStorage
  useEffect(() => {
    sessionStorage.setItem('activeTab', activeTab);
  }, [activeTab]);

  useEffect(() => {
    sessionStorage.setItem('activeBookingSection', activeBookingSection);
  }, [activeBookingSection]);

  useEffect(() => {
    sessionStorage.setItem('activeConsultationSection', activeConsultationSection);
  }, [activeConsultationSection]);

  useEffect(() => {
    sessionStorage.setItem('settingsSection', settingsSection);
  }, [settingsSection]);

  useEffect(() => {
    sessionStorage.setItem('activeSitoSection', activeSitoSection);
  }, [activeSitoSection]);

  useEffect(() => {
    sessionStorage.setItem('activeJobSection', activeJobSection);
  }, [activeJobSection]);

  // Funzione per pulire l'URL (rimuove query params)
  const cleanDeeplinkUrl = useCallback(() => {
    const cleanPath = window.location.pathname;
    window.history.replaceState({}, '', cleanPath);
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
    const params = new URLSearchParams(location.split('?')[1] || '');
    const tab = params.get('tab');
    const section = params.get('section');
    const booking = params.get('booking');
    const consultation = params.get('consultation');
    const gallery = params.get('gallery');

    // Se non ci sono parametri, esci subito
    if (!tab && !booking && !consultation && !gallery) return;

    const tabMapping: Record<string, string> = {
      'prenotazioni': 'bookings',
      'consulenze': 'consulenze',
      'gallerie': 'galleries',
      'clienti': 'clienti',
      'impostazioni': 'settings',
      'calendario': 'calendario'
    };

    const sectionMapping: Record<string, string> = {
      'bookings': 'bookings-list',
      'commesse': 'orders',
      'bookings-list': 'bookings-list',
      'campaigns': 'campaigns',
      'orders': 'orders'
    };

    // Gestione BOOKING (prenotazioni e selezioni)
    // L'URL verrà pulito da handleBookingHighlightComplete quando l'highlight è fatto
    if (booking && tab === 'prenotazioni') {
      setActiveTab('bookings');
      setActiveBookingSection('bookings-list');
      sessionStorage.setItem('activeTab', 'bookings');
      sessionStorage.setItem('activeBookingSection', 'bookings-list');
      // Imposta highlight - BookingsManager gestirà scroll e highlight
      // quando i dati sono pronti, poi chiamerà onHighlightComplete
      setHighlightBookingId(booking);
      return;
    }

    // Gestione CONSULTATION (consulenze)
    // L'URL verrà pulito da handleConsultationHighlightComplete
    if (consultation && tab === 'consulenze') {
      setActiveTab('consulenze');
      setActiveConsultationSection('consulenze');
      sessionStorage.setItem('activeTab', 'consulenze');
      sessionStorage.setItem('activeConsultationSection', 'consulenze');
      setHighlightConsultationId(consultation);
      return;
    }

    // Gestione GALLERY (gallerie) - redirect diretto
    if (gallery && tab === 'gallerie') {
      navigate(`/admin/galleries/${gallery}`);
      return;
    }

    // Gestione TAB generica (senza highlight specifico)
    if (tab) {
      const mappedTab = tabMapping[tab] || tab;
      setActiveTab(mappedTab as any);

      if (mappedTab === 'bookings' && section) {
        const mappedSection = sectionMapping[section] || section;
        setActiveBookingSection(mappedSection as any);
      }

      if (mappedTab === 'consulenze') {
        setActiveConsultationSection('consulenze');
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
    const localAdminFlag = localStorage.getItem('isAdmin');
    if (!localAdminFlag || !user) {
      // Redirect silenzioso senza errori se non c'è flag localStorage
      if (!localAdminFlag) {
        navigate(createUrl("/admin"));
        return;
      }

      // Se c'è flag localStorage ma non c'è user, mostra errore
      if (!user) {
        console.error('❌ Firebase Auth: utente non autenticato');
        toast({
          variant: "destructive",
          title: "Errore di autenticazione",
          description: "Devi essere autenticato come admin per accedere a questa sezione. Effettua il logout e riprova.",
        });
        // Redirect al login admin dopo 2 secondi
        setTimeout(() => {
          localStorage.removeItem('isAdmin');
          navigate(createUrl("/admin"));
        }, 2000);
        return;
      }
    }

    // Verifica email admin
    if (user.email !== 'gennaro.mazzacane@gmail.com') {
      console.error('❌ Firebase Auth: utente non admin');
      toast({
        variant: "destructive",
        title: "Accesso negato",
        description: "Non hai i permessi per accedere a questa sezione.",
      });
      setTimeout(() => {
        localStorage.removeItem('isAdmin');
        navigate(createUrl("/admin"));
      }, 2000);
      return;
    }

    console.log('✅ Firebase Auth verificato:', user.email);

    // Controlla se l'admin proviene da una galleria specifica
    const referrerData = sessionStorage.getItem('adminReferrerGallery');
    if (referrerData) {
      try {
        const parsed = JSON.parse(referrerData);
        setReferrerGallery(parsed);
      } catch (e) {
        // Rimuovi dati corrotti e continua silenziosamente
        sessionStorage.removeItem('adminReferrerGallery');
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

        const requestsList = requestsSnapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            timestamp: data.createdAt?.toDate?.() || new Date()
          };
        });

        // Sort by creation date, newest first
        requestsList.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

        setPasswordRequests(requestsList);

      } catch (error) {
        console.error('Errore caricamento richieste password:', error);
      }

      // Carica impostazioni studio
      try {
        setIsSettingsLoading(true);
        const settingsDoc = doc(db, "settings", "studio");
        const settingsSnapshot = await getDoc(settingsDoc);

        if (settingsSnapshot.exists()) {
          const settingsData = settingsSnapshot.data() as Partial<StudioSettings>;
          // Merge con i valori di default per garantire che tutti i campi siano presenti
          setStudioSettings(prev => ({
            ...prev,
            ...Object.entries(settingsData).reduce((acc, [key, value]) => ({
              ...acc,
              [key]: value ?? prev[key as keyof StudioSettings]
            }), {})
          }));
        }
      } catch (error) {
        console.error('Errore nel caricamento delle impostazioni studio:', error);
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
    nestedField?: string
  ) => {
    if (nestedField) {
      setStudioSettings(prev => ({
        ...prev,
        [field]: {
          ...prev[field as keyof StudioSettings] as object,
          [nestedField]: value
        }
      }));
    } else {
      setStudioSettings(prev => ({
        ...prev,
        [field]: value
      }));
    }
  };

  // Funzione per gestire l'upload del logo
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;

    const file = e.target.files[0];
    // Accetta solo immagini
    if (!file.type.startsWith('image/')) {
      toast({
        title: "Tipo di file non supportato",
        description: "Seleziona un'immagine (PNG, JPG o SVG)",
        variant: "destructive"
      });
      return;
    }

    try {
      // Riferimento allo storage per il logo
      const logoRef = ref(storage, `settings/logo`);

      // Upload del file
      await uploadBytes(logoRef, file);

      // Ottieni URL di download
      const downloadUrl = await getDownloadURL(logoRef);

      // Aggiorna lo stato delle impostazioni
      setStudioSettings(prev => ({
        ...prev,
        logo: downloadUrl
      }));

      toast({
        title: "Logo caricato",
        description: "Il logo è stato caricato con successo."
      });
    } catch (error) {

      toast({
        title: "Errore",
        description: "Si è verificato un errore durante il caricamento del logo.",
        variant: "destructive"
      });
    }
  };

  // Funzione per effettuare il logout
  const handleLogout = async () => {
    try {
      // Esegui logout da Firebase
      await signOut(auth);
      // Rimuovi il flag di amministratore
      localStorage.removeItem('isAdmin');
      // Reindirizza alla pagina di login usando il percorso assoluto
      navigate(createUrl("/admin"));
    } catch (error) {

      toast({
        title: "Errore",
        description: "Si è verificato un errore durante il logout.",
        variant: "destructive"
      });
    }
  };

  // Funzione per salvare le impostazioni dello studio
  const saveStudioSettings = async () => {
    try {
      const settingsRef = doc(db, "settings", "studio");
      await setDoc(settingsRef, studioSettings);

      toast({
        title: "Impostazioni salvate",
        description: "Le impostazioni dello studio sono state salvate con successo."
      });
    } catch (error) {

      toast({
        title: "Errore",
        description: "Si è verificato un errore nel salvataggio delle impostazioni.",
        variant: "destructive"
      });
    }
  };

  const openModal = () => {
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    // Refresh the gallery list via React Query
    queryClient.invalidateQueries({ queryKey: ['galleries', 'admin'] });
  };

  const openEditModal = (gallery: GalleryItem) => {
    setSelectedGallery(gallery);
    setIsEditModalOpen(true);
  };

  const closeEditModal = () => {
    setIsEditModalOpen(false);
    setSelectedGallery(null);
    // Refresh the gallery list via React Query
    queryClient.invalidateQueries({ queryKey: ['galleries', 'admin'] });
  };

  // Handler: Apri booking specifico e scroll + highlight
  const handleOpenBooking = (bookingId: string) => {
    setHighlightBookingId(bookingId);
    setActiveTab('bookings');
    setActiveBookingSection('bookings-list');
    sessionStorage.setItem('activeTab', 'bookings');
    sessionStorage.setItem('activeBookingSection', 'bookings-list');
  };

  // Handler: Apri ordine specifico e scroll + highlight
  const handleOpenOrder = (orderId: string) => {
    setHighlightOrderId(orderId);
    setActiveTab('bookings');
    setActiveBookingSection('orders');
  };

  // Handler: Apri gestione selezioni foto
  const handleOpenPhotoSelection = (gallery: Gallery) => {
    navigate(`/admin/gallery/${gallery.id}/manage`);
  };

  // Verifica se l'utente corrente è admin
  const getCurrentUser = () => auth.currentUser;
  const isCurrentUserAdmin = () => {
    const user = getCurrentUser();
    return user?.email === 'gennaro.mazzacane@gmail.com';
  };

  // Error handling per gallerie (React Query)
  useEffect(() => {
    if (galleriesError) {
      console.error('Errore caricamento gallerie:', galleriesError);
      toast({
        title: "Errore",
        description: "Si è verificato un errore nel caricamento delle gallerie.",
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
      setPasswordRequests(prevRequests =>
        prevRequests.filter(request => request.id !== requestId)
      );

      toast({
        title: "Richiesta eliminata",
        description: "La richiesta è stata eliminata con successo.",
      });
    } catch (error) {

      toast({
        title: "Errore",
        description: "Si è verificato un errore durante l'eliminazione.",
        variant: "destructive"
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
          variant: "destructive"
        });
        return;
      }

      // Formatta i dati per l'export
      const formattedData = formatPasswordRequestsForExcel(passwordRequests);

      // Genera nome file con data corrente
      const today = new Date();
      const dateStr = today.toISOString().split('T')[0]; // formato YYYY-MM-DD
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
        description: "Si è verificato un errore durante l'esportazione delle richieste.",
        variant: "destructive"
      });
    }
  };

  const toggleGalleryStatus = async (gallery: GalleryItem) => {
    try {


      const galleryRef = doc(db, "galleries", gallery.id);
      const newActiveStatus = !gallery.active;

      await updateDoc(galleryRef, {
        active: newActiveStatus,
        updatedAt: new Date() // Track when the status was changed
      });

      // Update local state via React Query
      queryClient.invalidateQueries({ queryKey: ['galleries', 'admin'] });

      toast({
        title: newActiveStatus ? "Galleria attivata" : "Galleria disattivata",
        description: `La galleria "${gallery.name}" è stata ${newActiveStatus ? "attivata" : "disattivata"} con successo.`
      });
    } catch (error) {

      toast({
        title: "Errore",
        description: "Non è stato possibile modificare lo stato della galleria.",
        variant: "destructive",
      });
    }
  };


  const deleteGallery = async (gallery: GalleryItem) => {
    if (!window.confirm(`Sei sicuro di voler eliminare la galleria "${gallery.name}"? Questa operazione rimuoverà TUTTE le foto e non può essere annullata.`)) {
      return;
    }

    toast({
      title: "Eliminazione in corso",
      description: "L'eliminazione della galleria potrebbe richiedere alcuni minuti...",
    });

    try {
      // Array di percorsi dello storage da controllare
      const storagePaths = [
        `gallery-photos/${gallery.id}`,
        `gallery-photos/${gallery.code}`,
        `galleries/${gallery.id}`,
        `galleries/${gallery.code}`,
        `galleries/covers/${gallery.code}_cover`
      ];

      // Funzione helper per aggiungere un delay
      const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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

                } catch (deleteError) {

                }
              });

              await Promise.all(deletePromises);


              // Piccolo ritardo tra i gruppi per evitare throttling
              await delay(500);
            }


          }
        } catch (error) {

        }
      }

      // Piccolo ritardo prima di procedere con le operazioni sul database
      await delay(1000);

      // 2. Elimina documenti dalle collezioni
      const collections = [
        { ref: collection(db, "galleries", gallery.id, "photos"), name: "photos" },
        { ref: collection(db, "galleries", gallery.id, "chapters"), name: "chapters" }
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
              const deletePromises = chunk.map(doc => deleteDoc(doc.ref));
              await Promise.all(deletePromises);


              // Piccolo ritardo tra i gruppi
              await delay(500);
            }


          }
        } catch (error) {

        }
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
            const deletePromises = chunk.map(doc => deleteDoc(doc.ref));
            await Promise.all(deletePromises);


            // Piccolo ritardo tra i gruppi
            await delay(500);
          }


        }
      } catch (error) {

      }

      // Piccolo ritardo prima di eliminare il documento principale
      await delay(500);

      // 4. Elimina il documento principale della galleria
      await deleteDoc(doc(db, "galleries", gallery.id));

      // 5. Aggiorna lo stato locale via React Query
      queryClient.invalidateQueries({ queryKey: ['galleries', 'admin'] });

      toast({
        title: "Galleria eliminata",
        description: `La galleria "${gallery.name}" e tutte le sue foto sono state eliminate con successo.`
      });
    } catch (error) {

      toast({
        title: "Errore",
        description: "Non è stato possibile eliminare completamente la galleria. Alcune risorse potrebbero essere rimaste.",
        variant: "destructive",
      });
    }
  };


  // Filtra le gallerie in base alla query di ricerca E tipo (generiche/special)
  const filteredGalleries = galleries.filter(gallery => {
    // Filtro ricerca testuale
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesSearch = (
        gallery.name.toLowerCase().includes(query) ||
        gallery.code.toLowerCase().includes(query) ||
        gallery.date.toLowerCase().includes(query)
      );
      if (!matchesSearch) return false;
    }

    // Filtro selezioni approvate
    if (selectionFilter === 'approved') {
      if (gallery.selectionStatus !== 'completed') return false;
    }

    // Filtro tipo galleria
    if (galleryTypeFilter === 'generic') {
      return !gallery.specialTheme; // Generiche = senza specialTheme
    } else if (galleryTypeFilter === 'special') {
      return !!gallery.specialTheme; // Special = con specialTheme
    }

    return true; // 'all' mostra tutte
  });

  // Calcola gli indici per la paginazione delle gallerie
  const indexOfLastGallery = currentGalleryPage * galleriesPerPage;
  const indexOfFirstGallery = indexOfLastGallery - galleriesPerPage;
  const currentGalleries = filteredGalleries.slice(indexOfFirstGallery, indexOfLastGallery);
  const totalGalleryPages = Math.ceil(filteredGalleries.length / galleriesPerPage);

  // Gestione del cambio pagina per le gallerie
  const paginateGalleries = (pageNumber: number) => setCurrentGalleryPage(pageNumber);

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
  const currentRequests = passwordRequests.slice(indexOfFirstRequest, indexOfLastRequest);
  const totalRequestPages = Math.ceil(passwordRequests.length / requestsPerPage);

  // Gestione del cambio pagina per le richieste
  const paginateRequests = (pageNumber: number) => setCurrentRequestPage(pageNumber);

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

  // Verifica se l'utente è autenticato
  if (!localStorage.getItem('isAdmin')) {
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
              <AdminCommandPalette
                onNavigate={(tab, options) => {
                  setActiveTab(tab as any);
                  if (options?.settingsSection) {
                    setSettingsSection(options.settingsSection as any);
                  }
                  if (options?.consultationSection) {
                    setActiveConsultationSection(options.consultationSection as any);
                  }
                  if (options?.bookingSection) {
                    setActiveBookingSection(options.bookingSection as any);
                  }
                  if (options?.jobSection) {
                    setActiveJobSection(options.jobSection as any);
                  }
                  if (options?.sitoSection) {
                    setActiveSitoSection(options.sitoSection as any);
                  }
                }}
              />
              <Link href={createUrl("/")}>
                <Button variant="outline" size="sm" className="h-8 sm:h-9 px-2 sm:px-3 flex items-center gap-1">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                  </svg>
                  <span className="text-xs sm:text-sm">Home</span>
                </Button>
              </Link>
              <NotificationBell />
              <Button variant="destructive" size="sm" onClick={handleLogout} className="h-8 sm:h-9 px-2 sm:px-3 text-xs sm:text-sm">
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
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span className="text-sm font-medium">
                  Sei arrivato dalla galleria: <strong>{referrerGallery.name}</strong>
                </span>
                {referrerGallery.code && (
                  <Link to={createUrl(`/gallery/${referrerGallery.code}`)}>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-white hover:text-gray-200 ml-2"
                    >
                      <svg className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                      </svg>
                      Torna alla galleria
                    </Button>
                  </Link>
                )}
              </div>
              <button
                onClick={() => {
                  sessionStorage.removeItem('adminReferrerGallery');
                  setReferrerGallery(null);
                }}
                className="text-white hover:text-gray-200 transition"
                aria-label="Chiudi banner"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      <main>
        <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
          <Tabs defaultValue="calendario" value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
            <TabsList className="mb-4 sm:mb-6 flex flex-wrap justify-start gap-0.5 sm:gap-1 h-auto p-1 bg-muted rounded-lg overflow-x-auto touch-manipulation">
              {/* Calendario Tab - prima di tutto */}
              <TabsTrigger value="calendario" className="flex-shrink-0 px-1.5 py-1.5 sm:px-2 sm:py-1.5 text-[10px] sm:text-xs md:text-sm md:px-3 md:py-2 whitespace-nowrap flex items-center gap-1 sm:gap-2 min-h-[36px] sm:min-h-[40px]">
                <Calendar className="h-3 w-3 sm:h-3.5 sm:w-3.5 md:h-4 md:w-4 flex-shrink-0" />
                <span>Calendario</span>
              </TabsTrigger>

              {/* Separatore visivo - nascosto su mobile */}
              <div className="w-px h-6 sm:h-8 bg-border mx-0.5 sm:mx-1 hidden md:block" />

              {/* Core: Gallerie con dropdown sottomenu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant={activeTab === 'galleries' || activeTab === 'questionnaire' || activeTab === 'themes' || activeTab === 'requests' ? 'default' : 'ghost'}
                    className="flex-shrink-0 px-1.5 py-1.5 sm:px-2 sm:py-1.5 text-[10px] sm:text-xs md:text-sm md:px-3 md:py-2 whitespace-nowrap flex items-center gap-1 sm:gap-2 min-h-[36px] sm:min-h-[40px]"
                  >
                    <Eye className="h-3 w-3 sm:h-3.5 sm:w-3.5 md:h-4 md:w-4 flex-shrink-0" />
                    <span>Gallerie</span>
                    <ChevronRight className="h-2.5 w-2.5 sm:h-3 sm:w-3 ml-0.5 sm:ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  <DropdownMenuItem onClick={() => setActiveTab('galleries')}>
                    <Eye className="h-4 w-4 mr-2" />
                    Gallerie Eventi
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setActiveTab('questionnaire')}>
                    <HelpCircle className="h-4 w-4 mr-2" />
                    Questionari
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setActiveTab('themes')}>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Temi Stagionali
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setActiveTab('requests')}>
                    <Key className="h-4 w-4 mr-2" />
                    Richieste Password
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Separatore visivo - nascosto su mobile */}
              <div className="w-px h-6 sm:h-8 bg-border mx-0.5 sm:mx-1 hidden md:block" />

              {/* Booking System: Prenotazioni con sub-tabs interne */}
              <TabsTrigger value="bookings" className="flex-shrink-0 px-1.5 py-1.5 sm:px-2 sm:py-1.5 text-[10px] sm:text-xs md:text-sm md:px-3 md:py-2 whitespace-nowrap flex items-center gap-1 sm:gap-2 min-h-[36px] sm:min-h-[40px]" data-testid="tab-bookings">
                <CalendarCheck className="h-3 w-3 sm:h-3.5 sm:w-3.5 md:h-4 md:w-4 flex-shrink-0" />
                <span>Prenotazioni</span>
              </TabsTrigger>

              {/* Jobs System: Lavori Fotografici */}
              <TabsTrigger value="lavori" className="flex-shrink-0 px-1.5 py-1.5 sm:px-2 sm:py-1.5 text-[10px] sm:text-xs md:text-sm md:px-3 md:py-2 whitespace-nowrap flex items-center gap-1 sm:gap-2 min-h-[36px] sm:min-h-[40px]">
                <Briefcase className="h-3 w-3 sm:h-3.5 sm:w-3.5 md:h-4 md:w-4 flex-shrink-0" />
                <span>Lavori</span>
              </TabsTrigger>

              {/* Financial Management: Cassa */}
              <TabsTrigger value="cassa" className="flex-shrink-0 px-1.5 py-1.5 sm:px-2 sm:py-1.5 text-[10px] sm:text-xs md:text-sm md:px-3 md:py-2 whitespace-nowrap flex items-center gap-1 sm:gap-2 min-h-[36px] sm:min-h-[40px]" data-testid="tab-cassa">
                <Wallet className="h-3 w-3 sm:h-3.5 sm:w-3.5 md:h-4 md:w-4 flex-shrink-0" />
                <span>Cassa</span>
              </TabsTrigger>

              {/* Richieste Info con dropdown sottomenu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant={activeTab === 'consulenze' ? 'default' : 'ghost'}
                    className="flex-shrink-0 px-1.5 py-1.5 sm:px-2 sm:py-1.5 text-[10px] sm:text-xs md:text-sm md:px-3 md:py-2 whitespace-nowrap flex items-center gap-1 sm:gap-2 min-h-[36px] sm:min-h-[40px]"
                  >
                    <CalendarCheck className="h-3 w-3 sm:h-3.5 sm:w-3.5 md:h-4 md:w-4 flex-shrink-0" />
                    <span>Richieste Info</span>
                    <ChevronRight className="h-2.5 w-2.5 sm:h-3 sm:w-3 ml-0.5 sm:ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  <DropdownMenuItem onClick={() => {
                    setActiveTab('consulenze');
                    setActiveConsultationSection('consulenze');
                  }}>
                    <CalendarCheck className="h-4 w-4 mr-2" />
                    Richieste Info
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => {
                    setActiveTab('consulenze');
                    setActiveConsultationSection('consulenze-templates');
                  }}>
                    <FileText className="h-4 w-4 mr-2" />
                    Template Richieste
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Separatore visivo - nascosto su mobile */}
              <div className="w-px h-6 sm:h-8 bg-border mx-0.5 sm:mx-1 hidden md:block" />

              {/* Settings con dropdown sottomenu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant={activeTab === 'settings' ? 'default' : 'ghost'}
                    className="flex-shrink-0 px-1.5 py-1.5 sm:px-2 sm:py-1.5 text-[10px] sm:text-xs md:text-sm md:px-3 md:py-2 whitespace-nowrap flex items-center gap-1 sm:gap-2 min-h-[36px] sm:min-h-[40px]"
                  >
                    <Settings className="h-3 w-3 sm:h-3.5 sm:w-3.5 md:h-4 md:w-4 flex-shrink-0" />
                    <span>Impostazioni</span>
                    <ChevronRight className="h-2.5 w-2.5 sm:h-3 sm:w-3 ml-0.5 sm:ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  <DropdownMenuItem onClick={() => {
                    setActiveTab('settings');
                    setSettingsSection('studio');
                  }}>
                    <Settings className="h-4 w-4 mr-2" />
                    Impostazioni Studio
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => {
                    setActiveTab('settings');
                    setSettingsSection('slideshow');
                  }}>
                    <Play className="h-4 w-4 mr-2" />
                    Slideshow Homepage
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => {
                    setActiveTab('settings');
                    setSettingsSection('products');
                  }}>
                    <Package className="h-4 w-4 mr-2" />
                    Catalogo Prodotti
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => {
                    setActiveTab('settings');
                    setSettingsSection('product-categories');
                  }}>
                    <FolderOpen className="h-4 w-4 mr-2" />
                    Categorie Prodotti
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Separatore visivo - nascosto su mobile */}
              <div className="w-px h-6 sm:h-8 bg-border mx-0.5 sm:mx-1 hidden md:block" />

              {/* Collaboratori Tab */}
              <TabsTrigger value="collaboratori" className="flex-shrink-0 px-1.5 py-1.5 sm:px-2 sm:py-1.5 text-[10px] sm:text-xs md:text-sm md:px-3 md:py-2 whitespace-nowrap flex items-center gap-1 sm:gap-2 min-h-[36px] sm:min-h-[40px]">
                <Users className="h-3 w-3 sm:h-3.5 sm:w-3.5 md:h-4 md:w-4 flex-shrink-0" />
                <span>Collaboratori</span>
              </TabsTrigger>

              {/* Email Massivo Tab */}
              <TabsTrigger value="bulkEmail" className="flex-shrink-0 px-1.5 py-1.5 sm:px-2 sm:py-1.5 text-[10px] sm:text-xs md:text-sm md:px-3 md:py-2 whitespace-nowrap flex items-center gap-1 sm:gap-2 min-h-[36px] sm:min-h-[40px]" data-testid="tab-bulk-email">
                <Mail className="h-3 w-3 sm:h-3.5 sm:w-3.5 md:h-4 md:w-4 flex-shrink-0" />
                <span>Email Massivo</span>
              </TabsTrigger>

              {/* Sito Pubblico Tab */}
              <TabsTrigger value="sitoPublico" className="flex-shrink-0 px-1.5 py-1.5 sm:px-2 sm:py-1.5 text-[10px] sm:text-xs md:text-sm md:px-3 md:py-2 whitespace-nowrap flex items-center gap-1 sm:gap-2 min-h-[36px] sm:min-h-[40px]" data-testid="tab-sito-pubblico">
                <Globe className="h-3 w-3 sm:h-3.5 sm:w-3.5 md:h-4 md:w-4 flex-shrink-0" />
                <span>Sito Pubblico</span>
              </TabsTrigger>

              {/* Video Tab */}
              <TabsTrigger value="videos" className="flex-shrink-0 px-1.5 py-1.5 sm:px-2 sm:py-1.5 text-[10px] sm:text-xs md:text-sm md:px-3 md:py-2 whitespace-nowrap flex items-center gap-1 sm:gap-2 min-h-[36px] sm:min-h-[40px]">
                <Play className="h-3 w-3 sm:h-3.5 sm:w-3.5 md:h-4 md:w-4 flex-shrink-0" />
                <span>Video</span>
              </TabsTrigger>
            </TabsList>

            {/* Contenuto Tab Calendario */}
            <TabsContent value="calendario">
              <CalendarioManager />
            </TabsContent>

            {/* Gallerie Tab */}
            <TabsContent value="galleries">
              <div className="space-y-4">
                {/* Header con statistiche - Collapsibile */}
                <Collapsible open={galleriesExpanded} onOpenChange={setGalleriesExpanded}>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" className="p-0 h-auto">
                          {galleriesExpanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRightIcon className="h-5 w-5" />}
                        </Button>
                      </CollapsibleTrigger>
                      <div>
                        <h2 className="text-2xl font-bold text-blue-gray">📸 Gestione Gallerie</h2>
                        <p className="text-sm text-muted-foreground">
                          {referrerGallery && (
                            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-medium mb-2">
                              <span>🔗 Collegato da: {referrerGallery.name}</span>
                              {referrerGallery.code && <code className="text-[10px] bg-blue-100 px-1.5 py-0.5 rounded">{referrerGallery.code}</code>}
                              <button
                                onClick={() => {
                                  sessionStorage.removeItem('adminReferrerGallery');
                                  setReferrerGallery(null);
                                }}
                                className="ml-1 hover:text-blue-900"
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
                    <div className="bg-white shadow sm:rounded-lg p-5">
                      <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
                        <div className="w-full sm:w-auto">
                          <h3 className="text-xl font-semibold text-blue-gray mb-2">Gallerie Eventi</h3>
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
                          <Button onClick={openModal} className="whitespace-nowrap">
                            <Plus className="mr-2 h-4 w-4" /> Nuova Galleria Evento
                          </Button>
                        </div>
                      </div>

                      {/* 🎨 Filtri Tipo Galleria - Migliorati per mobile */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                        {/* Filtro Tipo Galleria */}
                        <div className="space-y-2">
                          <label className="text-xs font-medium text-gray-600 uppercase tracking-wider">Tipo Galleria</label>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              variant={galleryTypeFilter === 'generic' ? 'default' : 'outline'}
                              size="sm"
                              onClick={() => setGalleryTypeFilter('generic')}
                              className="flex-1 sm:flex-initial min-w-[100px] flex items-center justify-center gap-2 transition-all"
                              data-testid="filter-generic-galleries"
                            >
                              <span className="text-base">🏠</span>
                              <span className="text-xs sm:text-sm">Generiche</span>
                            </Button>
                            <Button
                              variant={galleryTypeFilter === 'special' ? 'default' : 'outline'}
                              size="sm"
                              onClick={() => setGalleryTypeFilter('special')}
                              className="flex-1 sm:flex-initial min-w-[100px] flex items-center justify-center gap-2 transition-all"
                              data-testid="filter-special-galleries"
                            >
                              <span className="text-base">🎨</span>
                              <span className="text-xs sm:text-sm">Tematiche</span>
                            </Button>
                            <Button
                              variant={galleryTypeFilter === 'all' ? 'default' : 'outline'}
                              size="sm"
                              onClick={() => setGalleryTypeFilter('all')}
                              className="flex-1 sm:flex-initial min-w-[100px] flex items-center justify-center gap-2 transition-all"
                              data-testid="filter-all-galleries"
                            >
                              <span className="text-base">📋</span>
                              <span className="text-xs sm:text-sm">Tutte</span>
                            </Button>
                          </div>
                        </div>

                        {/* Filtro Selezioni */}
                        <div className="space-y-2">
                          <label className="text-xs font-medium text-gray-600 uppercase tracking-wider">Selezioni Foto</label>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              variant={selectionFilter === 'all' ? 'default' : 'outline'}
                              size="sm"
                              onClick={() => setSelectionFilter('all')}
                              className="flex-1 sm:flex-initial min-w-[100px] flex items-center justify-center gap-2 transition-all"
                              data-testid="filter-all-selections"
                            >
                              <span className="text-base">📷</span>
                              <span className="text-xs sm:text-sm">Tutte</span>
                            </Button>
                            <Button
                              variant={selectionFilter === 'approved' ? 'default' : 'outline'}
                              size="sm"
                              onClick={() => setSelectionFilter('approved')}
                              className="flex-1 sm:flex-initial min-w-[140px] flex items-center justify-center gap-2 transition-all bg-green-50 hover:bg-green-100 border-green-200"
                              data-testid="filter-approved-selections"
                            >
                              <span className="text-base">✅</span>
                              <span className="text-xs sm:text-sm">Approvate</span>
                            </Button>
                          </div>
                        </div>
                      </div>

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
                          <p className="text-gray-500">Nessuna galleria eventi trovata.</p>
                          <Button
                            onClick={openModal}
                            variant="outline"
                            className="mt-4"
                          >
                            <Plus className="mr-2 h-4 w-4" /> Crea la tua prima galleria evento
                          </Button>
                        </div>
                      ) : (
                        <>
                          {/* Vista Desktop - Tabella */}
                          <div className="hidden lg:block overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Nome
                                  </th>
                                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Codice
                                  </th>
                                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Data
                                  </th>
                                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Foto
                                  </th>
                                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Selezione
                                  </th>
                                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Stato
                                  </th>
                                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Azioni
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="bg-white divide-y divide-gray-200">
                                {currentGalleries.map((gallery) => (
                                  <tr key={gallery.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-4 py-4">
                                      <div className="text-sm font-medium text-gray-900">{gallery.name}</div>
                                    </td>
                                    <td className="px-4 py-4">
                                      <code className="text-xs bg-gray-100 px-2 py-1 rounded">{gallery.code}</code>
                                    </td>
                                    <td className="px-4 py-4 whitespace-nowrap">
                                      <div className="text-sm text-gray-500">{gallery.date}</div>
                                    </td>
                                    <td className="px-4 py-4 whitespace-nowrap">
                                      <span className="text-sm font-semibold text-gray-700">{gallery.photoCount || 0}</span>
                                    </td>
                                    <td className="px-4 py-4 whitespace-nowrap">
                                      {gallery.selectionStatus === 'completed' ? (
                                        <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                                          ✅ Completata
                                        </span>
                                      ) : gallery.selectionEnabled ? (
                                        <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">
                                          ⏳ In attesa
                                        </span>
                                      ) : (
                                        <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-500">
                                          -
                                        </span>
                                      )}
                                    </td>
                                    <td className="px-4 py-4 whitespace-nowrap">
                                      <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                        gallery.active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                      }`}>
                                        {gallery.active ? 'Attiva' : 'Disattivata'}
                                      </span>
                                    </td>
                                    <td className="px-4 py-4 whitespace-nowrap">
                                      <div className="flex gap-1">
                                        <Link to={createUrl(`/gallery/${gallery.code}`)} target="_blank">
                                          <Button
                                            variant="outline"
                                            size="icon"
                                            className="h-9 w-9 bg-green-50 hover:bg-green-100 border-green-200 transition-colors"
                                            title="Visualizza galleria"
                                          >
                                            <Eye className="h-4 w-4 text-green-600" />
                                          </Button>
                                        </Link>
                                        {isCurrentUserAdmin() && (
                                          <Button
                                            variant="outline"
                                            size="icon"
                                            className="h-9 w-9 hover:bg-gray-100 transition-colors"
                                            onClick={() => openEditModal(gallery)}
                                            title="Modifica galleria"
                                          >
                                            <Edit className="h-4 w-4" />
                                          </Button>
                                        )}
                                        {isCurrentUserAdmin() && (
                                          <Link to={createUrl(`/admin/gallery/${gallery.id}/manage`)}>
                                            <Button
                                              variant="outline"
                                              size="icon"
                                              className="h-9 w-9 bg-blue-50 hover:bg-blue-100 border-blue-200 transition-colors"
                                              title="Gestisci galleria"
                                              data-testid="button-manage-gallery"
                                            >
                                              <FolderOpen className="h-4 w-4 text-blue-600" />
                                            </Button>
                                          </Link>
                                        )}
                                        <Button
                                          variant={gallery.active ? "destructive" : "default"}
                                          size="icon"
                                          className="h-9 w-9 transition-colors"
                                          onClick={() => toggleGalleryStatus(gallery)}
                                          title={gallery.active ? "Disattiva galleria" : "Attiva galleria"}
                                        >
                                          {gallery.active ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                        </Button>
                                        <Link to={createUrl(`/admin/galleries/${gallery.id}/questionnaire`)}>
                                          <Button
                                            variant="outline"
                                            size="icon"
                                            className="h-9 w-9 bg-purple-50 hover:bg-purple-100 border-purple-200 transition-colors"
                                            title="Gestisci questionario"
                                          >
                                            <HelpCircle className="h-4 w-4 text-purple-600" />
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
                              <div key={gallery.id} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
                                <div className="flex items-start justify-between mb-3">
                                  <div className="flex-1 min-w-0">
                                    <h3 className="text-base font-semibold text-gray-900 truncate">{gallery.name}</h3>
                                    <div className="flex items-center gap-2 mt-1">
                                      <code className="text-xs bg-gray-100 px-2 py-1 rounded">{gallery.code}</code>
                                      <span className={`px-2 py-1 inline-flex text-xs font-semibold rounded-full ${
                                        gallery.active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                      }`}>
                                        {gallery.active ? '✓ Attiva' : '✕ Off'}
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3 text-sm mb-3">
                                  <div>
                                    <span className="text-gray-500">Data:</span>
                                    <p className="font-medium text-gray-900">{gallery.date}</p>
                                  </div>
                                  <div>
                                    <span className="text-gray-500">Foto:</span>
                                    <p className="font-semibold text-gray-900">{gallery.photoCount || 0}</p>
                                  </div>
                                  <div className="col-span-2">
                                    <span className="text-gray-500 block mb-1">Selezione:</span>
                                    {gallery.selectionStatus === 'completed' ? (
                                      <span className="px-3 py-1 inline-flex text-xs font-semibold rounded-full bg-green-100 text-green-800">
                                        ✅ Completata
                                      </span>
                                    ) : gallery.selectionEnabled ? (
                                      <span className="px-3 py-1 inline-flex text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">
                                        ⏳ In attesa
                                      </span>
                                    ) : (
                                      <span className="px-3 py-1 inline-flex text-xs font-semibold rounded-full bg-gray-100 text-gray-500">
                                        Non attiva
                                      </span>
                                    )}
                                  </div>
                                </div>

                                <div className="flex flex-wrap gap-2 pt-3 border-t border-gray-200">
                                  <Link to={createUrl(`/gallery/${gallery.code}`)} target="_blank" className="flex-1 min-w-[120px]">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="w-full bg-green-50 hover:bg-green-100 border-green-200 text-green-700"
                                    >
                                      <Eye className="h-4 w-4 mr-1" />
                                      Visualizza
                                    </Button>
                                  </Link>
                                  {isCurrentUserAdmin() && (
                                    <Link to={createUrl(`/admin/gallery/${gallery.id}/manage`)} className="flex-1 min-w-[120px]">
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="w-full bg-blue-50 hover:bg-blue-100 border-blue-200 text-blue-700"
                                        data-testid="button-manage-gallery"
                                      >
                                        <FolderOpen className="h-4 w-4 mr-1" />
                                        Gestisci
                                      </Button>
                                    </Link>
                                  )}
                                  {isCurrentUserAdmin() && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="flex-1 min-w-[100px]"
                                      onClick={() => openEditModal(gallery)}
                                    >
                                      <Edit className="h-4 w-4 mr-1" />
                                      Modifica
                                    </Button>
                                  )}
                                  <Button
                                    variant={gallery.active ? "destructive" : "default"}
                                    size="sm"
                                    className="flex-1 min-w-[100px]"
                                    onClick={() => toggleGalleryStatus(gallery)}
                                  >
                                    {gallery.active ? <EyeOff className="h-4 w-4 mr-1" /> : <Eye className="h-4 w-4 mr-1" />}
                                    {gallery.active ? 'Disattiva' : 'Attiva'}
                                  </Button>
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button variant="outline" size="sm" className="flex-1 min-w-[80px]">
                                        Altro
                                        <ChevronRight className="h-4 w-4 ml-1" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      <DropdownMenuItem asChild>
                                        <Link to={createUrl(`/admin/galleries/${gallery.id}/questionnaire`)}>
                                          <HelpCircle className="h-4 w-4 mr-2" />
                                          Questionario
                                        </Link>
                                      </DropdownMenuItem>
                                      <DropdownMenuItem onClick={() => deleteGallery(gallery)} className="text-red-600">
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
                  <h2 className="text-xl font-semibold text-blue-gray mb-2">Gestione Questionari</h2>
                  <p className="text-sm text-muted-foreground">
                    Crea e gestisci questionari per sposi con generazione link sicuri e export ChatGPT.
                  </p>
                </div>
                <QuestionnaireManager />
              </div>
            </TabsContent>

            {/* Contenuto Tab Temi Stagionali */}
            <TabsContent value="themes">
              <div className="bg-white shadow sm:rounded-lg p-5">
                <div className="mb-6">
                  <h2 className="text-xl font-semibold text-blue-gray mb-2">Temi Stagionali</h2>
                  <p className="text-sm text-muted-foreground">
                    Visualizza i temi disponibili e le gallerie associate. I temi possono essere assegnati durante la creazione di una galleria.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {getAllThemes().map((theme) => {
                    const galleriesWithTheme = galleries.filter(g => g.specialTheme === theme.id);

                    return (
                      <Card key={theme.id} className="border-2" style={{ borderColor: theme.colors.primary + '30' }}>
                        <CardHeader className="pb-3">
                          <div className="flex items-center gap-3">
                            <span className="text-3xl">{theme.icon}</span>
                            <div>
                              <CardTitle className="text-lg">{theme.name}</CardTitle>
                              {theme.description && (
                                <CardDescription className="text-xs mt-1">{theme.description}</CardDescription>
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
                            <span className="text-xs text-muted-foreground">Colore principale</span>
                          </div>

                          <div className="pt-2 border-t">
                            <p className="text-xs font-medium text-muted-foreground mb-2">
                              Gallerie con questo tema: {galleriesWithTheme.length}
                            </p>
                            {galleriesWithTheme.length > 0 && (
                              <div className="space-y-1">
                                {galleriesWithTheme.slice(0, 3).map(gallery => (
                                  <div key={gallery.id} className="text-xs bg-muted p-2 rounded flex items-center justify-between">
                                    <span className="font-medium truncate">{gallery.name}</span>
                                    {gallery.specialPin && (
                                      <span className="ml-2 px-2 py-0.5 bg-primary/10 text-primary rounded text-xs font-mono">
                                        PIN: {gallery.specialPin}
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
                  <h3 className="font-medium text-blue-900 dark:text-blue-100 mb-2">Come usare i temi stagionali</h3>
                  <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1 list-disc list-inside">
                    <li>Crea una nuova galleria dal tab "Gallerie"</li>
                    <li>Seleziona un tema stagionale dal dropdown</li>
                    <li>Assegna un PIN univoco per l'accesso</li>
                    <li>La galleria sarà accessibile tramite la sezione "Gallerie Speciali" in homepage</li>
                  </ul>
                </div>
              </div>
            </TabsContent>

            {/* Contenuto Tab Richieste Password */}
            <TabsContent value="requests">
              <div className="space-y-4">
                <Collapsible open={requestsExpanded} onOpenChange={setRequestsExpanded}>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" className="p-0 h-auto">
                          {requestsExpanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRightIcon className="h-5 w-5" />}
                        </Button>
                      </CollapsibleTrigger>
                      <div>
                        <h2 className="text-2xl font-bold text-blue-gray">🔑 Richieste Password</h2>
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
                          <p className="text-gray-500">Nessuna richiesta di password ricevuta.</p>
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                              <tr>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  Data
                                </th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  Nome
                                </th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  Email
                                </th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  Galleria
                                </th>
                                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
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
                                    <div className="text-sm text-gray-500">{request.email}</div>
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
                                      onClick={() => deletePasswordRequest(request.id)}
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
                            onPrevious={() => setCurrentRequestPage(p => Math.max(1, p - 1))}
                            onNext={() => setCurrentRequestPage(p => Math.min(totalRequestPages, p + 1))}
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
                <Collapsible open={bookingsExpanded} onOpenChange={setBookingsExpanded}>
                  <Tabs value={activeBookingSection} onValueChange={(value: any) => setActiveBookingSection(value)}>
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" size="sm" className="p-0 h-auto">
                            {bookingsExpanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRightIcon className="h-5 w-5" />}
                          </Button>
                        </CollapsibleTrigger>
                        <div>
                          <h2 className="text-2xl font-bold text-blue-gray">📅 Gestione Prenotazioni</h2>
                          <p className="text-sm text-muted-foreground">
                            Gestisci prenotazioni, campagne e ordini
                          </p>
                        </div>
                      </div>
                    </div>

                    <TabsList className="grid w-full grid-cols-3 gap-1 mb-4">
                      <TabsTrigger value="bookings-list" className="flex-shrink-0 px-3 py-2 text-sm whitespace-nowrap flex items-center gap-2">
                        <CalendarCheck className="h-4 w-4 flex-shrink-0" />
                        Prenotazioni
                      </TabsTrigger>
                      <TabsTrigger value="campaigns" className="flex-shrink-0 px-3 py-2 text-sm whitespace-nowrap flex items-center gap-2">
                        <Calendar className="h-4 w-4 flex-shrink-0" />
                        Campagne
                      </TabsTrigger>
                      <TabsTrigger value="orders" className="flex-shrink-0 px-3 py-2 text-sm whitespace-nowrap flex items-center gap-2">
                        <ShoppingBag className="h-4 w-4 flex-shrink-0" />
                        Ordini
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="bookings-list">
                      <BookingsManager
                        highlightBookingId={highlightBookingId}
                        onHighlightComplete={handleBookingHighlightComplete}
                        onRequestOpenOrdersTab={(orderId) => {
                          setActiveBookingSection('orders');
                          setHighlightOrderId(orderId);
                        }}
                      />
                    </TabsContent>

                    <TabsContent value="campaigns">
                      <CampaignsManager />
                    </TabsContent>

                    <TabsContent value="orders">
                      <OrdersManager
                        highlightOrderId={highlightOrderId}
                        onHighlightComplete={() => setHighlightOrderId(null)}
                      />
                    </TabsContent>
                  </Tabs>
                </Collapsible>
              </div>
            </TabsContent>

            {/* Contenuto Tab Lavori */}
            <TabsContent value="lavori">
              <Tabs value={activeJobSection} onValueChange={(v) => setActiveJobSection(v as any)} className="w-full">
                <TabsList className="grid w-full grid-cols-2 lg:grid-cols-5 gap-1 mb-4">
                  <TabsTrigger value="jobs-list" data-testid="subtab-jobs-list">
                    Lista Lavori
                  </TabsTrigger>
                  <TabsTrigger value="clienti" data-testid="subtab-clienti">
                    Clienti
                  </TabsTrigger>
                  <TabsTrigger value="job-types" data-testid="subtab-job-types">
                    Tipi di Lavoro
                  </TabsTrigger>
                  <TabsTrigger value="contract-clauses" data-testid="subtab-contract-clauses">
                    Clausole Contrattuali
                  </TabsTrigger>
                  <TabsTrigger value="quote-templates" className="data-[state=active]:bg-sage data-[state=active]:text-white">
                    <FileText className="w-4 h-4 mr-2" />
                    Template Preventivi
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="jobs-list">
                  <div className="bg-white shadow sm:rounded-lg p-5">
                    <JobsManager />
                  </div>
                </TabsContent>

                <TabsContent value="clienti">
                  <div className="space-y-4">
                    <Collapsible open={clientiExpanded} onOpenChange={setClientiExpanded}>
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <CollapsibleTrigger asChild>
                            <Button variant="ghost" size="sm" className="p-0 h-auto">
                              {clientiExpanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRightIcon className="h-5 w-5" />}
                            </Button>
                          </CollapsibleTrigger>
                          <div>
                            <h2 className="text-2xl font-bold text-blue-gray">👥 Gestione Clienti</h2>
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

                <TabsContent value="contract-clauses">
                  <div className="bg-white shadow sm:rounded-lg p-5">
                    <ContractClausesManager />
                  </div>
                </TabsContent>

                <TabsContent value="quote-templates">
                  <QuoteTemplatesManager />
                </TabsContent>
              </Tabs>
            </TabsContent>

            {/* Contenuto Tab Cassa */}
            <TabsContent value="cassa">
              <CashDashboard />
            </TabsContent>

            {/* Contenuto Tab Richieste Info con Sub-Tabs */}
            <TabsContent value="consulenze">
              <Tabs value={activeConsultationSection} onValueChange={(v) => setActiveConsultationSection(v as any)} className="w-full">
                <TabsList className="mb-4 flex flex-wrap justify-start gap-1 h-auto p-1 bg-muted/50 rounded-lg">
                  <TabsTrigger value="consulenze" className="flex-shrink-0 px-3 py-2 text-sm whitespace-nowrap flex items-center gap-2">
                    <CalendarCheck className="h-4 w-4 flex-shrink-0" />
                    Richieste Info
                  </TabsTrigger>
                  <TabsTrigger value="consulenze-templates" className="flex-shrink-0 px-3 py-2 text-sm whitespace-nowrap flex items-center gap-2">
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
              <Tabs value={settingsSection} onValueChange={(v) => setSettingsSection(v as any)} className="w-full">
                <TabsList className="mb-4 flex flex-wrap justify-start gap-1 h-auto p-1 bg-muted/50 rounded-lg">
                  <TabsTrigger value="studio" className="flex-shrink-0 px-3 py-2 text-sm whitespace-nowrap flex items-center gap-2">
                    <Settings className="h-4 w-4 flex-shrink-0" />
                    Impostazioni Studio
                  </TabsTrigger>
                  <TabsTrigger value="slideshow" className="flex-shrink-0 px-3 py-2 text-sm whitespace-nowrap flex items-center gap-2">
                    <Play className="h-4 w-4 flex-shrink-0" />
                    Slideshow Homepage
                  </TabsTrigger>
                  <TabsTrigger value="products" className="flex-shrink-0 px-3 py-2 text-sm whitespace-nowrap flex items-center gap-2">
                    <Package className="h-4 w-4 flex-shrink-0" />
                    Catalogo Prodotti
                  </TabsTrigger>
                  <TabsTrigger value="product-categories" className="flex-shrink-0 px-3 py-2 text-sm whitespace-nowrap flex items-center gap-2">
                    <FolderOpen className="h-4 w-4 flex-shrink-0" />
                    Categorie Prodotti
                  </TabsTrigger>
                  <TabsTrigger value="migration" className="flex-shrink-0 px-3 py-2 text-sm whitespace-nowrap flex items-center gap-2">
                    <RefreshCw className="h-4 w-4 flex-shrink-0" />
                    Migrazione Foto
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="studio">
                  <div className="bg-white shadow sm:rounded-lg p-5">
                    <div className="flex justify-between items-center mb-6">
                      <div>
                        <h2 className="text-xl font-semibold text-blue-gray mb-2">Impostazioni studio</h2>
                        <p className="text-sm text-muted-foreground">
                          Modifica le informazioni del tuo studio fotografico.
                        </p>
                      </div>

                      <Button onClick={saveStudioSettings}>
                        Salva impostazioni
                      </Button>
                    </div>

                    {isSettingsLoading ? (
                      <div className="space-y-4">
                        {[...Array(6)].map((_, i) => (
                          <Skeleton key={i} className="h-10 w-full" />
                        ))}
                      </div>
                    ) : (
                      <div className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <Label htmlFor="studio-name">Nome dello Studio</Label>
                              <Input
                                id="studio-name"
                                value={studioSettings.name}
                                onChange={(e) => handleSettingsChange('name', e.target.value)}
                                placeholder="Nome del tuo studio fotografico"
                              />
                            </div>

                            <div className="space-y-2">
                              <Label htmlFor="studio-slogan">Slogan</Label>
                              <Input
                                id="studio-slogan"
                                value={studioSettings.slogan}
                                onChange={(e) => handleSettingsChange('slogan', e.target.value)}
                                placeholder="Slogan del tuo studio"
                              />
                            </div>

                            <div className="space-y-2">
                              <Label htmlFor="studio-address">Indirizzo</Label>
                              <Input
                                id="studio-address"
                                value={studioSettings.address}
                                onChange={(e) => handleSettingsChange('address', e.target.value)}
                                placeholder="Indirizzo fisico dello studio"
                              />
                            </div>

                            <div className="space-y-2">
                              <Label htmlFor="studio-phone">Telefono</Label>
                              <Input
                                id="studio-phone"
                                value={studioSettings.phone}
                                onChange={(e) => handleSettingsChange('phone', e.target.value)}
                                placeholder="Numero di telefono"
                              />
                            </div>

                            <div className="space-y-2">
                              <Label htmlFor="studio-email">Email</Label>
                              <Input
                                id="studio-email"
                                value={studioSettings.email}
                                onChange={(e) => handleSettingsChange('email', e.target.value)}
                                placeholder="Indirizzo email"
                              />
                            </div>

                            <div className="space-y-2">
                              <Label htmlFor="studio-partita-iva">Partita IVA (per ricevute)</Label>
                              <Input
                                id="studio-partita-iva"
                                value={studioSettings.partitaIVA || ''}
                                onChange={(e) => handleSettingsChange('partitaIVA', e.target.value)}
                                placeholder="IT12345678901"
                              />
                            </div>

                            <div className="space-y-2">
                              <Label htmlFor="studio-codice-fiscale">Codice Fiscale (per ricevute)</Label>
                              <Input
                                id="studio-codice-fiscale"
                                value={studioSettings.codiceFiscale || ''}
                                onChange={(e) => handleSettingsChange('codiceFiscale', e.target.value)}
                                placeholder="RSSMRA80A01H501Z"
                                type="email"
                              />
                            </div>

                            <div className="space-y-2">
                              <Label htmlFor="studio-website">Sito Web</Label>
                              <Input
                                id="studio-website"
                                value={studioSettings.websiteUrl}
                                onChange={(e) => handleSettingsChange('websiteUrl', e.target.value)}
                                placeholder="URL del sito web"
                                type="url"
                              />
                            </div>
                          </div>

                          <div className="space-y-4">
                            <div>
                              <Label>Logo</Label>
                              <div className="mt-2">
                                {studioSettings.logo ? (
                                  <div className="mb-2">
                                    <img
                                      src={studioSettings.logo}
                                      alt="Logo dello studio"
                                      className="h-24 w-auto object-contain rounded-md"
                                      onError={(e) => {
                                        console.error('Logo loading error:', e);
                                        e.currentTarget.style.display = 'none';
                                      }}
                                    />
                                  </div>
                                ) : null}

                                <Label
                                  htmlFor="logo-upload"
                                  className="cursor-pointer inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
                                >
                                  {studioSettings.logo ? "Cambia logo" : "Carica logo"}
                                </Label>
                                <Input
                                  id="logo-upload"
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  onChange={handleLogoUpload}
                                />
                              </div>
                            </div>

                            <div className="space-y-2">
                              <Label htmlFor="studio-about">Descrizione Studio</Label>
                              <Textarea
                                id="studio-about"
                                value={studioSettings.about}
                                onChange={(e) => handleSettingsChange('about', e.target.value)}
                                placeholder="Descrizione del tuo studio fotografico"
                                rows={4}
                              />
                            </div>

                            <div className="space-y-4">
                              <Label>Social Media</Label>

                              <div className="space-y-2">
                                <Label htmlFor="social-instagram">Instagram (solo username)</Label>
                                <Input
                                  id="social-instagram"
                                  value={studioSettings.socialLinks.instagram || ''}
                                  onChange={(e) => handleSettingsChange('socialLinks', e.target.value, 'instagram')}
                                  placeholder="username (senza @)"
                                />
                              </div>

                              <div className="space-y-2">
                                <Label htmlFor="social-facebook">Facebook (solo username)</Label>
                                <Input
                                  id="social-facebook"
                                  value={studioSettings.socialLinks.facebook || ''}
                                  onChange={(e) => handleSettingsChange('socialLinks', e.target.value, 'facebook')}
                                  placeholder="username o ID pagina"
                                />
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="border-t pt-6 mt-6">
                          <h3 className="text-lg font-medium mb-4">Testi personalizzabili</h3>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                              <h4 className="font-medium mb-3">Sezione Hero</h4>
                              <div className="space-y-3">
                                <div className="space-y-2">
                                  <Label htmlFor="hero-title">Titolo principale</Label>
                                  <Input
                                    id="hero-title"
                                    value={studioSettings.heroTitle || ''}
                                    onChange={(e) => handleSettingsChange('heroTitle', e.target.value)}
                                    placeholder="Titolo principale della pagina"
                                  />
                                </div>

                                <div className="space-y-2">
                                  <Label htmlFor="hero-subtitle">Sottotitolo</Label>
                                  <Input
                                    id="hero-subtitle"
                                    value={studioSettings.heroSubtitle || ''}
                                    onChange={(e) => handleSettingsChange('heroSubtitle', e.target.value)}
                                    placeholder="Sottotitolo della pagina"
                                  />
                                </div>

                                <div className="space-y-2">
                                  <Label htmlFor="hero-button">Testo pulsante</Label>
                                  <Input
                                    id="hero-button"
                                    value={studioSettings.heroButtonText || ''}
                                    onChange={(e) => handleSettingsChange('heroButtonText', e.target.value)}
                                    placeholder="Testo del pulsante principale"
                                  />
                                </div>
                              </div>
                            </div>

                            <div>
                              <h4 className="font-medium mb-3">Sezione WhatsApp</h4>
                              <div className="space-y-3">
                                <div className="space-y-2">
                                  <Label htmlFor="whatsapp-title">Titolo</Label>
                                  <Input
                                    id="whatsapp-title"
                                    value={studioSettings.whatsappTitle || ''}
                                    onChange={(e) => handleSettingsChange('whatsappTitle', e.target.value)}
                                    placeholder="Titolo sezione WhatsApp"
                                  />
                                </div>

                                <div className="space-y-2">
                                  <Label htmlFor="whatsapp-subtitle">Sottotitolo</Label>
                                  <Input
                                    id="whatsapp-subtitle"
                                    value={studioSettings.whatsappSubtitle || ''}
                                    onChange={(e) => handleSettingsChange('whatsappSubtitle', e.target.value)}
                                    placeholder="Sottotitolo sezione WhatsApp"
                                  />
                                </div>

                                <div className="space-y-2">
                                  <Label htmlFor="whatsapp-text">Testo descrittivo</Label>
                                  <Textarea
                                    id="whatsapp-text"
                                    value={studioSettings.whatsappText || ''}
                                    onChange={(e) => handleSettingsChange('whatsappText', e.target.value)}
                                    placeholder="Testo descrittivo della sezione"
                                    rows={2}
                                  />
                                </div>

                                <div className="space-y-2">
                                  <Label htmlFor="whatsapp-button">Testo pulsante</Label>
                                  <Input
                                    id="whatsapp-button"
                                    value={studioSettings.whatsappButtonText || ''}
                                    onChange={(e) => handleSettingsChange('whatsappButtonText', e.target.value)}
                                    placeholder="Testo del pulsante WhatsApp"
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="slideshow">
                  <div className="bg-white shadow sm:rounded-lg p-5">
                    <h2 className="text-xl font-semibold text-blue-gray mb-4">Gestione Slideshow Homepage</h2>
                    <p className="text-sm text-muted-foreground mb-6">
                      Seleziona le foto da mostrare nella slideshow della homepage.
                    </p>
                    <SlideshowManager />
                  </div>
                </TabsContent>

                <TabsContent value="products">
                  <div className="bg-white shadow sm:rounded-lg p-5">
                    <ProductsManager />
                  </div>
                </TabsContent>

                <TabsContent value="product-categories">
                  <div className="bg-white shadow sm:rounded-lg p-5">
                    <ProductCategoriesManager />
                  </div>
                </TabsContent>

                <TabsContent value="migration">
                  <PhotosMigration />
                </TabsContent>
              </Tabs>
            </TabsContent>

            {/* Contenuto Tab Richieste Info con Sub-Tabs */}
            <TabsContent value="consulenze">
              <Tabs value={activeConsultationSection} onValueChange={(v) => setActiveConsultationSection(v as any)} className="w-full">
                <TabsList className="mb-4 flex flex-wrap justify-start gap-1 h-auto p-1 bg-muted/50 rounded-lg">
                  <TabsTrigger value="consulenze" className="flex-shrink-0 px-3 py-2 text-sm whitespace-nowrap flex items-center gap-2">
                    <CalendarCheck className="h-4 w-4 flex-shrink-0" />
                    Richieste Info
                  </TabsTrigger>
                  <TabsTrigger value="consulenze-templates" className="flex-shrink-0 px-3 py-2 text-sm whitespace-nowrap flex items-center gap-2">
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
              <Tabs value={activeSitoSection} onValueChange={(v) => setActiveSitoSection(v as any)} className="w-full">
                <TabsList className="mb-4 flex flex-wrap justify-start gap-1 h-auto p-1 bg-muted/50 rounded-lg">
                  <TabsTrigger value="portfolio" className="flex-shrink-0 px-3 py-2 text-sm whitespace-nowrap flex items-center gap-2" data-testid="subtab-portfolio">
                    <Grid3x3 className="h-4 w-4 flex-shrink-0" />
                    Portfolio Pubblico
                  </TabsTrigger>
                  <TabsTrigger value="blog" className="flex-shrink-0 px-3 py-2 text-sm whitespace-nowrap flex items-center gap-2" data-testid="subtab-blog">
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
          queryClient.invalidateQueries({ queryKey: ['galleries', 'admin'] });
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