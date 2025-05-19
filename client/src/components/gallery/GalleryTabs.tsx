
import React, { useState } from "react";
import { WeddingImage } from '@/components/WeddingImages';

interface PhotoData {
  id: string;
  name: string;
  url: string;
  contentType: string;
  size: number;
  createdAt: any;
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
          <p className="text-gray-500">
            Non ci sono ancora foto in questa galleria.
          </p>
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
        className="w-full h-full object-cover transition-all duration-300 opacity-0"
        loading="lazy"
        onLoad={(e) => {
          (e.target as HTMLImageElement).classList.replace('opacity-0', 'opacity-100');
        }}
        style={{ 
          backgroundColor: '#f3f4f6',
          objectFit: 'cover',
        }}
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
