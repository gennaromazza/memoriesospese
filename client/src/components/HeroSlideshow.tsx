import { useState, useEffect, useCallback } from 'react';
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';

interface SlideshowImage {
  id: string;
  url: string;
  alt: string;
  position: number;
}

export default function HeroSlideshow() {
  const [images, setImages] = useState<SlideshowImage[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadedImages, setLoadedImages] = useState<Set<number>>(new Set());

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
          const slideshowQuery = query(
            slideshowCollection,
            orderBy('position'),
            limit(5)
          );
          const querySnapshot = await getDocs(slideshowQuery);

          if (!querySnapshot.empty) {
            const fetchedImages: SlideshowImage[] = [];
            querySnapshot.forEach((doc) => {
              const data = doc.data();
              fetchedImages.push({
                id: doc.id,
                url: data.url,
                alt: data.alt || 'Slideshow image',
                position: data.position || 0
              });
            });

            setImages(fetchedImages);
            
            if (fetchedImages.length > 1) {
              setTimeout(() => {
                fetchedImages.slice(1).forEach((img, idx) => {
                  preloadImage(img.url, idx + 1);
                });
              }, 100);
            }
          }
        } catch (innerError) {
        }

        setLoading(false);
      } catch (error) {
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

  if (images.length === 0) {
    return null;
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
