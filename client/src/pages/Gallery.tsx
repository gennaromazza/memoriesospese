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

export default function Gallery() {
  const { id } = useParams();
  const [, navigate] = useLocation();
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
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
  
  // Ref per l'elemento sentinella per infinite scroll
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Carica dati galleria usando il custom hook
  const { 
    gallery, 
    photos, 
    isLoading, 
    hasMorePhotos, 
    loadingMorePhotos,
    loadMorePhotos 
  } = useGalleryData(id || "");

  // Aggiorna lo stato di caricamento
  useEffect(() => {
    // Aggiorna il conteggio delle foto caricate
    setLoadingState(prev => ({
      ...prev,
      loadedPhotos: photos.length,
      // Se c'è una galleria, usa il suo photoCount, altrimenti usa la lunghezza delle foto
      totalPhotos: gallery?.photoCount || photos.length,
      progress: gallery?.photoCount ? Math.min(100, Math.round((photos.length / gallery.photoCount) * 100)) : 100
    }));
  }, [photos.length, gallery]);

  // Check if current user is admin
  useEffect(() => {
    const checkAdmin = () => {
      const admin = localStorage.getItem('isAdmin') === 'true';
      setIsAdmin(admin);
    };

    checkAdmin();
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
              {/* Filtri per le foto */}
              <GalleryFilter 
                onFilterChange={handleFilterChange}
                totalPhotos={photos.length}
                activeFilters={areFiltersActive}
                resetFilters={resetFilters}
              />

              {(areFiltersActive ? filteredPhotos : photos).length === 0 ? (
                <div className="text-center py-12">
                  <div className="flex flex-col items-center">
                    <h3 className="text-xl font-playfair text-blue-gray mb-2">
                      {areFiltersActive ? 'Nessuna foto corrisponde ai filtri selezionati' : 'Nessuna foto disponibile'}
                    </h3>
                    <p className="text-gray-500">
                      {areFiltersActive ? 'Prova a modificare i criteri di filtro per visualizzare più foto.' : 'Non ci sono ancora foto in questa galleria.'}
                    </p>
                  </div>
                </div>
              ) : (
                <>
                 <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-4 lg:gap-6">
                      {(areFiltersActive ? filteredPhotos : photos).map((photo, index) => (
                        <div
                          key={photo.id}
                          className="gallery-image h-40 sm:h-52 lg:h-64"
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
                            title={photo.createdAt ? new Date(photo.createdAt).toLocaleString('it-IT') : ''}
                          />
                        </div>
                      ))}
                    </div>

                  {/* Pulsante "Carica altre foto" (mostra solo se non ci sono filtri attivi) */}
                  {!areFiltersActive && (
                    <LoadMoreButton 
                      onClick={loadMorePhotos}
                      isLoading={loadingMorePhotos}
                      hasMore={hasMorePhotos}
                    />
                  )}
                </>
              )}
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
        photos={(areFiltersActive ? filteredPhotos : photos).map(photo => ({
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