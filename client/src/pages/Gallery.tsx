import { useState, useEffect, useRef, useCallback } from "react";
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
  
  // Stato per il tab attivo (foto del fotografo o ospiti)
  const [activeTab, setActiveTab] = useState<'photographer' | 'guests'>('photographer');
  
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
    const totalPhotos = photos.length + guestPhotos.length;
    const loadedPhotos = photos.length + guestPhotos.length;
    const progress = totalPhotos > 0 ? Math.round((loadedPhotos / totalPhotos) * 100) : 0;
    
    setLoadingState({
      totalPhotos,
      loadedPhotos,
      progress
    });
  }, [photos.length, guestPhotos.length]);

  // Reindirizza alla home se la galleria non esiste
  useEffect(() => {
    if (!isLoading && !gallery) {
      navigate(createUrl("/"));
    }
  }, [gallery, isLoading, navigate]);

  // Verifica se l'utente è admin
  useEffect(() => {
    const checkAdminStatus = () => {
      const adminGalleries = localStorage.getItem('adminGalleries');
      if (adminGalleries) {
        const galleries = JSON.parse(adminGalleries);
        setIsAdmin(galleries.includes(id));
      }
    };
    
    checkAdminStatus();
  }, [id]);

  // Setup per infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMorePhotos && !loadingMorePhotos) {
          loadMorePhotos();
        }
      },
      { threshold: 0.1 }
    );

    if (sentinelRef.current) {
      observer.observe(sentinelRef.current);
    }

    return () => observer.disconnect();
  }, [hasMorePhotos, loadingMorePhotos, loadMorePhotos]);

  // Funzioni per gestire il lightbox
  const openLightbox = useCallback((index: number) => {
    const currentPhotos = activeTab === 'photographer' ? photos : guestPhotos;
    setCurrentPhotoIndex(index);
    setLightboxOpen(true);
  }, [activeTab, photos, guestPhotos]);

  const closeLightbox = () => {
    setLightboxOpen(false);
  };

  // Gestisce il callback quando vengono caricate nuove foto
  const handlePhotosUploaded = useCallback((count: number) => {
    console.log(`${count} nuove foto caricate`);
    // Il ricaricamento dei dati è già gestito dal custom hook
  }, []);

  // Render delle foto in griglia
  const renderPhotoGrid = (photosToRender: PhotoData[]) => {
    if (photosToRender.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-16 px-4">
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {activeTab === 'photographer' ? 'Nessuna foto del fotografo' : 'Nessuna foto degli ospiti'}
            </h3>
            <p className="text-gray-600">
              {activeTab === 'photographer' 
                ? 'Le foto del fotografo verranno caricate qui' 
                : 'Le foto caricate dagli ospiti appariranno qui'
              }
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {photosToRender.map((photo, index) => (
          <div
            key={photo.id}
            className="relative aspect-square bg-gray-100 rounded-lg overflow-hidden cursor-pointer hover:opacity-90 transition-opacity"
            onClick={() => openLightbox(index)}
          >
            <img
              src={photo.url}
              alt={photo.name}
              className="w-full h-full object-cover"
              loading="lazy"
            />
            {photo.uploaderName && (
              <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 text-white text-xs p-2">
                {photo.uploaderName}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-white">
        <Navigation />
        <div className="container mx-auto px-4 py-8">
          <div className="max-w-4xl mx-auto">
            <GalleryLoadingProgress
              totalPhotos={loadingState.totalPhotos}
              loadedPhotos={loadingState.loadedPhotos}
              progress={loadingState.progress}
            />
            <div className="space-y-4 mt-8">
              <Skeleton className="h-8 w-64" />
              <Skeleton className="h-4 w-48" />
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {[...Array(12)].map((_, i) => (
                  <Skeleton key={i} className="aspect-square rounded-lg" />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Nessuna galleria trovata
  if (!gallery) {
    return (
      <div className="min-h-screen bg-white">
        <Navigation />
        <div className="container mx-auto px-4 py-8">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">Galleria non trovata</h1>
            <p className="text-gray-600">La galleria richiesta non esiste o non è più disponibile.</p>
          </div>
        </div>
      </div>
    );
  }

  const currentPhotos = activeTab === 'photographer' ? photos : guestPhotos;

  return (
    <div className="min-h-screen bg-white">
      <Navigation isAdminNav={isAdmin} galleryOwner={gallery.name} />
      
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          {/* Header della galleria */}
          <GalleryHeader 
            gallery={gallery}
            totalPhotos={photos.length + guestPhotos.length}
            isAdmin={isAdmin}
          />

          {/* Video YouTube se presente */}
          {gallery.youtubeUrl && (
            <div className="mb-8">
              <YouTubeEmbed url={gallery.youtubeUrl} />
            </div>
          )}

          {/* Upload per ospiti */}
          <div className="mb-8">
            <GuestUpload 
              galleryId={gallery.id}
              galleryName={gallery.name}
              onPhotosUploaded={handlePhotosUploaded}
            />
          </div>

          {/* Tabs per foto del fotografo e ospiti */}
          <div className="mb-6">
            <div className="border-b border-gray-200">
              <nav className="-mb-px flex space-x-8">
                <button
                  onClick={() => setActiveTab('photographer')}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${
                    activeTab === 'photographer'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Foto del Fotografo ({photos.length})
                </button>
                <button
                  onClick={() => setActiveTab('guests')}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${
                    activeTab === 'guests'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Foto degli Ospiti ({guestPhotos.length})
                </button>
              </nav>
            </div>
          </div>

          {/* Griglia delle foto */}
          {renderPhotoGrid(currentPhotos)}

          {/* Pulsante per caricare più foto */}
          {hasMorePhotos && (
            <div className="mt-8 text-center">
              <LoadMoreButton
                onClick={loadMorePhotos}
                isLoading={loadingMorePhotos}
                hasMore={hasMorePhotos}
              />
            </div>
          )}

          {/* Sentinella per infinite scroll */}
          <div ref={sentinelRef} className="h-4" />

          {/* Gestione sottoscrizioni */}
          <div className="mt-12">
            <SubscriptionManager galleryId={gallery.id} />
          </div>
        </div>
      </div>

      {/* Lightbox */}
      <ImageLightbox
        isOpen={lightboxOpen}
        onClose={closeLightbox}
        photos={currentPhotos}
        initialIndex={currentPhotoIndex}
      />

      {/* Footer */}
      <GalleryFooter />
    </div>
  );
}