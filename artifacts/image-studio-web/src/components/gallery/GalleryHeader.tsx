import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { it } from 'date-fns/locale/it';
import { FloralCorner, BackgroundDecoration } from '@/components/WeddingIllustrations';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Expand } from 'lucide-react';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import GalleryHeaderOverlay from './GalleryHeaderOverlay';
import type { GalleryHeaderThemeId } from '@/lib/gallery-header-themes';

interface GalleryHeaderProps {
  name: string;
  date: string;
  location: string;
  description?: string;
  coverImageUrl?: string;
  coverImageMobile?: string;
  coverImageDesktop?: string;
  coverImageMobilePosition?: { x: number; y: number };
  coverImageDesktopPosition?: { x: number; y: number };
  headerTheme?: GalleryHeaderThemeId | string | null;
  galleryId?: string;
  galleryCode?: string;
}

interface ImageDimensions {
  width: number;
  height: number;
  aspectRatio: number;
  isLandscape: boolean;
}

export default function GalleryHeader({ 
  name, 
  date, 
  location, 
  description, 
  coverImageUrl,
  coverImageMobile,
  coverImageDesktop,
  coverImageMobilePosition,
  coverImageDesktopPosition,
  headerTheme,
  galleryId,
  galleryCode
}: GalleryHeaderProps) {
  const [imageDimensions, setImageDimensions] = useState<ImageDimensions | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [isImageDialogOpen, setIsImageDialogOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Rileva se è mobile o desktop
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.matchMedia('(max-width: 768px)').matches);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Determina quale immagine mostrare in base al dispositivo
  const displayImage = isMobile 
    ? (coverImageMobile || coverImageDesktop || coverImageUrl)
    : (coverImageDesktop || coverImageUrl);

  // Calcola objectPosition per l'immagine attiva
  const activePosition = isMobile
    ? (coverImageMobilePosition || coverImageDesktopPosition)
    : (coverImageDesktopPosition || coverImageMobilePosition);
  const objectPositionStyle = activePosition
    ? `${activePosition.x}% ${activePosition.y}%`
    : '50% 50%';

  // Aggiungi classe al body per navbar trasparente su mobile quando c'è cover image
  useEffect(() => {
    if (isMobile && displayImage && displayImage.trim() !== "") {
      document.body.classList.add('mobile-gallery-fullscreen');
    } else {
      document.body.classList.remove('mobile-gallery-fullscreen');
    }
    
    return () => {
      document.body.classList.remove('mobile-gallery-fullscreen');
    };
  }, [isMobile, displayImage]);
  
  // Carica e analizza le dimensioni dell'immagine di copertina
  useEffect(() => {
    if (displayImage && displayImage.trim() !== "") {
      const img = new Image();
      img.onload = () => {
        const width = img.width;
        const height = img.height;
        const aspectRatio = width / height;
        setImageDimensions({
          width,
          height,
          aspectRatio,
          isLandscape: aspectRatio >= 1
        });
        setImageLoaded(true);
      };
      img.onerror = () => {
        
        setImageLoaded(true); // Imposta a true anche in caso di errore per evitare il caricamento infinito
      };
      img.src = displayImage;
    }
  }, [displayImage]);
  
  // Formatta la data in italiano
  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return format(date, "d MMMM yyyy", { locale: it });
    } catch (error) {
      
      return dateString;
    }
  };

  return (
    <div className="relative bg-white py-3 sm:py-4 md:py-6 overflow-hidden">
      {/* Decorazioni - nascoste su mobile per full-screen */}
      <FloralCorner position="top-left" className="hidden sm:block absolute top-0 left-0 w-24 h-24 opacity-10 pointer-events-none" />
      <FloralCorner position="top-right" className="hidden sm:block absolute top-0 right-0 w-24 h-24 opacity-10 pointer-events-none" />
      <div className="hidden sm:block absolute inset-0 opacity-5 pointer-events-none">
        <BackgroundDecoration />
      </div>
      
      {displayImage && displayImage.trim() !== "" ? (
        <div className="relative w-full mb-0 sm:mb-6">
          <div className={`relative w-full sm:max-w-6xl sm:mx-auto ${
            imageDimensions?.isLandscape 
              ? 'h-screen sm:h-80 md:h-96 lg:h-[450px]' 
              : imageDimensions?.aspectRatio && imageDimensions.aspectRatio < 0.7
                ? 'h-screen sm:h-[550px] md:h-[600px] lg:h-[650px]' // Immagini molto verticali - full screen mobile
                : 'h-screen sm:h-[450px] md:h-[500px] lg:h-[550px]' // Immagini verticali - full screen mobile
          } overflow-hidden sm:rounded-lg sm:shadow-lg`}>
            <div className="relative w-full h-full">
              {/* Pulsante per ingrandire l'immagine */}
              <div className="absolute top-3 right-3 z-10">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button 
                        onClick={() => setIsImageDialogOpen(true)}
                        className="bg-black/40 hover:bg-black/60 text-white p-2 rounded-full transition-colors duration-200"
                        aria-label="Ingrandisci immagine"
                      >
                        <Expand className="h-5 w-5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Ingrandisci immagine</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              
              <img 
                src={displayImage} 
                alt={`Copertina: ${name}`} 
                className={`w-full ${
                  imageDimensions?.isLandscape 
                    ? 'h-full object-cover' 
                    : 'h-auto object-contain'
                } cursor-pointer`}
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  maxHeight: '100%',
                  maxWidth: '100%',
                  objectPosition: objectPositionStyle
                }}
                onClick={() => setIsImageDialogOpen(true)}
              />
              {/* Overlay — delegato a GalleryHeaderOverlay (template-driven) */}
              <GalleryHeaderOverlay
                name={name}
                date={formatDate(date)}
                location={location}
                themeId={headerTheme}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 py-2">
          <div className="text-center mb-4 sm:mb-6">
            {/* Etichetta decorativa */}
            <div className="flex items-center justify-center gap-3 mb-3">
              <div className="h-px w-12 bg-[#6b7f6b]/30" />
              <span className="text-[#6b7f6b]/60 text-[9px] tracking-[0.35em] uppercase font-light select-none" style={{ fontFamily: "'Playfair Display', serif" }}>
                Galleria Fotografica
              </span>
              <div className="h-px w-12 bg-[#6b7f6b]/30" />
            </div>

            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-blue-gray font-playfair leading-tight mb-3 tracking-wide">
              {name}
            </h1>

            {/* Separatore diamante */}
            <div className="flex items-center justify-center gap-2 mb-3">
              <div className="h-px w-8 bg-[#6b7f6b]/25" />
              <div className="w-1.5 h-1.5 bg-[#6b7f6b]/40 rotate-45" />
              <div className="h-px w-8 bg-[#6b7f6b]/25" />
            </div>

            <div className="text-sm sm:text-base text-blue-gray/60 italic" style={{ fontFamily: "'Playfair Display', serif" }}>
              <span>{formatDate(date)}</span>
              {location && (
                <>
                  <span className="mx-2 text-blue-gray/35 not-italic">·</span>
                  <span>{location}</span>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      
      {description && description.trim() !== "" && (
        <div className="px-4 mb-4 sm:mb-6 max-w-7xl mx-auto">
          <div className="max-w-4xl mx-auto bg-white p-4 sm:p-6 rounded-lg shadow-sm">
            <p className="text-sm sm:text-base text-blue-gray italic">{description}</p>
          </div>
        </div>
      )}



      {/* Modale per l'immagine ingrandita */}
      <Dialog open={isImageDialogOpen} onOpenChange={setIsImageDialogOpen}>
        <DialogContent className="max-w-[90vw] h-[90vh] p-0 bg-transparent border-none shadow-none" aria-describedby="image-dialog-description">
          <DialogTitle>
            <VisuallyHidden>Immagine di copertina: {name}</VisuallyHidden>
          </DialogTitle>
          <VisuallyHidden id="image-dialog-description">
            Visualizzazione ingrandita dell'immagine di copertina della galleria
          </VisuallyHidden>
          
          <div className="w-full h-full relative flex items-center justify-center bg-black/90 rounded-lg overflow-hidden">
            <button 
              onClick={() => setIsImageDialogOpen(false)}
              className="absolute top-3 right-3 z-10 bg-black/60 hover:bg-black/80 text-white p-2 rounded-full"
              aria-label="Chiudi"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
            
            {displayImage && (
              <img 
                src={displayImage} 
                alt={`Copertina: ${name}`} 
                className="max-h-[85vh] max-w-[85vw] object-contain" 
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}