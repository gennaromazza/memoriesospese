import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { PhotoData } from "../hooks/use-gallery-data";
import { ArrowLeft, ArrowRight, Download, X, ZoomIn, ZoomOut, Maximize, Check, Plus, Minus, ChevronDown, ChevronUp } from "lucide-react";
import { useIsMobile } from "../hooks/use-mobile";
import { useToast } from "../hooks/use-toast";

interface SelectionInfo {
  isSelectionMode: boolean;
  selectedPhotoIds: string[];
  requiredPhotoCount: number;
  unlimitedSelection?: boolean;
  isDislikeMode?: boolean;
  onToggleSelection: (photoId: string) => void;
  selectionStatus?: string;
  onCompleteSelection?: () => void;
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
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [productPanelCollapsed, setProductPanelCollapsed] = useState(false);

  // Refs per drag con mouse
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  // Refs per touch (uso ref per evitare stale closures)
  const touch1Ref = useRef<{ x: number; y: number } | null>(null);
  const touch2Ref = useRef<{ x: number; y: number } | null>(null);
  const pinchStartDistRef = useRef<number | null>(null);
  const pinchStartZoomRef = useRef<number>(1);
  const panStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  const lightboxRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const zoomRef = useRef(1); // zoom aggiornato in sync per i gestori touch
  const isMobile = useIsMobile();
  const { toast } = useToast();

