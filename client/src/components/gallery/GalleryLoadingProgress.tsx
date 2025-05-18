import { Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";

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
  return (
    <div className="fixed inset-0 bg-white/90 dark:bg-black/90 z-50 flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full text-center space-y-4">
        <h2 className="text-2xl font-playfair text-sage-700">Caricamento galleria</h2>
        
        <div className="relative">
          <Progress value={progress} className="h-3 w-full" />
          <p className="text-sm text-sage-600 mt-2">
            {progress < 100 ? (
              <>
                Caricamento foto <span className="font-semibold">{loadedPhotos}</span> di <span className="font-semibold">{totalPhotos}</span>
              </>
            ) : (
              "Caricamento completato!"
            )}
          </p>
        </div>
        
        <div className="flex items-center justify-center mt-4">
          <Loader2 className="h-6 w-6 animate-spin text-sage-600 mr-2" />
          <p className="text-sage-600">
            {progress < 100 
              ? "Stiamo caricando tutte le foto della galleria..." 
              : "Preparazione della visualizzazione..."}
          </p>
        </div>
        
        <p className="text-sm text-sage-500 mt-6">
          Attendere il caricamento completo per una migliore esperienza. Tutte le foto saranno disponibili.
        </p>
      </div>
    </div>
  );
}