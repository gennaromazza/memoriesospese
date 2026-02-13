import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { PhotoData } from "../hooks/use-gallery-data";
import { ArrowLeft, ArrowRight, Download, X, ZoomIn, ZoomOut, Maximize, Check, Plus, Minus, ChevronDown, ChevronUp, Expand } from "lucide-react";
import { useIsMobile } from "../hooks/use-mobile";
import { useToast } from "../hooks/use-toast";

interface SelectionInfo {
  isSelectionMode: boolean;
  selectedPhotoIds: string[];
  requiredPhotoCount: number;
  unlimitedSelection?: boolean; // Selezione libera senza limite
  onToggleSelection: (photoId: string) => void;
  selectionStatus?: string;
  onCompleteSelection?: () => void; // Callback per "Ho finito" in selezione libera
}

interface ProductRequirement {
  prodottoNome: string;
  prodottoNumeroFoto: number;
}

interface MultiProductInfo {
  isMultiProductMode: boolean;
  productRequirements: ProductRequirement[];
  photoAssignments: Record<string, string[]>;
  onToggleProductAssignment: (photoId: string, productIndex: string) => void;
  selectionStatus?: string;
}

interface ImageLightboxProps {
  isOpen: boolean;
  onClose: () => void;
  photos: PhotoData[];
  initialIndex: number;
  selectionInfo?: SelectionInfo;
  multiProductInfo?: MultiProductInfo;
}

