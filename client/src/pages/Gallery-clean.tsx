import { useState, useEffect, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { createUrl } from "@/lib/basePath";
import { useStudio } from "@/context/StudioContext";
import Navigation from "@/components/Navigation";
import ImageLightbox from "@/components/ImageLightbox";
import { Skeleton } from "@/components/ui/skeleton";
import GalleryHeader from "@/components/gallery/GalleryHeader";
import YouTubeEmbed from "@/components/gallery/YouTubeEmbed";
import GalleryFooter from "@/components/gallery/GalleryFooter";
import { useGalleryData, PhotoData } from "@/hooks/use-gallery-data";
import AuthCallToAction from "@/components/AuthCallToAction";
import { useAdminAuth } from "@/hooks/useGalleryGuestAuth";

export default function Gallery() {
  const { id } = useParams();
  const [, navigate] = useLocation();
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const { studioSettings } = useStudio();

  // Stato locale per il tracciamento del caricamento
  const [activeTab, setActiveTab] = useState<'photographer' | 'guests' | 'voice-memos'>('photographer');
  const [localPhotos, setLocalPhotos] = useState<PhotoData[]>([]);
  const [guestPhotos, setGuestPhotos] = useState<PhotoData[]>([]);
  const [allPhotos, setAllPhotos] = useState<PhotoData[]>([]);

  // Uso del hook personalizzato
  const {
    gallery,
    photos,
    guestPhotos: guestPhotosData,
    isLoading: loading,
    hasMorePhotos,
    loadMorePhotos
  } = useGalleryData(id || '');

  // Usa hook per verifica admin separata
  const { isAdmin: adminStatus } = useAdminAuth();

  useEffect(() => {
    setIsAdmin(adminStatus);
  }, [adminStatus]);

  // Effetto per aggiornare lo stato locale quando i dati cambiano
  useEffect(() => {
    if (photos) {
      setLocalPhotos(photos);
    }
  }, [photos]);

  useEffect(() => {
    if (guestPhotosData) {
      setGuestPhotos(guestPhotosData);
    }
  }, [guestPhotosData]);

  // Combina tutte le foto per il lightbox
  useEffect(() => {
    const combined = [...localPhotos, ...guestPhotos];
    setAllPhotos(combined);
  }, [localPhotos, guestPhotos]);

  // Gestione apertura lightbox
  const openLightbox = useCallback((photoIndex: number, photoType: 'photographer' | 'guests') => {
    let adjustedIndex = photoIndex;
    
    if (photoType === 'guests') {
      adjustedIndex = localPhotos.length + photoIndex;
    }
    
    setCurrentPhotoIndex(adjustedIndex);
    setLightboxOpen(true);
  }, [localPhotos.length]);

  const closeLightbox = useCallback(() => {
    setLightboxOpen(false);
  }, []);

  // Loading state
  if (loading || !gallery) {
    return (
      <div className="min-h-screen bg-off-white">
        <Navigation galleryOwner="Caricamento..." />
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="space-y-6">
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-8 w-64" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {[...Array(8)].map((_, i) => (
                <Skeleton key={i} className="aspect-square" />
              ))}
            </div>
          </div>
        </div>
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
                    className={`px-4 sm:px-6 py-2 rounded-md font-medium transition-all text-sm sm:text-base ${
                      activeTab === 'voice-memos'
                        ? 'bg-white shadow-sm text-blue-gray'
                        : 'text-gray-600 hover:text-blue-gray'
                    }`}
                  >
                    <span className="hidden sm:inline">Vocali Segreti</span>
                    <span className="sm:hidden">Vocali</span>
                  </button>
                </div>
              </div>

              {/* Contenuto basato su tab attivo */}
              {activeTab === 'photographer' && (
                <div>
                  {localPhotos.length > 0 ? (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-8">
                        {localPhotos.map((photo, index) => (
                          <div
                            key={photo.id}
                            className="aspect-square bg-gray-200 rounded-lg overflow-hidden cursor-pointer hover:shadow-lg transition-shadow group"
                            onClick={() => openLightbox(index, 'photographer')}
                          >
                            <img
                              src={photo.url}
                              alt={photo.name}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                              loading="lazy"
                            />
                          </div>
                        ))}
                      </div>

                      {hasMorePhotos && (
                        <div className="text-center">
                          <button
                            onClick={loadMorePhotos}
                            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                          >
                            Carica altre foto
                          </button>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-center py-12">
                      <p className="text-gray-500">Nessuna foto del fotografo disponibile</p>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'guests' && (
                <div>
                  {/* Call to Action per l'autenticazione */}
                  <div className="mb-8">
                    <AuthCallToAction 
                      galleryId={id || ''}
                      galleryName={gallery.name}
                    />
                  </div>

                  {/* Foto degli ospiti */}
                  {guestPhotos.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {guestPhotos.map((photo, index) => (
                        <div
                          key={photo.id}
                          className="aspect-square bg-gray-200 rounded-lg overflow-hidden cursor-pointer hover:shadow-lg transition-shadow group"
                          onClick={() => openLightbox(index, 'guests')}
                        >
                          <img
                            src={photo.url}
                            alt={photo.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            loading="lazy"
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <p className="text-gray-500">Nessuna foto degli ospiti disponibile</p>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'voice-memos' && (
                <div>
                  {/* Call to Action per l'autenticazione */}
                  <div className="mb-8">
                    <AuthCallToAction 
                      galleryId={id || ''}
                      galleryName={gallery.name}
                    />
                  </div>

                  <div className="text-center py-12">
                    <p className="text-gray-500">Sezione Vocali Segreti in sviluppo</p>
                  </div>
                </div>
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