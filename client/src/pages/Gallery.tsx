import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { createUrl } from "@/lib/basePath";
import { useStudio } from "@/context/StudioContext";
import { User } from "lucide-react";
import Navigation from "@/components/Navigation";
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import ImageLightbox from "@/components/ImageLightbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import GalleryHeader from "@/components/gallery/GalleryHeader";
import YouTubeEmbed from "@/components/gallery/YouTubeEmbed";
import LoadMoreButton from "@/components/gallery/LoadMoreButton";
import GalleryFooter from "@/components/gallery/GalleryFooter";
import { useGalleryData, PhotoData } from "@/hooks/use-gallery-data";
import GalleryLoadingProgress from "@/components/gallery/GalleryLoadingProgress";
import GalleryFilter, { FilterCriteria } from "@/components/gallery/GalleryFilter";
import SubscriptionManager from "@/components/SubscriptionManager";
import GuestUpload from "@/components/GuestUpload";
import VoiceMemoUpload from "@/components/VoiceMemoUpload";
import VoiceMemosList from "@/components/VoiceMemosList";
import InteractionWrapper from "@/components/InteractionWrapper";
import InteractionPanel from "@/components/InteractionPanel";
import SocialActivityPanel from "@/components/SocialActivityPanel";
import RegistrationCTA from "@/components/RegistrationCTA";
import { useGalleryRefresh } from "@/hooks/useGalleryRefresh";
import { useFirebaseAuth } from "@/context/FirebaseAuthContext";

