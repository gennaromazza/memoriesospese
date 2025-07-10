import { Loader2 } from "lucide-react";
import { Progress } from "../ui/progress";
import { createUrl } from "../lib/basePath";

interface GalleryLoadingProgressProps {
  totalPhotos: number;
  loadedPhotos: number;
  progress: number;
}

export default function GalleryLoadingProgress({
  totalPhotos,
  loadedPhotos,
  progress
}: GalleryLoadingProgressProps) {
  // Assicuriamoci che i valori siano sempre numeri validi
  const safeProgress = isNaN(progress) ? 0 : Math.min(100, Math.max(0, progress));
  const safeLoaded = isNaN(loadedPhotos) ? 0 : loadedPhotos;
  const safeTotal = isNaN(totalPhotos) || totalPhotos <= 0 ? 100 : totalPhotos;
  
  return (
    <div className="fixed inset-0 bg-white/95 dark:bg-black/95 z-50 flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full text-center space-y-6 bg-white shadow-lg rounded-xl p-6 border border-sage-100">
        <div className="flex justify-center mb-2">
          <img src={createUrl('/logo.png')} alt="Logo" className="h-12" />
        </div>
        
        <h2 className="text-2xl font-playfair text-sage-700">Caricamento galleria</h2>
        
        <div className="relative">
          <Progress value={safeProgress} className="h-4 w-full" />
          <p className="text-sm text-sage-600 mt-3 font-medium">
            {safeProgress < 100 ? (
              <>
                Caricamento foto <span className="font-bold">{safeLoaded}</span> di <span className="font-bold">{safeTotal}</span>
              </>
            ) : (
              "Caricamento completato!"
            )}
          </p>
        </div>
        
        <div className="flex items-center justify-center mt-4 bg-sage-50 p-3 rounded-lg">
          <Loader2 className="h-6 w-6 animate-spin text-sage-600 mr-2" />
          <p className="text-sage-700">
            {safeProgress < 100 
              ? "Stiamo preparando tutte le foto della galleria..." 
              : "Ottimizzazione della visualizzazione..."}
          </p>
        </div>
        
        <p className="text-sm text-sage-500 mt-4 italic">
          Attendere il caricamento completo per una migliore esperienza. La galleria sarà disponibile tra pochi istanti.
        </p>
      </div>
    </div>
  );
}