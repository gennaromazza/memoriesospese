import { useState, useEffect, useRef } from "react";
import { Photo } from "@shared/schema";
import { ArrowLeft, ArrowRight, Download, X, ZoomIn, ZoomOut, Maximize } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useToast } from "@/hooks/use-toast";

interface ImageLightboxProps {
  isOpen: boolean;
  onClose: () => void;
  photos: Photo[];
  initialIndex: number;
}

export default function ImageLightbox({ isOpen, onClose, photos, initialIndex }: ImageLightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [zoom, setZoom] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const lightboxRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const isMobile = useIsMobile();
  const { toast } = useToast();
  
  // Reset current index when the component receives a new initialIndex
  useEffect(() => {
    setCurrentIndex(initialIndex);
    setZoom(1); // Reset zoom when changing photos
  }, [initialIndex]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (!isOpen) return;
      
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowLeft") {
        navigatePrevious();
      } else if (e.key === "ArrowRight") {
        navigateNext();
      }
    };

    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [isOpen, currentIndex, photos.length]);

  // If no photos or not open, don't render
  if (!isOpen || photos.length === 0) {
    return null;
  }

  const currentPhoto = photos[currentIndex];

  const navigatePrevious = () => {
    setCurrentIndex((prev) => (prev - 1 + photos.length) % photos.length);
  };

  const navigateNext = () => {
    setCurrentIndex((prev) => (prev + 1) % photos.length);
  };

  // Funzione per gestire lo zoom
  const handleZoom = (zoomIn: boolean) => {
    setZoom(prev => {
      if (zoomIn) {
        return Math.min(prev + 0.25, 3); // Max zoom 3x
      } else {
        return Math.max(prev - 0.25, 0.5); // Min zoom 0.5x
      }
    });
  };

  // Funzione per gestire il fullscreen
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      lightboxRef.current?.requestFullscreen().catch(err => {
        console.error(`Errore nel passare a fullscreen: ${err.message}`);
      });
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  // Gestione degli eventi touch per lo swipe su mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.targetTouches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > 50;
    const isRightSwipe = distance < -50;
    
    if (isLeftSwipe) {
      navigateNext();
    } else if (isRightSwipe) {
      navigatePrevious();
    }
    
    // Reset touch state
    setTouchStart(null);
    setTouchEnd(null);
  };

  // Funzione per il download diretto
  const handleDownload = async (e: React.MouseEvent) => {
    e.preventDefault();
    
    try {
      const fileName = currentPhoto.name || `photo_${currentIndex + 1}.jpg`;
      
      // Prima mostriamo il toast di avvio download
      toast({
        title: "Download avviato",
        description: `Scaricamento di ${fileName} in corso...`,
        duration: 3000,
      });
      
      // Metodo 1: Usa l'elemento immagine già caricato
      const imgElement = imageRef.current;
      if (imgElement && imgElement.complete) {
        // Crea un canvas e disegna l'immagine su di esso
        const canvas = document.createElement('canvas');
        canvas.width = imgElement.naturalWidth;
        canvas.height = imgElement.naturalHeight;
        
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(imgElement, 0, 0);
        
        // Converti il canvas in un'immagine scaricabile
        canvas.toBlob((blob) => {
          if (blob) {
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.style.display = 'none';
            link.href = url;
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            
            setTimeout(() => {
              document.body.removeChild(link);
              URL.revokeObjectURL(url);
            }, 100);
            
            // Mostra un toast di successo
            toast({
              title: "Download completato",
              description: `${fileName} è stato scaricato con successo.`,
              duration: 3000,
            });
          }
        }, 'image/jpeg', 0.95);
        return;
      }
      
      // Metodo 2: Fallback - carica direttamente l'URL
      // Aggiungiamo parametri all'URL per evitare la cache e forzare il download
      const downloadUrl = `${currentPhoto.url}?alt=media&downloadToken=${Date.now()}`;
      const link = document.createElement('a');
      link.style.display = 'none';
      link.href = downloadUrl;
      link.setAttribute('download', fileName);
      link.setAttribute('target', '_self'); // Mantiene nello stesso contesto
      document.body.appendChild(link);
      link.click();
      
      setTimeout(() => {
        document.body.removeChild(link);
      }, 100);
      
      // Mostra un toast di successo
      toast({
        title: "Download completato",
        description: `${fileName} è stato scaricato con successo.`,
        duration: 3000,
      });
    } catch (error) {
      console.error('Errore durante il download:', error);
      toast({
        title: "Errore",
        description: "Si è verificato un errore durante il download dell'immagine.",
        variant: "destructive",
      });
    }
  };

  return (
    <div 
      ref={lightboxRef}
      className="fixed inset-0 z-50 overflow-hidden bg-black/95" 
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Controllo di navigazione a sinistra (desktop) */}
      {!isMobile && (
        <button 
          onClick={navigatePrevious}
          className="absolute left-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/30 text-white hover:bg-black/50 transition-all"
          aria-label="Foto precedente"
        >
          <ArrowLeft size={24} />
        </button>
      )}
      
      {/* Controllo di navigazione a destra (desktop) */}
      {!isMobile && (
        <button 
          onClick={navigateNext}
          className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/30 text-white hover:bg-black/50 transition-all"
          aria-label="Foto successiva"
        >
          <ArrowRight size={24} />
        </button>
      )}
      
      {/* Barra superiore */}
      <div className="absolute top-0 left-0 right-0 px-4 py-3 bg-gradient-to-b from-black/70 to-transparent flex justify-between items-center">
        <h3 className="text-white font-medium truncate max-w-[60%]">
          {currentPhoto.name || `Foto ${currentIndex + 1} di ${photos.length}`}
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="p-2 text-white hover:text-gray-300 focus:outline-none"
          aria-label="Chiudi"
        >
          <X size={24} />
        </button>
      </div>
      
      {/* Contenitore principale dell'immagine */}
      <div className="w-full h-full flex items-center justify-center p-4 sm:p-8 overflow-hidden">
        <img 
          ref={imageRef}
          src={currentPhoto.url} 
          alt={currentPhoto.name || `Foto ${currentIndex + 1}`} 
          style={{ transform: `scale(${zoom})`, transition: 'transform 0.3s ease-in-out' }}
          className="max-w-full max-h-full object-contain select-none"
          draggable={false}
        />
      </div>
      
      {/* Barra inferiore con controlli */}
      <div className="absolute bottom-0 left-0 right-0 px-4 py-3 bg-gradient-to-t from-black/70 to-transparent">
        {/* Indicatore di posizione */}
        <div className="text-center text-white mb-2">
          {currentIndex + 1} / {photos.length}
        </div>
        
        {/* Controlli */}
        <div className={`grid ${isMobile ? 'grid-cols-3' : 'grid-cols-5'} gap-2`}>
          {isMobile ? (
            <>
              <button 
                onClick={navigatePrevious}
                className="btn-lightbox"
                aria-label="Foto precedente"
              >
                <ArrowLeft size={20} />
              </button>
              
              <button 
                onClick={handleDownload}
                className="btn-lightbox"
                aria-label="Scarica foto"
              >
                <Download size={20} />
              </button>
              
              <button 
                onClick={navigateNext}
                className="btn-lightbox"
                aria-label="Foto successiva"
              >
                <ArrowRight size={20} />
              </button>
            </>
          ) : (
            <>
              <button 
                onClick={() => handleZoom(false)}
                className="btn-lightbox"
                aria-label="Riduci zoom"
              >
                <ZoomOut size={20} />
              </button>
              
              <button 
                onClick={() => handleZoom(true)}
                className="btn-lightbox"
                aria-label="Aumenta zoom"
              >
                <ZoomIn size={20} />
              </button>
              
              <button 
                onClick={handleDownload}
                className="btn-lightbox"
                aria-label="Scarica foto"
              >
                <Download size={20} />
              </button>
              
              <button 
                onClick={toggleFullscreen}
                className="btn-lightbox"
                aria-label="Schermo intero"
              >
                <Maximize size={20} />
              </button>
              
              <button 
                onClick={onClose}
                className="btn-lightbox"
                aria-label="Chiudi"
              >
                <X size={20} />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