export default function Gallery() {
  const { id } = useParams();
  const [, navigate] = useLocation();
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userEmail, setUserEmail] = useState<string>('');
  const [userName, setUserName] = useState<string>('');
  const { studioSettings } = useStudio();
  const { user, userProfile, isAuthenticated } = useFirebaseAuth();

  // Stato locale per il tracciamento del caricamento
  const [loadingState, setLoadingState] = useState({
    totalPhotos: 0,
    loadedPhotos: 0,
    progress: 0
  });

  // Stato per i filtri
  const [filters, setFilters] = useState<FilterCriteria>({
    startDate: undefined,
    endDate: undefined,
    startTime: undefined,
    endTime: undefined,
    sortOrder: 'newest'
  });

  // Stato per tracciare se i filtri sono attivi
  const [areFiltersActive, setAreFiltersActive] = useState(false);

  // Stato per il tab attivo (foto del fotografo, ospiti o vocali segreti)
  const [activeTab, setActiveTab] = useState<'photographer' | 'guests' | 'voice-memos'>('photographer');

  // Hook per il refresh intelligente dei dati
  const { refreshPhotos, refreshGallery, refreshVoiceMemos, refreshInteractions } = useGalleryRefresh(id);

  // Stato per triggare il refresh dei voice memos
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Ref per l'elemento sentinella per infinite scroll
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Carica dati galleria usando il custom hook
  const { 
    gallery, 
    photos, 
    guestPhotos,
    isLoading, 
    hasMorePhotos, 
    loadingMorePhotos,
    loadMorePhotos 
  } = useGalleryData(id || "");

  // Aggiorna lo stato di caricamento
  useEffect(() => {
    // Aggiorna il conteggio delle foto caricate includendo quelle degli ospiti
    const totalLoadedPhotos = photos.length + guestPhotos.length;
    setLoadingState(prev => ({
      ...prev,
      loadedPhotos: totalLoadedPhotos,
      // Se c'è una galleria, usa il suo photoCount, altrimenti usa la lunghezza totale delle foto
      totalPhotos: gallery?.photoCount || totalLoadedPhotos,
      progress: gallery?.photoCount ? Math.min(100, Math.round((totalLoadedPhotos / gallery.photoCount) * 100)) : 100
    }));
  }, [photos.length, guestPhotos.length, gallery]);

  // Check if current user is admin and get user credentials
  useEffect(() => {
    const checkAdmin = () => {
      const admin = localStorage.getItem('isAdmin') === 'true' || userProfile?.role === 'admin';
      setIsAdmin(admin);
    };

    const getUserCredentials = () => {
      // Priority: Firebase auth user, then localStorage fallback
      const email = user?.email || localStorage.getItem('userEmail') || '';
      const name = userProfile?.displayName || user?.displayName || localStorage.getItem('userName') || '';
      setUserEmail(email);
      setUserName(name);
    };

    checkAdmin();
    getUserCredentials();

    // Listen for localStorage changes
    const handleStorageChange = () => {
      checkAdmin();
      getUserCredentials();
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [user, userProfile]);

  // Function to refresh user credentials
  const refreshUserCredentials = () => {
    const email = user?.email || localStorage.getItem('userEmail') || '';
    const name = userProfile?.displayName || user?.displayName || localStorage.getItem('userName') || '';
    setUserEmail(email);
    setUserName(name);
  };

  // Verifica autenticazione
  useEffect(() => {
    const checkAuth = () => {
      const isAuth = localStorage.getItem(`gallery_auth_${id}`);
      if (!isAuth && !isAdmin) {
        navigate(createUrl(`/access/${id}`));
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
        window.innerHeight + window.scrollY >= document.body.offsetHeight - 300 &&
        hasMorePhotos && 
        !loadingMorePhotos &&
        !isLoading
      ) {
        loadMorePhotos();
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [hasMorePhotos, loadingMorePhotos, isLoading, loadMorePhotos]);

  // Combina tutte le foto per il lightbox
  const allPhotos = useMemo(() => {
    return [...photos, ...guestPhotos];
  }, [photos, guestPhotos]);

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
      newFilters.sortOrder !== 'newest';

    setAreFiltersActive(hasActiveFilter);
  };

  // Funzione per resettare i filtri
  const resetFilters = () => {
    setFilters({
      startDate: undefined,
      endDate: undefined,
      startTime: undefined,
      endTime: undefined,
      sortOrder: 'newest'
    });
    setAreFiltersActive(false);
  };

  // Filtra le foto in base ai criteri impostati
  const filteredPhotos = useMemo(() => {
    if (!areFiltersActive) return photos;

    return photos.filter(photo => {
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
        const photoTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;

        if (filters.startTime && photoTime < filters.startTime) return false;
        if (filters.endTime && photoTime > filters.endTime) return false;
      }

      return true;
    }).sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt) : new Date(0);
      const dateB = b.createdAt ? new Date(b.createdAt) : new Date(0);

      return filters.sortOrder === 'newest' 
        ? dateB.getTime() - dateA.getTime() 
        : dateA.getTime() - dateB.getTime();
    });
  }, [photos, filters, areFiltersActive]);

  const handleSignOut = () => {
    localStorage.removeItem(`gallery_auth_${id}`);
    navigate(createUrl("/"));
  };

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
                <Skeleton key={i} className="w-full h-60 rounded-md" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!gallery) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Galleria non trovata</h1>
          <p className="mb-4">La galleria che stai cercando non esiste o è stata rimossa.</p>
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
  const showProgressIndicator = isLoading || loadingState.progress < 100;

  // Se siamo in stato di caricamento o se il progresso è inferiore a 100, mostra il componente di caricamento
  if (isLoading || loadingState.progress < 100) {
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

  return (
    <div className="min-h-screen bg-off-white">

      <Navigation galleryOwner={gallery.name} />

      <div>
        {/* Intestazione galleria */}
        <GalleryHeader 
          name={gallery.name}
          date={gallery.date}
          location={gallery.location}
          description={gallery.description}
          coverImageUrl={gallery.coverImageUrl}
          galleryId={id}
          galleryCode={gallery.code}
        />

        {/* Video YouTube se presente */}
        <YouTubeEmbed videoUrl={gallery.youtubeUrl || ""} />

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
                          onClick={() => setActiveTab('photographer')}
                          className={`px-4 sm:px-6 py-2 rounded-md font-medium transition-all text-sm sm:text-base ${
                            activeTab === 'photographer'
                              ? 'bg-white shadow-sm text-blue-gray'
                              : 'text-gray-600 hover:text-blue-gray'
                          }`}
                        >
                          <span className="hidden sm:inline">Foto del fotografo</span>
                          <span className="sm:hidden">Fotografo</span>
                          <span className="ml-1">({photos.length})</span>
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="text-sm">
                        <p>Visualizza le foto professionali scattate dal fotografo</p>
                      </TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => setActiveTab('guests')}
                          className={`px-4 sm:px-6 py-2 rounded-md font-medium transition-all text-sm sm:text-base ${
                            activeTab === 'guests'
                              ? 'bg-white shadow-sm text-blue-gray'
                              : 'text-gray-600 hover:text-blue-gray'
                          }`}
                        >
                          <span className="hidden sm:inline">Foto degli ospiti</span>
                          <span className="sm:hidden">Ospiti</span>
                          <span className="ml-1">({guestPhotos.length})</span>
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="text-sm">
                        <p>Guarda le foto caricate dagli ospiti dell'evento</p>
                      </TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => setActiveTab('voice-memos')}
                          className={`px-4 sm:px-6 py-2 rounded-md font-medium transition-all text-sm sm:text-base flex items-center gap-2 ${
                            activeTab === 'voice-memos'
                              ? 'bg-gradient-to-r from-sage-100 to-blue-gray-100 shadow-lg text-sage-800 border border-sage-200'
                              : 'text-gray-600 hover:text-sage-700 hover:bg-sage-50'
                          }`}
                        >
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                          </svg>
                          <span className="hidden sm:inline">Vocali Segreti</span>
                          <span className="sm:hidden">Vocali</span>
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="text-sm">
                        <p>Ascolta i messaggi vocali privati lasciati dagli ospiti</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </TooltipProvider>
              </div>

              {/* Barra con filtri e azioni - solo per tab fotografo */}
              {activeTab === 'photographer' && (
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

                  {/* Azioni galleria - layout responsive */}
                  <div className="flex flex-col sm:flex-row gap-3 sm:gap-2">
                    {/* Pulsanti principali */}
                    <div className="flex flex-col sm:flex-row gap-2 sm:gap-2 flex-1">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex-1 sm:flex-initial">
                              <SubscriptionManager 
                                galleryId={gallery.id}
                                galleryName={gallery.name}
                              />
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="text-sm">
                            <p>Iscriviti per ricevere notifiche quando vengono aggiunte nuove foto</p>
                          </TooltipContent>
                        </Tooltip>

                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex-1 sm:flex-initial">
                              <GuestUpload 
                                galleryId={gallery.id}
                                galleryName={gallery.name}
                                onPhotosUploaded={() => {
                                  // Aggiorna i dati della galleria quando vengono caricate nuove foto
                                  refreshPhotos();
                                }}
                              />
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="text-sm">
                            <p>Carica le tue foto per condividerle con tutti gli ospiti</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>

                    {/* Pulsanti utente */}
                    {(userEmail || userName) && (
                      <div className="flex gap-2 justify-end sm:justify-start">
                        <TooltipProvider>
                          {isAuthenticated && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => navigate(createUrl("/profile"))}
                                  className="text-xs px-3 py-1.5 h-8 min-w-[80px]"
                                >
                                  <User className="h-3 w-3 mr-1" />
                                  Profilo
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent side="bottom" className="text-sm">
                                <p>Gestisci il tuo profilo utente</p>
                              </TooltipContent>
                            </Tooltip>
                          )}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  // Clear all authentication data
                                  const keys = Object.keys(localStorage);
                                  keys.forEach(key => {
                                    if (key.startsWith('gallery_auth_') || 
                                        key.startsWith('user_email_') || 
                                        key.startsWith('user_name_') ||
                                        key === 'userEmail' ||
                                        key === 'userName' ||
                                        key === 'isAdmin') {
                                      localStorage.removeItem(key);
                                    }
                                  });
                                  // Refresh gallery to reflect logout state
                                  refreshGallery();
                                }}
                                className="text-xs px-3 py-1.5 h-8 min-w-[70px]"
                              >
                                Logout
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="text-sm">
                              <p>Disconnettiti dal tuo account</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Solo pulsante carica foto per tab ospiti */}
              {activeTab === 'guests' && (
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-6">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="w-full sm:w-auto">
                          <GuestUpload 
                            galleryId={gallery.id}
                            galleryName={gallery.name}
                            onPhotosUploaded={() => {
                              refreshPhotos();
                            }}
                          />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="text-sm">
                        <p>Aggiungi le tue foto personali alla galleria degli ospiti</p>
                      </TooltipContent>
                    </Tooltip>

                    {(userEmail || userName) && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              // Clear all authentication data
                              const keys = Object.keys(localStorage);
                              keys.forEach(key => {
                                if (key.startsWith('gallery_auth_') || 
                                    key.startsWith('user_email_') || 
                                    key.startsWith('user_name_') ||
                                    key === 'userEmail' ||
                                    key === 'userName' ||
                                    key === 'isAdmin') {
                                  localStorage.removeItem(key);
                                }
                              });
                              refreshGallery();
                            }}
                            className="text-xs px-3 py-1.5 h-8 min-w-[70px] w-full sm:w-auto"
                          >
                            Logout
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="text-sm">
                          <p>Disconnettiti dal tuo account</p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </TooltipProvider>
                </div>
              )}

              {/* Azioni per tab vocali segreti */}
              {activeTab === 'voice-memos' && (
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-6">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="w-full sm:w-auto">
                          <VoiceMemoUpload 
                            galleryId={gallery.id}
                            galleryName={gallery.name}
                            userEmail={userEmail}
                            userName={userName}
                            onUploadComplete={() => {
                              // Trigger refresh of voice memos list
                              setRefreshTrigger(prev => prev + 1);
                              // Refresh user credentials in case they were updated
                              refreshUserCredentials();
                            }}
                          />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="text-sm">
                        <p>Registra un messaggio vocale privato per gli sposi</p>
                      </TooltipContent>
                    </Tooltip>

                    {(userEmail || userName) && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              // Clear all authentication data
                              const keys = Object.keys(localStorage);
                              keys.forEach(key => {
                                if (key.startsWith('gallery_auth_') || 
                                    key.startsWith('user_email_') || 
                                    key.startsWith('user_name_') ||
                                    key === 'userEmail' ||
                                    key === 'userName' ||
                                    key === 'isAdmin') {
                                  localStorage.removeItem(key);
                                }
                              });
                              refreshGallery();
                            }}
                            className="text-xs px-3 py-1.5 h-8 min-w-[70px] w-full sm:w-auto"
                          >
                            Logout
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="text-sm">
                          <p>Disconnettiti dal tuo account</p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </TooltipProvider>
                </div>
              )}

              {/* Contenuto del tab selezionato */}
              {activeTab === 'photographer' && (
                <div>
                  {/* Discrete registration link for non-authenticated users - only show when not logged in */}
                  {!isAuthenticated && !userEmail && !userName && (
                    <div className="mb-6 text-center">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() => {
                                const registrationSection = document.getElementById('registration-section');
                                registrationSection?.scrollIntoView({ behavior: 'smooth' });
                              }}
                              className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-sage-100 to-blue-gray-100 hover:from-sage-200 hover:to-blue-gray-200 text-sage-800 rounded-full border border-sage-300 transition-all duration-300 hover:shadow-md text-sm font-medium"
                            >
                              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                              </svg>
                              🎁 Sblocca tutte le funzionalità - Scopri i vantaggi
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="text-sm max-w-xs">
                            <p>Registrati per commentare, mettere "mi piace" e accedere a tutte le funzionalità della galleria</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  )}

                  {(areFiltersActive ? filteredPhotos : photos).length === 0 ? (
                    <div className="text-center py-12">
                      <div className="flex flex-col items-center">
                        <h3 className="text-xl font-playfair text-blue-gray mb-2">
                          {areFiltersActive ? 'Nessuna foto corrisponde ai filtri selezionati' : 'Nessuna foto del fotografo'}
                        </h3>
                        <p className="text-gray-500">
                          {areFiltersActive ? 'Prova a modificare i criteri di filtro per visualizzare più foto.' : 'Non ci sono ancora foto del fotografo in questa galleria.'}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="masonry-grid">
                        {(areFiltersActive ? filteredPhotos : photos).map((photo, index) => (
                          <div key={photo.id} className="masonry-item">
                            <div
                              className="gallery-image cursor-pointer relative group overflow-hidden rounded-lg shadow-md hover:shadow-lg transition-all duration-300"
                              onClick={() => openLightbox(index)}
                            >
                              <img
                                src={photo.url}
                                alt={photo.name || `Foto ${index + 1}`}
                                className="w-full h-auto object-cover transition-opacity duration-300 opacity-0 hover:opacity-95"
                                loading="lazy"
                                onLoad={(e) => {
                                  (e.target as HTMLImageElement).classList.replace('opacity-0', 'opacity-100');
                                }}
                                style={{ 
                                  backgroundColor: '#f3f4f6',
                                }}
                                title={photo.createdAt ? new Date(photo.createdAt).toLocaleString('it-IT') : ''}
                              />
                            </div>

                            {/* Interaction panel below photo */}
                            <div className="mt-2">
                              <InteractionPanel
                                itemId={photo.id}
                                itemType="photo"
                                galleryId={gallery.id}
                                isAdmin={isAdmin}
                                variant="default"
                              />
                            </div>
                          </div>
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
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'guests' && (
                <div>
                  {guestPhotos.length === 0 ? (
                    <div className="text-center py-12">
                      <div className="flex flex-col items-center">
                        <h3 className="text-xl font-playfair text-blue-gray mb-2">
                          Nessuna foto degli ospiti
                        </h3>
                        <p className="text-gray-500">
                          Gli ospiti non hanno ancora caricato foto. Usa il pulsante "Carica foto" sopra per aggiungerne.
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
                                (e.target as HTMLImageElement).classList.replace('opacity-0', 'opacity-100');
                              }}
                              style={{ 
                                backgroundColor: '#f3f4f6',
                              }}
                              title={`Caricata da: ${photo.uploaderName || 'Ospite'} - ${photo.createdAt ? new Date(photo.createdAt).toLocaleString('it-IT') : ''}`}
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

              {activeTab === 'voice-memos' && (
                <VoiceMemosList 
                  galleryId={gallery.id}
                  isAdmin={isAdmin}
                  refreshTrigger={refreshTrigger}
                />
              )}

              {/* Registration CTA section - only show when user is not logged in */}
              {!isAuthenticated && !userEmail && !userName && (
                <div id="registration-section" className="mt-12 mb-8">
                  <RegistrationCTA
                    galleryId={gallery.id}
                    onAuthComplete={refreshUserCredentials}
                    className="max-w-4xl mx-auto"
                  />
                </div>
              )}

              {/* Social Activity Panel */}
              <div className="mt-12 mb-8">
                <SocialActivityPanel 
                  galleryId={gallery.id}
                  className="w-full"
                  onPhotoClick={(photoId) => {
                    // Find photo index in allPhotos array
                    const photoIndex = allPhotos.findIndex(photo => photo.id === photoId);
                    if (photoIndex !== -1) {
                      setCurrentPhotoIndex(photoIndex);
                      setLightboxOpen(true);
                    }
                  }}
                />
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* Instagram Call to Action e Footer */}
      <GalleryFooter studioSettings={studioSettings} />

      {/* Photo Lightbox */}
      <ImageLightbox
        isOpen={lightboxOpen}
        onClose={closeLightbox}
        photos={allPhotos.map(photo => ({
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