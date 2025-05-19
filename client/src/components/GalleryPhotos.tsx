
import React from 'react';
import { Photo } from '@/components/DeletePhoto';

interface GalleryPhotosProps {
  photos: Photo[];
  openLightbox: (index: number) => void;
}

export default function GalleryPhotos({ photos, openLightbox }: GalleryPhotosProps) {
  return (
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
              (e.target as HTMLImageElement).classList.replace('opacity-0', 'opacity-100');
            }}
            style={{ backgroundColor: '#f3f4f6' }}
          />
        </div>
      ))}
    </div>
  );
}
