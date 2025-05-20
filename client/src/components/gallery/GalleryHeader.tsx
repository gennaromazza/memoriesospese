import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { it } from 'date-fns/locale/it';
import { FloralCorner, BackgroundDecoration } from '@/components/WeddingIllustrations';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Expand, Share2 } from 'lucide-react';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { createAbsoluteUrl } from '@/lib/basePath';
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface GalleryHeaderProps {
  name: string;
  date: string;
  location: string;
  description?: string;
  coverImageUrl?: string;
  galleryId?: string;
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
  galleryId
}: GalleryHeaderProps) {
  const [imageDimensions, setImageDimensions] = useState<ImageDimensions | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [isImageDialogOpen, setIsImageDialogOpen] = useState(false);
  const { toast } = useToast();
  
  // Funzione per condividere la galleria
  const handleShare = () => {
    // Usa sempre il path relativo senza basePath
    const relativePath = galleryId
      ? `/view/${galleryId}`
      : window.location.pathname.replace(import.meta.env.PROD ? '/wedgallery' : '', '');

    // Genera l'URL completo in modo context-aware e codificato
    const url = createAbsoluteUrl(relativePath);

    // Condivisione nativa o fallback copia
    if (navigator.share) {
      navigator.share({
        title: `Galleria fotografica – ${name}`,
        text: `Dai un'occhiata alle foto di ${name}`,
        url,
      }).catch(() => copyToClipboard(url));
    } else {
      // Utilizza fallback per browser non supportati
      copyToClipboard(url);
    }
  };

  // Funzione di fallback per copiare l'URL negli appunti
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(
      () => {
        toast({
          description: "Link copiato negli appunti! Ora puoi condividerlo con i tuoi amici.",
        });
      },
      (err) => {
        console.error('Impossibile copiare il testo negli appunti', err);
        toast({
          variant: "destructive",
          description: "Impossibile copiare il link. Riprova più tardi.",
        });
      }
    );
  };
  
  // Carica e analizza le dimensioni dell'immagine di copertina
  useEffect(() => {
    if (coverImageUrl && coverImageUrl.trim() !== "") {
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
        console.error("Errore nel caricamento dell'immagine di copertina");
        setImageLoaded(true); // Imposta a true anche in caso di errore per evitare il caricamento infinito
      };
      img.src = coverImageUrl;
    }
  }, [coverImageUrl]);
  
  // Formatta la data in italiano
  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return format(date, "d MMMM yyyy", { locale: it });
    } catch (error) {
      console.error("Errore nella formattazione della data:", error);
      return dateString;
    }
  };

  return (
    <div className="relative bg-white py-6 sm:py-10 overflow-hidden">
      {/* Decorazioni */}
      <FloralCorner position="top-left" className="absolute top-0 left-0 w-32 h-32 opacity-10 pointer-events-none" />
      <FloralCorner position="top-right" className="absolute top-0 right-0 w-32 h-32 opacity-10 pointer-events-none" />
      <div className="absolute inset-0 opacity-5 pointer-events-none">
        <BackgroundDecoration />
      </div>
      
      {coverImageUrl && coverImageUrl.trim() !== "" ? (
        <div className="relative w-full mb-10">
          <div className={`relative w-full max-w-6xl mx-auto ${
            imageDimensions?.isLandscape 
              ? 'h-64 sm:h-80 md:h-96 lg:h-[450px]' 
              : imageDimensions?.aspectRatio && imageDimensions.aspectRatio < 0.7
                ? 'h-[500px] sm:h-[550px] md:h-[600px] lg:h-[650px]' // Immagini molto verticali
                : 'h-[400px] sm:h-[450px] md:h-[500px] lg:h-[550px]' // Immagini verticali ma non estreme
          } overflow-hidden rounded-lg shadow-lg`}>
            <div className="relative w-full h-full">
              {/* Pulsanti per ingrandire e condividere l'immagine */}
              <div className="absolute top-3 right-3 z-10 flex space-x-2">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button 
                        onClick={handleShare}
                        className="bg-black/40 hover:bg-black/60 text-white p-2 rounded-full transition-colors duration-200"
                        aria-label="Condividi galleria"
                      >
                        <Share2 className="h-5 w-5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Condividi galleria</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                
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
                src={coverImageUrl} 
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
                  maxWidth: '100%'
                }}
                onClick={() => setIsImageDialogOpen(true)}
              />
              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/70 flex flex-col items-center justify-end p-6 sm:p-8 pointer-events-none">
                <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white font-playfair text-center drop-shadow-md">
                  {name}
                </h1>
                <div className="mt-3 text-white/90 flex flex-wrap justify-center items-center gap-2 text-lg drop-shadow-md">
                  <span>{formatDate(date)}</span>
                  {location && (
                    <>
                      <span className="hidden sm:inline">•</span>
                      <span>{location}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="max-w-7xl mx-auto sm:px-6 lg:px-8 relative z-10">
          <div className="px-4 text-center mb-10">
            <div className="flex justify-center items-center mb-2">
              <h1 className="text-3xl md:text-4xl font-bold text-blue-gray font-playfair">
                {name}
              </h1>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button 
                      onClick={handleShare}
                      className="ml-3 bg-sage-100 hover:bg-sage-200 text-sage-600 p-2 rounded-full transition-colors duration-200"
                      aria-label="Condividi galleria"
                    >
                      <Share2 className="h-5 w-5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Condividi galleria</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="mt-2 text-blue-gray/70 flex justify-center items-center space-x-2">
              <span>{formatDate(date)}</span>
              {location && (
                <>
                  <span>•</span>
                  <span>{location}</span>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      
      {description && description.trim() !== "" && (
        <div className="px-4 mb-8 max-w-7xl mx-auto">
          <div className="max-w-4xl mx-auto bg-white p-6 rounded-lg shadow-sm">
            <p className="text-gray-700 italic">{description}</p>
          </div>
        </div>
      )}

      {/* Modale per l'immagine ingrandita */}
      <Dialog open={isImageDialogOpen} onOpenChange={setIsImageDialogOpen}>
        <DialogContent className="max-w-[90vw] h-[90vh] p-0 bg-transparent border-none shadow-none">
          <DialogTitle>
            <VisuallyHidden>Immagine di copertina: {name}</VisuallyHidden>
          </DialogTitle>
          
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
            
            {coverImageUrl && (
              <img 
                src={coverImageUrl} 
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