import { useState, useEffect, useCallback } from 'react';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { filterActiveSlideshowImages } from '@shared/slideshow-utils';

interface SlideshowImage {
  id: string;
  url: string;
  alt: string;
  position: number;
  jobType?: string;
  active?: boolean;
}

export default function HeroSlideshow() {
  const [images, setImages] = useState<SlideshowImage[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadedImages, setLoadedImages] = useState<Set<number>>(new Set());
  const [error, setError] = useState(false);

  const preloadImage = useCallback((url: string, index: number) => {
    const img = new Image();
    img.onload = () => {
      setLoadedImages(prev => new Set([...prev, index]));
    };
    img.src = url;
  }, []);

  useEffect(() => {
    async function fetchSlideshowImages() {
      try {
        const slideshowCollection = collection(db, 'slideshow');

        try {
          const slideshowQuery = query(slideshowCollection, orderBy('position'));
          const querySnapshot = await getDocs(slideshowQuery);

          if (!querySnapshot.empty) {
            const fetchedImages: SlideshowImage[] = [];
            querySnapshot.forEach((doc) => {
              const data = doc.data();
              fetchedImages.push({
                id: doc.id,
                url: data.url,
                alt: data.alt || 'Slideshow image',
                position: data.position || 0,
                jobType: typeof data.jobType === 'string' ? data.jobType : undefined,
                active: data.active !== false,
              });
            });

            const activeImages = filterActiveSlideshowImages(fetchedImages);

            const weddingImages = activeImages.filter(
              (image) => image.jobType?.trim().toLowerCase() === 'matrimonio',
            );
            const nonWeddingImages = activeImages.filter(
              (image) => image.jobType?.trim().toLowerCase() !== 'matrimonio',
            );
            // La priorità è data solo a immagini esplicitamente classificate
            // come matrimonio; le altre restano un fallback sicuro.
            const selectedImages = (
              weddingImages.length > 0
                ? [...weddingImages, ...nonWeddingImages]
                : activeImages
            ).slice(0, 5);

            setImages(selectedImages);
            
            if (selectedImages.length > 1) {
              setTimeout(() => {
                selectedImages.slice(1).forEach((img, idx) => {
                  preloadImage(img.url, idx + 1);
                });
              }, 100);
            }
          }
        } catch (innerError) {
          console.error('Errore caricamento slideshow:', innerError);
          setError(true);
        }

        setLoading(false);
      } catch (error) {
        console.error('Errore inizializzazione slideshow:', error);
        setError(true);
        setLoading(false);
      }
    }

    fetchSlideshowImages();
  }, [preloadImage]);

  useEffect(() => {
    if (images.length <= 1) return;

    const intervalId = setInterval(() => {
      setCurrentImageIndex((prevIndex) => (prevIndex + 1) % images.length);
    }, 5000);

    return () => clearInterval(intervalId);
  }, [images.length]);

  if (loading) {
    return (
      <div className="absolute inset-0 overflow-hidden bg-gradient-to-r from-sage/30 to-mint/30 animate-pulse" />
    );
  }

  if (error || images.length === 0) {
    return <div className="absolute inset-0 bg-gradient-to-br from-sage/30 to-mint/40" aria-label="Slideshow non disponibile" />;
  }

  return (
    <div className="absolute inset-0 overflow-hidden">
      {images.map((image, index) => (
        <div
          key={image.id}
          className={`absolute inset-0 transition-opacity duration-1000 ${
            index === currentImageIndex ? 'opacity-100' : 'opacity-0'
          }`}
        >
          {loadedImages.has(index) ? (
            <img
              src={image.url}
              alt={image.alt}
              className="object-cover w-full h-full"
              loading={index === 0 ? "eager" : "lazy"}
              decoding={index === 0 ? "sync" : "async"}
            />
          ) : (
            <>
              <div className="w-full h-full bg-gradient-to-r from-sage/30 to-mint/30 animate-pulse" />
              <img
                src={image.url}
                alt={image.alt}
                className="object-cover w-full h-full absolute inset-0"
                loading={index === 0 ? "eager" : "lazy"}
                decoding={index === 0 ? "sync" : "async"}
                onLoad={() => setLoadedImages(prev => new Set([...prev, index]))}
              />
            </>
          )}
          <div className="absolute inset-0 bg-gradient-to-r from-mint/70 to-sage/50 mix-blend-multiply" aria-hidden="true"></div>
        </div>
      ))}
    </div>
  );
}
