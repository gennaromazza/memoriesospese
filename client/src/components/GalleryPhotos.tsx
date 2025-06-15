
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { PhotoData } from '@/hooks/use-gallery-data';
import { imageCache } from '@/lib/imageCache';

interface GalleryPhotosProps {
  photos: PhotoData[];
  openLightbox: (index: number) => void;
}

// Componente ottimizzato per singola immagine
const OptimizedImage = React.memo(({ photo, index, openLightbox }: {
  photo: PhotoData;
  index: number;
  openLightbox: (index: number) => void;
}) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const imgRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsInView(true);
            // Preload l'immagine usando il cache system
            imageCache.preloadImage(photo.url).then(() => {
              setIsLoaded(true);
            }).catch(() => {
              // Fallback normale loading se cache fallisce
              setIsLoaded(false);
            });
            observer.unobserve(entry.target);
          }
        });
      },
      { 
        threshold: 0.1,
        rootMargin: "150px" // Aumentato per preloadng più aggressivo
      }
    );

    if (imgRef.current) {
      observer.observe(imgRef.current);
    }

    return () => observer.disconnect();
  }, [photo.url]);

  const handleClick = useCallback(() => {
    openLightbox(index);
  }, [index, openLightbox]);

  const handleLoad = useCallback(() => {
    setIsLoaded(true);
  }, []);

  return (
    <div
      ref={imgRef}
      className="gallery-image h-40 sm:h-52 lg:h-64 bg-gray-100 cursor-pointer overflow-hidden rounded-lg hover:scale-105 transition-transform duration-200"
      onClick={handleClick}
    >
      {isInView && (
        <img
          src={photo.url}
          alt={photo.name || `Foto ${index + 1}`}
          className={`w-full h-full object-cover transition-opacity duration-300 ${
            isLoaded ? 'opacity-100' : 'opacity-0'
          }`}
          loading="lazy"
          onLoad={handleLoad}
          decoding="async"
        />
      )}
      {isInView && !isLoaded && (
        <div className="w-full h-full flex items-center justify-center">
          <div className="animate-pulse bg-gray-200 w-full h-full rounded"></div>
        </div>
      )}
    </div>
  );
});

OptimizedImage.displayName = 'OptimizedImage';

export default function GalleryPhotos({ photos, openLightbox }: GalleryPhotosProps) {
  const memoizedOpenLightbox = useCallback((index: number) => {
    openLightbox(index);
  }, [openLightbox]);

  // Preload delle prime 10 immagini al mount per performance migliori
  useEffect(() => {
    const preloadUrls = photos.slice(0, 10).map(photo => photo.url);
    imageCache.preloadImages(preloadUrls);
  }, [photos]);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-4 lg:gap-6">
      {photos.map((photo, index) => (
        <OptimizedImage
          key={photo.id}
          photo={photo}
          index={index}
          openLightbox={memoizedOpenLightbox}
        />
      ))}
    </div>
  );
}
