import { useState, useEffect, useRef, useMemo } from "react";
import { PhotoData } from "@/hooks/use-gallery-data";

interface VirtualizedGalleryProps {
  photos: PhotoData[];
  onPhotoClick: (index: number) => void;
  itemsPerRow?: number;
  itemHeight?: number;
  containerHeight?: number;
}

interface LazyImageProps {
  src: string;
  alt: string;
  className?: string;
  onClick?: () => void;
}

// Componente per immagini lazy-loaded
function LazyImage({ src, alt, className, onClick }: LazyImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsInView(true);
            observer.unobserve(entry.target);
          }
        });
      },
      { 
        threshold: 0.1,
        rootMargin: "50px"
      }
    );

    if (imgRef.current) {
      observer.observe(imgRef.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <div 
      ref={imgRef}
      className={`relative overflow-hidden bg-gray-100 ${className}`}
      onClick={onClick}
    >
      {isInView && (
        <img
          src={src}
          alt={alt}
          className={`w-full h-full object-cover transition-opacity duration-300 ${
            isLoaded ? 'opacity-100' : 'opacity-0'
          }`}
          onLoad={() => setIsLoaded(true)}
          loading="lazy"
        />
      )}
      {isInView && !isLoaded && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      )}
    </div>
  );
}

export default function VirtualizedGallery({ 
  photos, 
  onPhotoClick, 
  itemsPerRow = 4,
  itemHeight = 250,
  containerHeight = 600 
}: VirtualizedGalleryProps) {
  const [visibleStart, setVisibleStart] = useState(0);
  const [visibleEnd, setVisibleEnd] = useState(20);
  const containerRef = useRef<HTMLDivElement>(null);

  // Calcola quante righe sono necessarie
  const totalRows = Math.ceil(photos.length / itemsPerRow);
  const totalHeight = totalRows * itemHeight;

  // Buffer per caricare elementi extra sopra e sotto la vista
  const BUFFER_SIZE = 2;

  const handleScroll = () => {
    if (!containerRef.current) return;

    const scrollTop = containerRef.current.scrollTop;
    const visibleRowStart = Math.floor(scrollTop / itemHeight);
    const visibleRowEnd = Math.ceil((scrollTop + containerHeight) / itemHeight);

    const bufferedStart = Math.max(0, visibleRowStart - BUFFER_SIZE);
    const bufferedEnd = Math.min(totalRows, visibleRowEnd + BUFFER_SIZE);

    setVisibleStart(bufferedStart * itemsPerRow);
    setVisibleEnd(bufferedEnd * itemsPerRow);
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll(); // Calcolo iniziale

    return () => container.removeEventListener('scroll', handleScroll);
  }, [itemHeight, containerHeight, totalRows]);

  // Elementi visibili con posizionamento assoluto
  const visibleItems = useMemo(() => {
    return photos.slice(visibleStart, visibleEnd).map((photo, index) => {
      const absoluteIndex = visibleStart + index;
      const row = Math.floor(absoluteIndex / itemsPerRow);
      const col = absoluteIndex % itemsPerRow;
      
      return {
        photo,
        absoluteIndex,
        style: {
          position: 'absolute' as const,
          top: row * itemHeight,
          left: `${(col * 100) / itemsPerRow}%`,
          width: `${100 / itemsPerRow}%`,
          height: itemHeight,
          padding: '4px'
        }
      };
    });
  }, [photos, visibleStart, visibleEnd, itemsPerRow, itemHeight]);

  return (
    <div 
      ref={containerRef}
      className="relative overflow-auto border rounded-lg"
      style={{ height: containerHeight }}
    >
      {/* Container con altezza totale per permettere lo scroll */}
      <div style={{ height: totalHeight, position: 'relative' }}>
        {visibleItems.map(({ photo, absoluteIndex, style }) => (
          <div key={photo.id} style={style}>
            <LazyImage
              src={photo.url}
              alt={photo.name}
              className="w-full h-full rounded cursor-pointer hover:scale-105 transition-transform"
              onClick={() => onPhotoClick(absoluteIndex)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}