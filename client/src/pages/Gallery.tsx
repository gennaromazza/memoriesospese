import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { createUrl } from "@/lib/basePath";
import { useStudio } from "@/context/StudioContext";
import Navigation from "@/components/Navigation";
import ImageLightbox from "@/components/ImageLightbox";
import { Skeleton } from "@/components/ui/skeleton";
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
import SocialActivityPanel from "@/components/SocialActivityPanel";

export default function Gallery() {
  const { id } = useParams();
  const [, navigate] = useLocation();
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userEmail, setUserEmail] = useState<string>('');
  const [userName, setUserName] = useState<string>('');
  const { studioSettings } = useStudio();

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
      const admin = localStorage.getItem('isAdmin') === 'true';
      setIsAdmin(admin);
    };

    const getUserCredentials = () => {
      const email = localStorage.getItem('userEmail') || '';
      const name = localStorage.getItem('userName') || '';
      setUserEmail(email);
      setUserName(name);
    };

    checkAdmin();
    getUserCredentials();
  }, []);

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
                <div className="flex bg-gray-100 rounded-lg p-1">
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
                </div>
              </div>

              {/* Barra con filtri e azioni - solo per tab fotografo */}
              {activeTab === 'photographer' && (
                <div className="flex flex-col sm:flex-row gap-4 mb-6">
                  <div className="flex-1">
                    <GalleryFilter 
                      onFilterChange={handleFilterChange}
                      totalPhotos={photos.length}
                      activeFilters={areFiltersActive}
                      resetFilters={resetFilters}
                    />
                  </div>
                  
                  {/* Azioni galleria */}
                  <div className="flex gap-2">
                    <SubscriptionManager 
                      galleryId={gallery.id}
                      galleryName={gallery.name}
                    />
                    <GuestUpload 
                      galleryId={gallery.id}
                      galleryName={gallery.name}
                      onPhotosUploaded={() => {
                        // Ricarica i dati della galleria quando vengono caricate nuove foto
                        window.location.reload();
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Solo pulsante carica foto per tab ospiti */}
              {activeTab === 'guests' && (
                <div className="flex justify-center mb-6">
                  <GuestUpload 
                    galleryId={gallery.id}
                    galleryName={gallery.name}
                    onPhotosUploaded={() => {
                      window.location.reload();
                    }}
                  />
                </div>
              )}

              {/* Azioni per tab vocali segreti */}
              {activeTab === 'voice-memos' && (
                <div className="flex justify-center mb-6">
                  <VoiceMemoUpload 
                    galleryId={gallery.id}
                    galleryName={gallery.name}
                    onUploadComplete={() => {
                      // Trigger refresh of voice memos list
                      setRefreshTrigger(prev => prev + 1);
                    }}
                  />
                </div>
              )}

              {/* Contenuto del tab selezionato */}
              {activeTab === 'photographer' && (
                /* Tab foto del fotografo */
                (areFiltersActive ? filteredPhotos : photos).length === 0 ? (
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
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-4 lg:gap-6">
                      {(areFiltersActive ? filteredPhotos : photos).map((photo, index) => (
                        <div
                          key={photo.id}
                          className="gallery-image h-40 sm:h-52 lg:h-64 cursor-pointer relative group"
                          onClick={() => openLightbox(index)}
                        >
                          <img
                            src={photo.url}
                            alt={photo.name || `Foto ${index + 1}`}
                            className="w-full h-full object-cover transition-opacity duration-300 opacity-0 hover:opacity-95"
                            loading="lazy"
                            onLoad={(e) => {
                              (e.target as HTMLImageElement).classList.replace('opacity-0', 'opacity-100');
                            }}
                            style={{ 
                              backgroundColor: '#f3f4f6',
                              objectFit: 'cover',
                            }}
                            title={photo.createdAt ? new Date(photo.createdAt).toLocaleString('it-IT') : ''}
                          />
                          
                          {/* Interaction panel */}
                          <div className="absolute bottom-2 left-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                            <div 
                              className="bg-white/95 backdrop-blur-sm rounded-lg p-2 shadow-sm"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <InteractionWrapper
                                itemId={photo.id}
                                itemType="photo"
                                galleryId={gallery.id}
                                isAdmin={isAdmin}
                                className="scale-90"
                              />
                            </div>
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
                )
              )}

              {activeTab === 'guests' && (
                /* Tab foto degli ospiti */
                guestPhotos.length === 0 ? (
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
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-4 lg:gap-6">
                    {guestPhotos.map((photo, index) => (
                      <div
                        key={photo.id}
                        className="gallery-image h-40 sm:h-52 lg:h-64 cursor-pointer relative group"
                        onClick={() => openLightbox(photos.length + index)}
                      >
                        <img
                          src={photo.url}
                          alt={photo.name || `Foto ospite ${index + 1}`}
                          className="w-full h-full object-cover transition-opacity duration-300 opacity-0 hover:opacity-95"
                          loading="lazy"
                          onLoad={(e) => {
                            (e.target as HTMLImageElement).classList.replace('opacity-0', 'opacity-100');
                          }}
                          style={{ 
                            backgroundColor: '#f3f4f6',
                            objectFit: 'cover',
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
                        
                        {/* Interaction panel */}
                        <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                          <div 
                            className="bg-white/95 backdrop-blur-sm rounded-lg p-2 shadow-sm"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <InteractionWrapper
                              itemId={photo.id}
                              itemType="photo"
                              galleryId={gallery.id}
                              isAdmin={isAdmin}
                              className="scale-90"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}

              {activeTab === 'voice-memos' && (
                /* Tab vocali segreti */
                <VoiceMemosList 
                  galleryId={gallery.id}
                  isAdmin={isAdmin}
                  refreshTrigger={refreshTrigger}
                />
              )}

              {/* Social Activity Panel */}
              <div className="mt-12 mb-8">
                <SocialActivityPanel 
                  galleryId={gallery.id}
                  className="w-full"
                  userEmail={userEmail}
                  userName={userName}
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