export default function ImageLightbox({ isOpen, onClose, photos, initialIndex, selectionInfo, multiProductInfo }: ImageLightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [zoom, setZoom] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const [productPanelCollapsed, setProductPanelCollapsed] = useState(false);
  const lightboxRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const isMobile = useIsMobile();
  const { toast } = useToast();
  
  // Reset current index when the component receives a new initialIndex
  useEffect(() => {
    setCurrentIndex(initialIndex);
    setZoom(1);
    setProductPanelCollapsed(false);
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

  const currentPhoto = useMemo(() => photos[currentIndex], [photos, currentIndex]);
  
  const navigatePrevious = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + photos.length) % photos.length);
    setZoom(1); // Reset zoom quando si cambia foto
  }, [photos.length]);

  const navigateNext = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % photos.length);
    setZoom(1); // Reset zoom quando si cambia foto
  }, [photos.length]);

  // If no photos or not open, don't render
  if (!isOpen || photos.length === 0) {
    return null;
  }

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

  // Funzione per il download diretto (salva nella cartella Download)
  const handleDownload = async (e: React.MouseEvent) => {
    e.preventDefault();
    
    try {
      const fileName = currentPhoto.name || `photo_${currentIndex + 1}.jpg`;
      
      toast({
        title: "Download avviato",
        description: `Scaricamento di ${fileName} in corso...`,
        duration: 3000,
      });
      
      const response = await fetch(currentPhoto.url);
      if (!response.ok) throw new Error('Network response was not ok');
      
      const blob = await response.blob();
      
      let mimeType = blob.type;
      if (!mimeType || mimeType === 'application/octet-stream') {
        const extension = fileName.split('.').pop()?.toLowerCase();
        if (extension === 'jpg' || extension === 'jpeg') mimeType = 'image/jpeg';
        else if (extension === 'png') mimeType = 'image/png';
        else if (extension === 'gif') mimeType = 'image/gif';
        else if (extension === 'webp') mimeType = 'image/webp';
        else mimeType = 'image/jpeg';
      }
      
      const newBlob = new Blob([blob], { type: mimeType });
      const url = window.URL.createObjectURL(newBlob);
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const link = document.createElement('a');
      link.style.display = 'none';
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      
      link.click();
      
      setTimeout(() => {
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      }, 200);
      
      setTimeout(() => {
        toast({
          title: "Download completato",
          description: isMobile 
            ? `Foto salvata nei Download. Per aggiungerla alla Galleria foto: apri l'app File/Download, trova la foto e seleziona "Salva in Foto".`
            : `${fileName} è stato scaricato con successo.`,
          duration: isMobile ? 8000 : 3000,
        });
      }, 500);
    } catch (error) {
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
        
        {/* 🎯 Controlli Selezione - Solo in modalità selezione */}
        {selectionInfo?.isSelectionMode && selectionInfo.selectionStatus !== 'completed' && currentPhoto && (
          <div className="mb-3">
            {(() => {
              const isSelected = selectionInfo.selectedPhotoIds.includes(currentPhoto.id);
              const currentCount = selectionInfo.selectedPhotoIds.length;
              const requiredCount = selectionInfo.requiredPhotoCount;
              const isUnlimited = selectionInfo.unlimitedSelection === true;
              const canAddMore = isUnlimited || currentCount < requiredCount;
              const canToggle = isSelected || canAddMore;
              
              return (
                <div className="flex flex-col items-center gap-2">
                  {/* Contatore selezione */}
                  <div className="text-white text-sm font-medium bg-black/40 px-3 py-1 rounded-full">
                    {isUnlimited 
                      ? `${currentCount} foto selezionate` 
                      : `${currentCount} / ${requiredCount} foto selezionate`
                    }
                  </div>
                  
                  {/* Bottone Seleziona/Rimuovi - sempre attivo se foto selezionata o se c'è spazio */}
                  <button
                    onClick={() => selectionInfo.onToggleSelection(currentPhoto.id)}
                    disabled={!canToggle}
                    className={`flex items-center gap-2 px-6 py-3 rounded-full font-semibold transition-all ${
                      isSelected 
                        ? 'bg-terracotta text-white hover:bg-terracotta/80' 
                        : canAddMore
                          ? 'bg-sage text-white hover:bg-dark-sage'
                          : 'bg-gray-500/50 text-gray-300 cursor-not-allowed'
                    }`}
                    data-testid="lightbox-selection-button"
                  >
                    {isSelected ? (
                      <>
                        <Minus size={20} />
                        Rimuovi dalla selezione
                      </>
                    ) : canAddMore ? (
                      <>
                        <Plus size={20} />
                        Aggiungi alla selezione
                      </>
                    ) : (
                      <>
                        <Check size={20} />
                        Limite raggiunto
                      </>
                    )}
                  </button>
                  
                  {/* Hint quando limite raggiunto ma foto non selezionata */}
                  {!isSelected && !canAddMore && !isUnlimited && (
                    <p className="text-white/70 text-xs text-center max-w-[280px]">
                      Hai già selezionato {requiredCount} foto. Rimuovi una foto per selezionare questa.
                    </p>
                  )}
                </div>
              );
            })()}
          </div>
        )}
        
        {/* 🏷️ Controlli Multi-Product - Assegnazione a prodotti (compatto e riducibile) */}
        {multiProductInfo?.isMultiProductMode && multiProductInfo.selectionStatus !== 'completed' && currentPhoto && (
          <div className="mb-3">
            {(() => {
              const photoId = currentPhoto.id;
              const currentAssignments = multiProductInfo.photoAssignments[photoId] || [];
              const productColors = [
                { bg: 'bg-sage', text: 'text-white', ring: 'ring-sage/50' },
                { bg: 'bg-terracotta', text: 'text-white', ring: 'ring-terracotta/50' },
                { bg: 'bg-blue-gray', text: 'text-white', ring: 'ring-blue-gray/50' },
                { bg: 'bg-dark-sage', text: 'text-white', ring: 'ring-dark-sage/50' },
                { bg: 'bg-amber-600', text: 'text-white', ring: 'ring-amber-600/50' },
                { bg: 'bg-indigo-500', text: 'text-white', ring: 'ring-indigo-500/50' },
              ];
              
              return (
                <div className="mx-auto max-w-lg">
                  {productPanelCollapsed ? (
                    <button
                      onClick={() => setProductPanelCollapsed(false)}
                      className="w-full bg-black/50 backdrop-blur-sm rounded-full px-4 py-2 border border-white/10 flex items-center justify-center gap-2 text-white/80 hover:text-white hover:bg-black/60 transition-all"
                    >
                      <span className="text-sm font-medium">Assegna a prodotto</span>
                      {currentAssignments.length > 0 && (
                        <span className="bg-sage/90 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                          {currentAssignments.length}
                        </span>
                      )}
                      <ChevronUp size={14} />
                    </button>
                  ) : (
                    <div className="bg-black/60 backdrop-blur-sm rounded-xl px-3 py-2.5 border border-white/10">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-white/90 text-xs font-medium">Assegna a prodotto</span>
                          {currentAssignments.length > 0 && (
                            <span className="bg-sage/90 text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-0.5">
                              <Check size={10} />
                              {currentAssignments.length}
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => setProductPanelCollapsed(true)}
                          className="text-white/50 hover:text-white/80 p-0.5 transition-colors"
                          aria-label="Nascondi pannello prodotti"
                        >
                          <ChevronDown size={14} />
                        </button>
                      </div>
                      
                      <div className="flex flex-col gap-1.5">
                        {multiProductInfo.productRequirements.map((prod, idx) => {
                          const productIdStr = String(idx);
                          const isAssigned = currentAssignments.includes(productIdStr);
                          const color = productColors[idx % productColors.length];
                          
                          const assignedCount = Object.values(multiProductInfo.photoAssignments).filter(
                            assignments => assignments.includes(productIdStr)
                          ).length;
                          const productLimit = prod.prodottoNumeroFoto || 0;
                          const hasNoLimit = productLimit <= 0;
                          const isFull = !hasNoLimit && assignedCount >= productLimit && !isAssigned;
                          const isComplete = !hasNoLimit && assignedCount >= productLimit;
                          
                          return (
                            <button
                              key={idx}
                              onClick={() => multiProductInfo.onToggleProductAssignment(photoId, productIdStr)}
                              disabled={isFull}
                              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-200 flex items-center gap-2 whitespace-nowrap ${
                                isAssigned
                                  ? `${color.bg} ring-1 ${color.ring} shadow-md text-white`
                                  : isFull
                                    ? 'bg-white/5 cursor-not-allowed opacity-40 text-white/50'
                                    : 'bg-white/10 hover:bg-white/20 text-white/90'
                              }`}
                              data-testid={`lightbox-product-chip-${idx}`}
                            >
                              {isAssigned && <Check size={12} />}
                              <span className="flex-1 text-left">{prod.prodottoNome}</span>
                              <span className={`text-[10px] font-bold flex-shrink-0 ${isComplete ? 'text-green-300' : ''}`}>
                                {hasNoLimit ? assignedCount : `${assignedCount}/${productLimit}`}
                                {isComplete && ' ✓'}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}
        
        {/* Controlli navigazione */}
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

      {/* 💜 Pulsante floating "Ho finito" per selezione libera */}
      {selectionInfo?.isSelectionMode && 
       selectionInfo.unlimitedSelection === true && 
       selectionInfo.selectionStatus !== 'completed' &&
       selectionInfo.selectedPhotoIds.length > 0 &&
       selectionInfo.onCompleteSelection && (
        <button
          onClick={selectionInfo.onCompleteSelection}
          className="fixed bottom-24 right-4 z-[1002] flex items-center gap-2 px-6 py-3 bg-terracotta hover:bg-terracotta/90 text-white font-semibold rounded-full shadow-lg transition-all animate-pulse hover:animate-none"
          data-testid="lightbox-complete-selection-button"
        >
          <Check size={20} />
          Ho finito
        </button>
      )}
    </div>
  );
}
