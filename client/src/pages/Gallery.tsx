import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { createUrl } from "@/lib/basePath";
import { useStudio } from "@/context/StudioContext";
import Navigation from "@/components/Navigation";
import ImageLightbox from "@/components/ImageLightbox";
import { Skeleton } from "@/components/ui/skeleton";
import GalleryHeader from "@/components/gallery/GalleryHeader";
import YouTubeEmbed from "@/components/gallery/YouTubeEmbed";
import LoadMoreButton from "@/components/gallery/LoadMoreButton";
import ChaptersManager from "@/components/ChaptersManager";
import GalleryFooter from "@/components/gallery/GalleryFooter";
import { useGalleryData } from "@/hooks/use-gallery-data";
import TabsChapters from "@/components/TabsChapters";
import GalleryLoadingProgress from "@/components/gallery/GalleryLoadingProgress";

export default function Gallery() {
  const { id } = useParams();
  const [, navigate] = useLocation();
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const [activeTab, setActiveTab] = useState("all");
  const { studioSettings } = useStudio();

  // Stato locale per il tracciamento del caricamento
  const [loadingState, setLoadingState] = useState({
    totalPhotos: 0,
    loadedPhotos: 0,
    progress: 0
  });
  
  // Carica dati galleria usando il custom hook
  const { 
    gallery, 
    photos, 
    chapters, 
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

  // Mostra l'indicatore di caricamento se il progresso non è ancora al 100%
  const showProgressIndicator = isLoading || (photos.length > 0 && loadingState.progress < 95);

  return (
    <div className="min-h-screen bg-off-white">
      {showProgressIndicator && (
        <GalleryLoadingProgress 
          totalPhotos={loadingState.totalPhotos}
          loadedPhotos={loadingState.loadedPhotos}
          progress={loadingState.progress}
        />
      )}
      
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
        />

        {/* Video YouTube se presente */}
        <YouTubeEmbed videoUrl={gallery.youtubeUrl || ""} />

        <main>
          <div className="max-w-7xl mx-auto sm:px-6 lg:px-8">
            <div className="px-4 py-4">
              {photos.length === 0 ? (
                <div className="text-center py-12">
                  <div className="flex flex-col items-center">
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
                  {/* Visualizzazione con tab o semplice griglia di foto in base alla presenza di capitoli */}
                  {chapters.length > 0 ? (
                    <TabsChapters
                      chapters={chapters}
                      photos={photos}
                      openLightbox={openLightbox}
                      activeTab={activeTab}
                      setActiveTab={setActiveTab}
                    />
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-4 lg:gap-6">
                      {photos.map((photo, index) => (
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
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Pulsante "Carica altre foto" */}
                  <LoadMoreButton 
                    onClick={loadMorePhotos}
                    isLoading={loadingMorePhotos}
                    hasMore={hasMorePhotos}
                  />
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