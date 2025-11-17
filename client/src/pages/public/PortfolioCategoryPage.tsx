import { useParams, Link } from "wouter";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useState, useEffect } from "react";

interface PortfolioPhoto {
  id: string;
  photoUrl: string;
  caption?: string;
  galleryName?: string;
}

export default function PortfolioCategoryPage() {
  const { categoria } = useParams<{ categoria: string }>();
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  
  // Convert slug back to jobType (e.g., "matrimoni" -> "Matrimonio")
  const jobType = categoria?.split('-').map(word => 
    word.charAt(0).toUpperCase() + word.slice(1)
  ).join(' ');

  const { data: photos, isLoading } = useQuery({
    queryKey: ['portfolio-photos', jobType],
    queryFn: async () => {
      if (!jobType) return [];
      
      const portfolioRef = collection(db, 'portfolioSelections');
      const q = query(portfolioRef, where('jobType', '==', jobType));
      const snapshot = await getDocs(q);
      
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as PortfolioPhoto[];
    },
    enabled: !!jobType
  });

  const openLightbox = (index: number) => {
    setCurrentPhotoIndex(index);
    setLightboxOpen(true);
  };

  // Keyboard navigation for lightbox
  useEffect(() => {
    if (!lightboxOpen) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxOpen(false);
      if (e.key === 'ArrowLeft' && currentPhotoIndex > 0) {
        setCurrentPhotoIndex(currentPhotoIndex - 1);
      }
      if (e.key === 'ArrowRight' && photos && currentPhotoIndex < photos.length - 1) {
        setCurrentPhotoIndex(currentPhotoIndex + 1);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxOpen, currentPhotoIndex, photos]);

  return (
    <div className="min-h-screen bg-white">
      <nav className="border-b border-beige sticky top-0 bg-white/80 backdrop-blur-md z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <Link 
            href="/portfolio"
            className="inline-flex items-center text-sage hover:text-dark-sage transition"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Portfolio
          </Link>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-playfair text-blue-gray mb-4">
            {jobType}
          </h1>
          <p className="text-xl text-gray-600">
            {photos?.length || 0} foto selezionate
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-sage" />
          </div>
        ) : photos && photos.length > 0 ? (
          <div className="columns-1 sm:columns-2 lg:columns-3 gap-4 space-y-4">
            {photos.map((photo, index) => (
              <div 
                key={photo.id} 
                className="break-inside-avoid cursor-pointer group"
                onClick={() => openLightbox(index)}
              >
                <div className="relative overflow-hidden rounded-lg shadow-md hover:shadow-xl transition-shadow">
                  <img 
                    src={photo.photoUrl}
                    alt={photo.caption || `Foto ${index + 1}`}
                    className="w-full h-auto group-hover:scale-105 transition-transform duration-300"
                    loading="lazy"
                  />
                  {photo.caption && (
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                      <p className="text-white text-sm">{photo.caption}</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-20">
            <p className="text-gray-500 text-lg">
              Nessuna foto disponibile in questa categoria
            </p>
          </div>
        )}
      </div>

      {/* Lightbox with Navigation */}
      {lightboxOpen && photos && (
        <div 
          className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center p-4"
          onClick={() => setLightboxOpen(false)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setLightboxOpen(false);
            if (e.key === 'ArrowLeft' && currentPhotoIndex > 0) {
              setCurrentPhotoIndex(currentPhotoIndex - 1);
            }
            if (e.key === 'ArrowRight' && currentPhotoIndex < photos.length - 1) {
              setCurrentPhotoIndex(currentPhotoIndex + 1);
            }
          }}
          tabIndex={0}
        >
          {/* Close Button */}
          <button
            onClick={() => setLightboxOpen(false)}
            className="absolute top-4 right-4 text-white text-4xl hover:text-gray-300 z-10"
            aria-label="Chiudi"
          >
            ×
          </button>
          
          {/* Previous Button */}
          {currentPhotoIndex > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setCurrentPhotoIndex(currentPhotoIndex - 1);
              }}
              className="absolute left-4 text-white text-5xl hover:text-gray-300 z-10"
              aria-label="Foto precedente"
            >
              ‹
            </button>
          )}
          
          {/* Next Button */}
          {currentPhotoIndex < photos.length - 1 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setCurrentPhotoIndex(currentPhotoIndex + 1);
              }}
              className="absolute right-4 text-white text-5xl hover:text-gray-300 z-10"
              aria-label="Foto successiva"
            >
              ›
            </button>
          )}
          
          {/* Image */}
          <img 
            src={photos[currentPhotoIndex]?.photoUrl}
            alt={photos[currentPhotoIndex]?.caption || ''}
            className="max-w-full max-h-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          
          {/* Caption & Counter */}
          <div className="absolute bottom-8 left-0 right-0 text-center">
            {photos[currentPhotoIndex]?.caption && (
              <p className="text-white text-lg px-4 mb-2">{photos[currentPhotoIndex].caption}</p>
            )}
            <p className="text-white/70 text-sm">
              {currentPhotoIndex + 1} / {photos.length}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