  // Mantieni zoomRef in sync con lo state
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);

  const resetView = useCallback(() => {
    setZoom(1);
    setPanX(0);
    setPanY(0);
    zoomRef.current = 1;
  }, []);

  // Reset all state quando cambia la foto
  useEffect(() => {
    setCurrentIndex(initialIndex);
    resetView();
    setProductPanelCollapsed(false);
  }, [initialIndex, resetView]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === "Escape") { onClose(); }
      else if (e.key === "ArrowLeft") { navigatePrevious(); }
      else if (e.key === "ArrowRight") { navigateNext(); }
      else if (e.key === "+" || e.key === "=") { handleZoom(true); }
      else if (e.key === "-") { handleZoom(false); }
      else if (e.key === "0") { resetView(); }
    };
    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [isOpen, currentIndex, photos.length]);

  const currentPhoto = useMemo(() => photos[currentIndex], [photos, currentIndex]);

  const navigatePrevious = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + photos.length) % photos.length);
    resetView();
  }, [photos.length, resetView]);

  const navigateNext = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % photos.length);
    resetView();
  }, [photos.length, resetView]);

  if (!isOpen || photos.length === 0) return null;

  // ─── Zoom con pulsanti ───────────────────────────────────────────────────────
  const handleZoom = (zoomIn: boolean) => {
    setZoom(prev => {
      const next = zoomIn ? Math.min(prev + 0.5, 5) : Math.max(prev - 0.5, 1);
      if (next === 1) { setPanX(0); setPanY(0); }
      return next;
    });
  };

  // ─── Fullscreen ──────────────────────────────────────────────────────────────
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      lightboxRef.current?.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  // ─── Mouse: drag per pan ─────────────────────────────────────────────────────
  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoomRef.current <= 1) return;
    e.preventDefault();
    isDraggingRef.current = true;
    dragStartRef.current = { x: e.clientX, y: e.clientY, panX, panY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current || !dragStartRef.current) return;
    e.preventDefault();
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setPanX(dragStartRef.current.panX + dx);
    setPanY(dragStartRef.current.panY + dy);
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
    dragStartRef.current = null;
  };

  // ─── Touch: pinch-to-zoom + pan + swipe navigation ──────────────────────────
  const getTouchDist = (t1: { x: number; y: number }, t2: { x: number; y: number }) =>
    Math.hypot(t2.x - t1.x, t2.y - t1.y);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      const t = e.touches[0];
      touch1Ref.current = { x: t.clientX, y: t.clientY };
      touch2Ref.current = null;
      pinchStartDistRef.current = null;
      panStartRef.current = { x: t.clientX, y: t.clientY, panX, panY };
    } else if (e.touches.length === 2) {
      const t1 = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      const t2 = { x: e.touches[1].clientX, y: e.touches[1].clientY };
      touch1Ref.current = t1;
      touch2Ref.current = t2;
      pinchStartDistRef.current = getTouchDist(t1, t2);
      pinchStartZoomRef.current = zoomRef.current;
      panStartRef.current = null; // disabilita pan single-finger
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchStartDistRef.current !== null) {
      // Pinch to zoom
      e.preventDefault();
      const t1 = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      const t2 = { x: e.touches[1].clientX, y: e.touches[1].clientY };
      const dist = getTouchDist(t1, t2);
      const scale = dist / pinchStartDistRef.current;
      const newZoom = Math.min(Math.max(pinchStartZoomRef.current * scale, 1), 5);
      setZoom(newZoom);
      zoomRef.current = newZoom;
      if (newZoom <= 1) { setPanX(0); setPanY(0); }
    } else if (e.touches.length === 1 && panStartRef.current) {
      const t = e.touches[0];
      if (zoomRef.current > 1) {
        // Pan mode
        e.preventDefault();
        const dx = t.clientX - panStartRef.current.x;
        const dy = t.clientY - panStartRef.current.y;
        setPanX(panStartRef.current.panX + dx);
        setPanY(panStartRef.current.panY + dy);
      }
      // Aggiorna la posizione corrente per il calcolo swipe finale
      touch1Ref.current = { x: t.clientX, y: t.clientY };
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    // Swipe navigation solo quando NON si è zoomati
    if (e.changedTouches.length === 1 && zoomRef.current <= 1 && panStartRef.current) {
      const startX = panStartRef.current.x;
      const endX = touch1Ref.current?.x ?? startX;
      const dist = startX - endX;
      if (dist > 60) navigateNext();
      else if (dist < -60) navigatePrevious();
    }
    // Pulizia
    pinchStartDistRef.current = null;
    panStartRef.current = null;
    touch1Ref.current = null;
    touch2Ref.current = null;
  };

  // ─── Download ────────────────────────────────────────────────────────────────
  const handleDownload = async (e: React.MouseEvent) => {
    e.preventDefault();
    try {
      const fileName = currentPhoto.name || `photo_${currentIndex + 1}.jpg`;
      toast({ title: "Download avviato", description: `Scaricamento di ${fileName} in corso...`, duration: 3000 });
      const response = await fetch(currentPhoto.url);
      if (!response.ok) throw new Error('Network response was not ok');
      const blob = await response.blob();
      let mimeType = blob.type;
      if (!mimeType || mimeType === 'application/octet-stream') {
        const ext = fileName.split('.').pop()?.toLowerCase();
        mimeType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
      }
      const url = window.URL.createObjectURL(new Blob([blob], { type: mimeType }));
      await new Promise(r => setTimeout(r, 100));
      const link = document.createElement('a');
      link.style.display = 'none';
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      setTimeout(() => { document.body.removeChild(link); window.URL.revokeObjectURL(url); }, 200);
      setTimeout(() => {
        toast({
          title: "Download completato",
          description: isMobile
            ? `Foto salvata nei Download. Per aggiungerla alla Galleria foto: apri l'app File/Download, trova la foto e seleziona "Salva in Foto".`
            : `${fileName} è stato scaricato con successo.`,
          duration: isMobile ? 8000 : 3000,
        });
      }, 500);
    } catch {
      toast({ title: "Errore", description: "Errore durante il download.", variant: "destructive" });
    }
  };

  // ─── Render ──────────────────────────────────────────────────────────────────
  const isZoomed = zoom > 1;
  const cursorStyle = isZoomed ? (isDraggingRef.current ? 'grabbing' : 'grab') : 'default';

  return (
    <div
      ref={lightboxRef}
      className="fixed inset-0 z-50 overflow-hidden bg-black/95"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Frecce navigazione desktop (nascoste quando zoomato) */}
      {!isMobile && !isZoomed && (
        <button
          onClick={navigatePrevious}
          className="absolute left-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/30 text-white hover:bg-black/50 transition-all z-10"
          aria-label="Foto precedente"
        >
          <ArrowLeft size={24} />
        </button>
      )}
      {!isMobile && !isZoomed && (
        <button
          onClick={navigateNext}
          className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/30 text-white hover:bg-black/50 transition-all z-10"
          aria-label="Foto successiva"
        >
          <ArrowRight size={24} />
        </button>
      )}

      {/* Barra superiore */}
      <div className="absolute top-0 left-0 right-0 px-4 py-3 bg-gradient-to-b from-black/70 to-transparent flex justify-between items-center z-10">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="text-white font-medium truncate max-w-[50%]">
            {currentPhoto.name || `Foto ${currentIndex + 1} di ${photos.length}`}
          </h3>
          {isZoomed && (
            <span className="text-white/60 text-xs bg-black/40 px-2 py-0.5 rounded-full flex-shrink-0">
              {Math.round(zoom * 100)}% · trascina per spostarti
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {isZoomed && (
            <button
              onClick={resetView}
              className="p-2 text-white/70 hover:text-white text-xs bg-black/30 rounded-lg transition-colors"
              title="Reset zoom (0)"
            >
              Reimposta
            </button>
          )}
          <button type="button" onClick={onClose} className="p-2 text-white hover:text-gray-300" aria-label="Chiudi">
            <X size={24} />
          </button>
        </div>
      </div>

      {/* Area immagine con pan/zoom */}
      <div
        className="w-full h-full flex items-center justify-center"
        style={{ cursor: cursorStyle, overflow: isZoomed ? 'hidden' : 'hidden' }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
      >
        <img
          ref={imageRef}
          src={currentPhoto.url}
          alt={currentPhoto.name || `Foto ${currentIndex + 1}`}
          style={{
            transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
            transition: isDraggingRef.current ? 'none' : 'transform 0.2s ease-out',
            transformOrigin: 'center center',
            maxWidth: '100%',
            maxHeight: '100%',
            objectFit: 'contain',
            userSelect: 'none',
            touchAction: isZoomed ? 'none' : 'pan-y',
            willChange: 'transform',
          }}
          draggable={false}
        />
      </div>

      {/* Barra inferiore */}
      <div className="absolute bottom-0 left-0 right-0 px-4 py-3 bg-gradient-to-t from-black/70 to-transparent z-10">
        <div className="text-center text-white mb-2">{currentIndex + 1} / {photos.length}</div>

        {/* Controlli selezione */}
        {selectionInfo?.isSelectionMode && selectionInfo.selectionStatus !== 'completed' && currentPhoto && (
          <div className="mb-3">
            {(() => {
              const isDislike = selectionInfo.isDislikeMode === true;
              const isExcluded = isDislike && selectionInfo.selectedPhotoIds.includes(currentPhoto.id);
              const isSelected = !isDislike && selectionInfo.selectedPhotoIds.includes(currentPhoto.id);
              const currentCount = selectionInfo.selectedPhotoIds.length;
              const requiredCount = selectionInfo.requiredPhotoCount;
              const isUnlimited = selectionInfo.unlimitedSelection === true;
              const canAddMore = isUnlimited || currentCount < requiredCount;
              const canToggle = isDislike ? true : (isSelected || canAddMore);

              if (isDislike) {
                return (
                  <div className="flex flex-col items-center gap-2">
                    <div className="text-white text-sm font-medium bg-black/40 px-3 py-1 rounded-full">
                      {currentCount > 0 ? `${currentCount} foto escluse` : 'Nessuna foto esclusa'}
                    </div>
                    <button
                      onClick={() => selectionInfo.onToggleSelection(currentPhoto.id)}
                      className={`flex items-center gap-2 px-6 py-3 rounded-full font-semibold transition-all ${
                        isExcluded ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-red-600 text-white hover:bg-red-700'
                      }`}
                      data-testid="lightbox-selection-button"
                    >
                      {isExcluded ? (<><Check size={20} />Includi questa foto</>) : (<><X size={20} />Escludi questa foto</>)}
                    </button>
                  </div>
                );
              }

              return (
                <div className="flex flex-col items-center gap-2">
                  <div className="text-white text-sm font-medium bg-black/40 px-3 py-1 rounded-full">
                    {isUnlimited ? `${currentCount} foto selezionate` : `${currentCount} / ${requiredCount} foto selezionate`}
                  </div>
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
                    {isSelected ? (<><Minus size={20} />Rimuovi dalla selezione</>) :
                     canAddMore ? (<><Plus size={20} />Aggiungi alla selezione</>) :
                     (<><Check size={20} />Limite raggiunto</>)}
                  </button>
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

        {/* Controlli multi-product */}
        {multiProductInfo?.isMultiProductMode && multiProductInfo.selectionStatus !== 'completed' && currentPhoto && (
          <div className="mb-3">
            {(() => {
              const photoId = currentPhoto.id;
              const currentAssignments = multiProductInfo.photoAssignments[photoId] || [];
              const productColors = [
                { bg: 'bg-sage', ring: 'ring-sage/50' },
                { bg: 'bg-terracotta', ring: 'ring-terracotta/50' },
                { bg: 'bg-blue-gray', ring: 'ring-blue-gray/50' },
                { bg: 'bg-dark-sage', ring: 'ring-dark-sage/50' },
                { bg: 'bg-amber-600', ring: 'ring-amber-600/50' },
                { bg: 'bg-indigo-500', ring: 'ring-indigo-500/50' },
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
                        <span className="bg-sage/90 text-white text-xs font-bold px-2 py-0.5 rounded-full">{currentAssignments.length}</span>
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
                              <Check size={10} />{currentAssignments.length}
                            </span>
                          )}
                        </div>
                        <button onClick={() => setProductPanelCollapsed(true)} className="text-white/50 hover:text-white/80 p-0.5 transition-colors" aria-label="Nascondi pannello prodotti">
                          <ChevronDown size={14} />
                        </button>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        {multiProductInfo.productRequirements.map((prod, idx) => {
                          const productIdStr = String(idx);
                          const isAssigned = currentAssignments.includes(productIdStr);
                          const color = productColors[idx % productColors.length];
                          const assignedCount = Object.values(multiProductInfo.photoAssignments).filter(a => a.includes(productIdStr)).length;
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
                                isAssigned ? `${color.bg} ring-1 ${color.ring} shadow-md text-white` :
                                isFull ? 'bg-white/5 cursor-not-allowed opacity-40 text-white/50' :
                                'bg-white/10 hover:bg-white/20 text-white/90'
                              }`}
                              data-testid={`lightbox-product-chip-${idx}`}
                            >
                              {isAssigned && <Check size={12} />}
                              <span className="flex-1 text-left">{prod.prodottoNome}</span>
                              <span className={`text-[10px] font-bold flex-shrink-0 ${isComplete ? 'text-green-300' : ''}`}>
                                {hasNoLimit ? assignedCount : `${assignedCount}/${productLimit}`}{isComplete && ' ✓'}
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

        {/* Pulsanti controllo */}
        <div className={`grid ${isMobile ? 'grid-cols-4' : 'grid-cols-5'} gap-2`}>
          {isMobile ? (
            <>
              <button onClick={navigatePrevious} className="btn-lightbox" aria-label="Foto precedente"><ArrowLeft size={20} /></button>
              <button onClick={() => handleZoom(true)} className={`btn-lightbox ${isZoomed ? 'bg-white/20' : ''}`} aria-label="Zoom in"><ZoomIn size={20} /></button>
              <button onClick={() => { if (isZoomed) resetView(); else handleDownload(new MouseEvent('click') as unknown as React.MouseEvent); }} className="btn-lightbox" aria-label={isZoomed ? "Reimposta zoom" : "Scarica foto"}>
                {isZoomed ? <ZoomOut size={20} /> : <Download size={20} />}
              </button>
              <button onClick={navigateNext} className="btn-lightbox" aria-label="Foto successiva"><ArrowRight size={20} /></button>
            </>
          ) : (
            <>
              <button onClick={() => handleZoom(false)} className="btn-lightbox" aria-label="Riduci zoom"><ZoomOut size={20} /></button>
              <button onClick={() => handleZoom(true)} className="btn-lightbox" aria-label="Aumenta zoom"><ZoomIn size={20} /></button>
              <button onClick={handleDownload} className="btn-lightbox" aria-label="Scarica foto"><Download size={20} /></button>
              <button onClick={toggleFullscreen} className="btn-lightbox" aria-label="Schermo intero"><Maximize size={20} /></button>
              <button onClick={onClose} className="btn-lightbox" aria-label="Chiudi"><X size={20} /></button>
            </>
          )}
        </div>
      </div>

      {/* Bottone "Ho finito" per selezione libera */}
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
