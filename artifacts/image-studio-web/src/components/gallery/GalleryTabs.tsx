
import React, { useState, useEffect, useLayoutEffect } from "react";
import { WeddingImage } from '@/components/WeddingImages';
import { Timestamp } from 'firebase/firestore';
import { Loader2 } from 'lucide-react';

interface PhotoData {
  id: string;
  name: string;
  url: string;
  contentType: string;
  size: number;
  createdAt: Timestamp;
  galleryId?: string;
}

interface GalleryTabsProps {
  photos: PhotoData[];
  openLightbox: (index: number) => void;
}

export default function GalleryTabs({
  photos,
  openLightbox
}: GalleryTabsProps) {
  const [isPreloading, setIsPreloading] = useState(true);
  const [loadedCount, setLoadedCount] = useState(0);
  const [allPhotosReady, setAllPhotosReady] = useState(false);

  // Funzione per precaricare un'immagine
  const preloadImage = (url: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve();
      img.onerror = () => reject();
      img.src = url;
    });
  };

  // Reset immediato dello stato quando photos cambia (prima del paint)
  useLayoutEffect(() => {
    if (photos.length > 0) {
      setIsPreloading(true);
      setLoadedCount(0);
      setAllPhotosReady(false);
    }
  }, [photos]);

  // Precarica tutte le foto al mount
  useEffect(() => {
    // Flag per evitare race condition quando cambia la galleria
    let cancelled = false;

    if (photos.length === 0) {
      setIsPreloading(false);
      setAllPhotosReady(true);
      return;
    }

    const loadAllPhotos = async () => {
      
      let loaded = 0;
      
      // Carica le foto in batch di 10 per evitare di sovraccaricare il browser
      const BATCH_SIZE = 10;
      
      for (let i = 0; i < photos.length; i += BATCH_SIZE) {
        // Se il componente è stato smontato o photos è cambiato, interrompi
        if (cancelled) return;
        
        const batch = photos.slice(i, i + BATCH_SIZE);
        
        // Carica batch in parallelo
        await Promise.allSettled(
          batch.map(photo => 
            preloadImage(photo.url).then(() => {
              if (!cancelled) {
                loaded++;
                setLoadedCount(loaded);
              }
            })
          )
        );
      }
      
      // Tutte le foto sono state tentate - aggiorna stato solo se non cancellato
      if (!cancelled) {
        setIsPreloading(false);
        setAllPhotosReady(true);
      }
    };

    loadAllPhotos();

    // Cleanup: marca come cancellato se photos cambia o componente smonta
    return () => {
      cancelled = true;
    };
  }, [photos]);

  // Se non ci sono foto, mostra un messaggio
  if (photos.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="flex flex-col items-center">
          <div className="w-48 h-48 mb-6">
            <WeddingImage type="heart-balloon" alt="Immagine decorativa di sposi" className="w-full h-auto opacity-40" />
          </div>
          <h3 className="text-xl font-playfair text-blue-gray mb-2">
            Nessuna foto disponibile
          </h3>
          <p className="text-blue-gray/70">
            Non ci sono ancora foto in questa galleria.
          </p>
        </div>
      </div>
    );
  }

  // Mostra loading screen durante il preload
  if (isPreloading || !allPhotosReady) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="h-12 w-12 animate-spin text-sage mb-4" />
        <h3 className="text-lg font-medium text-blue-gray mb-2">
          Caricamento foto in corso...
        </h3>
        <p className="text-sm text-blue-gray/70">
          {loadedCount} / {photos.length} foto caricate
        </p>
        <div className="w-64 h-2 bg-beige/50 rounded-full mt-4 overflow-hidden">
          <div 
            className="h-full bg-sage transition-all duration-300"
            style={{ width: `${(loadedCount / photos.length) * 100}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="absolute inset-0 bg-gradient-to-b from-sage/5 to-transparent opacity-50 pointer-events-none"></div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-4 lg:gap-6">
        {photos.map((photo, index) => (
          <PhotoGridItem
            key={`photo-${photo.id}-${index}`}
            photo={photo}
            index={index}
            openLightbox={openLightbox}
          />
        ))}
      </div>
    </div>
  );
}

// Componente per il singolo elemento della griglia di foto
function PhotoGridItem({ photo, index, openLightbox }: { 
  photo: PhotoData; 
  index: number;
  openLightbox: (index: number) => void;
}) {
  return (
    <div
      className="gallery-image h-40 sm:h-52 lg:h-64 relative overflow-hidden rounded-md shadow-sm transition-transform duration-300 hover:scale-[1.02] hover:shadow-md"
      onClick={() => openLightbox(index)}
    >
      <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 hover:opacity-100 transition-opacity z-10 pointer-events-none"></div>
      <img
        src={photo.url}
        alt={photo.name || `Foto ${index + 1}`}
        className="w-full h-full object-cover"
        style={{ 
          backgroundColor: '#f3f4f6',
          objectFit: 'cover',
        }}
        data-testid={`gallery-photo-${index}`}
      />
    </div>
  );
}

// Componente per il messaggio di capitolo vuoto
function EmptyChapterMessage() {
  return (
    <div className="text-center py-8">
      <div className="flex flex-col items-center">
        <div className="w-32 h-32 mb-4">
          <WeddingImage type="wedding-cake" alt="Immagine decorativa torta nuziale" className="w-full h-auto opacity-30" />
        </div>
        <p className="text-gray-500 italic">Nessuna foto in questo capitolo</p>
      </div>
    </div>
  );
}
