import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { collection, getDocs, doc, updateDoc, deleteDoc, query, orderBy, collectionGroup, setDoc, getDoc, where } from "firebase/firestore";
import { getAuth, signOut } from "firebase/auth";
import { db, storage, auth } from "@/lib/firebase";
import { createUrl } from "@/lib/basePath";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatPasswordRequestsForExcel, exportToExcel } from "@/lib/excelExport";
import { ref, listAll, deleteObject, uploadBytes, getDownloadURL } from "firebase/storage";
import Navigation from "@/components/Navigation";
import NewGalleryModal from "@/components/NewGalleryModal";
import EditGalleryModal from "@/components/EditGalleryModal";
import SlideshowManager from "@/components/SlideshowManager";
import UserManager from "@/components/UserManager";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQueryClient } from "@tanstack/react-query";
import { Search, Plus, Edit, Trash, Eye, EyeOff, RefreshCw, Download, Key, ChevronLeft, ChevronRight } from "lucide-react";

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
}

export default function AdminDashboard() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedGallery, setSelectedGallery] = useState<GalleryItem | null>(null);
  const [galleries, setGalleries] = useState<GalleryItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [passwordRequests, setPasswordRequests] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSettingsLoading, setIsSettingsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'galleries' | 'slideshow' | 'requests' | 'settings'>('galleries');

  // Stati per la paginazione delle gallerie
  const [currentGalleryPage, setCurrentGalleryPage] = useState(1);
  const [galleriesPerPage] = useState(5); // Numero di gallerie per pagina

  // Stati per la paginazione delle richieste password
  const [currentRequestPage, setCurrentRequestPage] = useState(1);
  const [requestsPerPage] = useState(5); // Numero di richieste per pagina
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
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Check authentication
  useEffect(() => {
    // Verifica se esiste un flag isAdmin nel localStorage
    const isAdmin = localStorage.getItem('isAdmin');
    if (!isAdmin) {
      navigate(createUrl("/admin"));
    }
  }, [navigate]);

  // Fetch data (galleries, password requests and studio settings)
  useEffect(() => {
    async function loadAllData() {
      // Carica gallerie
      await fetchData();

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
        
      }

      // Carica impostazioni studio
      try {
        setIsSettingsLoading(true);
        const settingsDoc = doc(db, "settings", "studio");
        const settingsSnapshot = await getDoc(settingsDoc);

        if (settingsSnapshot.exists()) {
          const settingsData = settingsSnapshot.data() as StudioSettings;
          setStudioSettings(settingsData);
        }
      } catch (error) {
        
      } finally {
        setIsSettingsLoading(false);
      }
    }

    if (auth.currentUser) {
      loadAllData();
    }
  }, []);

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
    // Refresh the gallery list
    fetchData();
  };

  const openEditModal = (gallery: GalleryItem) => {
    setSelectedGallery(gallery);
    setIsEditModalOpen(true);
  };

  const closeEditModal = () => {
    setIsEditModalOpen(false);
    setSelectedGallery(null);
    // Refresh the gallery list
    fetchData();
  };

  // Funzione di fetch data da usare anche dopo le modifiche
  const fetchData = async () => {
    setIsLoading(true);
    try {
      // Carica gallerie
      const galleriesCollection = collection(db, "galleries");
      const gallerySnapshot = await getDocs(galleriesCollection);

      const galleryList = gallerySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          // Assicuriamoci che active sia sempre un boolean (default true se non definito)
          active: data.active !== undefined ? data.active : true
        };
      }) as GalleryItem[];

      // Sort by creation date, newest first
      galleryList.sort((a, b) => {
        const dateA = a.createdAt?.toDate?.() || new Date(0);
        const dateB = b.createdAt?.toDate?.() || new Date(0);
        return dateB.getTime() - dateA.getTime();
      });

      setGalleries(galleryList);

      
      
    } catch (error) {
      
      toast({
        title: "Errore",
        description: "Si è verificato un errore nel caricamento delle gallerie.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

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

      

      // Update local state
      setGalleries(prev => 
        prev.map(g => g.id === gallery.id ? { ...g, active: newActiveStatus } : g)
      );

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

      // 5. Aggiorna lo stato locale
      setGalleries(prev => prev.filter(g => g.id !== gallery.id));

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

  // Funzione per generare una password casuale
  const generateRandomPassword = (length = 8) => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  // Funzione per cambiare rapidamente la password di una galleria
  const changeGalleryPassword = async (galleryId: string, newPassword: string) => {
    const galleryRef = doc(db, "galleries", galleryId);

    try {
      await updateDoc(galleryRef, {
        password: newPassword
      });

      toast({
        title: "Password aggiornata",
        description: "La password della galleria è stata aggiornata con successo."
      });

      // Update local state
      fetchData();

      return true;
    } catch (error) {
      
      toast({
        title: "Errore",
        description: "Si è verificato un errore durante l'aggiornamento della password.",
        variant: "destructive"
      });

      return false;
    }
  };

  // Filtra le gallerie in base alla query di ricerca
  const filteredGalleries = galleries.filter(gallery => {
    if (!searchQuery) return true;

    const query = searchQuery.toLowerCase();
    return (
      gallery.name.toLowerCase().includes(query) || 
      gallery.code.toLowerCase().includes(query) ||
      gallery.date.toLowerCase().includes(query)
    );
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

      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto py-4 px-4 sm:py-6 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold text-blue-gray">Dashboard amministratore</h1>
            <div className="flex space-x-3">
              <Link href={createUrl("/")}>
                <Button variant="outline" size="sm" className="flex items-center space-x-1">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                  </svg>
                  <span>Vai alla Home</span>
                </Button>
              </Link>
              <Button variant="destructive" size="sm" onClick={handleLogout}>
                Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main>
        <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
          <Tabs defaultValue="galleries" value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
            <TabsList className="mb-6">
              <TabsTrigger value="galleries">Gallerie</TabsTrigger>
              <TabsTrigger value="users">Utenti</TabsTrigger>
              <TabsTrigger value="slideshow">Slideshow</TabsTrigger>
              <TabsTrigger value="requests">Richieste Password</TabsTrigger>
              <TabsTrigger value="settings">Impostazioni</TabsTrigger>
            </TabsList>

            {/* Contenuto Tab Gallerie */}
            <TabsContent value="galleries">
              <div className="bg-white shadow sm:rounded-lg p-5">
                <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
                  <div className="w-full sm:w-auto">
                    <h2 className="text-xl font-semibold text-blue-gray mb-2">Gestione gallerie</h2>
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
                      <Plus className="mr-2 h-4 w-4" /> Nuova galleria
                    </Button>
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
                    <p className="text-gray-500">Non hai ancora creato gallerie.</p>
                    <Button 
                      onClick={openModal}
                      variant="outline"
                      className="mt-4"
                    >
                      <Plus className="mr-2 h-4 w-4" /> Crea la tua prima galleria
                    </Button>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Nome
                          </th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Codice
                          </th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Data
                          </th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Foto
                          </th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray<replit_final_file>
-500 uppercase tracking-wider">
                            Stato
                          </th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Azioni
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {currentGalleries.map((gallery) => (
                          <tr key={gallery.id}>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm font-medium text-gray-900">{gallery.name}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-500">{gallery.code}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-500">{gallery.date}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-500">{gallery.photoCount || 0}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                gallery.active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                              }`}>
                                {gallery.active ? 'Attiva' : 'Disattivata'}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-1">
                              <div className="flex space-x-1 flex-wrap">
                                <Link to={createUrl(`/gallery/${gallery.code}`)} target="_blank">
                                  <Button 
                                    variant="outline" 
                                    size="icon"
                                    className="h-8 w-8 bg-green-50 hover:bg-green-100 border-green-200" 
                                    title="Visualizza galleria"
                                  >
                                    <Eye className="h-4 w-4 text-green-600" />
                                  </Button>
                                </Link>
                                <Button 
                                  variant="outline" 
                                  size="icon"
                                  className="h-8 w-8" 
                                  onClick={() => openEditModal(gallery)}
                                  title="Modifica galleria"
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button 
                                  variant={gallery.active ? "destructive" : "default"}
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => toggleGalleryStatus(gallery)}
                                  title={gallery.active ? "Disattiva galleria" : "Attiva galleria"}
                                >
                                  {gallery.active ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </Button>
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <Button 
                                      variant="outline" 
                                      size="icon"
                                      className="h-8 w-8" 
                                      title="Cambia password"
                                    >
                                      <Key className="h-4 w-4" />
                                    </Button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-80">
                                    <div className="space-y-4">
                                      <h4 className="font-medium">Cambia password per {gallery.name}</h4>
                                      <div className="flex space-x-2">
                                        <Input 
                                          id={`new-password-${gallery.id}`}
                                          type="text"
                                          placeholder="Nuova password"
                                          defaultValue={generateRandomPassword()}
                                        />
                                        <Button 
                                          onClick={() => {
                                            const input = document.getElementById(`new-password-${gallery.id}`) as HTMLInputElement;
                                            if (input && input.value) {
                                              changeGalleryPassword(gallery.id, input.value);
                                            }
                                          }}
                                        >
                                          Salva
                                        </Button>
                                      </div>
                                    </div>
                                  </PopoverContent>
                                </Popover>
                                <Button 
                                  variant="destructive" 
                                  size="icon"
                                  className="h-8 w-8" 
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
                )}
              </div>
            </TabsContent>

            {/* Contenuto Tab Utenti */}
            <TabsContent value="users">
              <div className="bg-white shadow sm:rounded-lg p-5">
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h2 className="text-xl font-semibold text-blue-gray mb-2">Gestione Utenti Registrati</h2>
                    <p className="text-sm text-muted-foreground">
                      Visualizza ed esporta tutti gli utenti che si sono registrati per caricare foto nelle gallerie.
                    </p>
                  </div>
                </div>

                <UserManager />
              </div>
            </TabsContent>

            {/* Contenuto Tab Slideshow */}
            <TabsContent value="slideshow">
              <div className="bg-white shadow sm:rounded-lg p-5">
                <h2 className="text-xl font-semibold text-blue-gray mb-4">Gestione Slideshow Homepage</h2>
                <p className="text-sm text-muted-foreground mb-6">
                  Seleziona le foto da mostrare nella slideshow della homepage.
                </p>

                <SlideshowManager />
              </div>
            </TabsContent>

            {/* Contenuto Tab Richieste Password */}
            <TabsContent value="requests">
              <div className="bg-white shadow sm:rounded-lg p-5">
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h2 className="text-xl font-semibold text-blue-gray mb-2">Richieste password</h2>
                    <p className="text-sm text-muted-foreground">
                      Visualizza tutte le richieste di password ricevute.
                    </p>
                  </div>

                  <Button 
                    onClick={exportPasswordRequests}
                    disabled={passwordRequests.length === 0}
                  >
                    <Download className="mr-2 h-4 w-4" /> Esporta in Excel
                  </Button>
                </div>

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
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Contenuto Tab Impostazioni */}
            <TabsContent value="settings">
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
                                  className="h-24 object-contain"
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
          </Tabs>
        </div>
      </main>

      {/* Finestra modale per creare una nuova galleria */}
      <NewGalleryModal 
        isOpen={isModalOpen} 
        onClose={closeModal} 
        onSuccess={() => {
          // Ricarichiamo le gallerie dopo la creazione
          fetchData();
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