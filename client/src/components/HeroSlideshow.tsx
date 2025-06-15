import { useState, useEffect, useMemo, useCallback } from 'react';
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
  const [imagesLoaded, setImagesLoaded] = useState<Set<number>>(new Set());

  useEffect(() => {
    async function fetchSlideshowImages() {
      try {
        // Semplifica la query iniziale e aggiungi gestione errori
        const slideshowCollection = collection(db, 'slideshow');
        
        try {
          // Carica solo le prime 5 immagini per migliorare performance
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
          }
        } catch (innerError) {
          
          // In caso di errore, non facciamo nulla e lasciamo l'array vuoto
        }
        
        setLoading(false);
      } catch (error) {
        
        setLoading(false);
      }
    }

    fetchSlideshowImages();
  }, []);

  useEffect(() => {
    if (images.length <= 1) return;

    const intervalId = setInterval(() => {
      setCurrentImageIndex((prevIndex) => (prevIndex + 1) % images.length);
    }, 5000); // Cambia immagine ogni 5 secondi

    return () => clearInterval(intervalId);
  }, [images.length]);

  if (loading) {
    return null; // Non mostrare nulla durante il caricamento
  }

  if (images.length === 0) {
    return null; // Non mostrare nulla se non ci sono immagini
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
          <img
            src={image.url}
            alt={image.alt}
            className="object-cover w-full h-full"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-mint/70 to-sage/50 mix-blend-multiply" aria-hidden="true"></div>
        </div>
      ))}
    </div>
  );
}