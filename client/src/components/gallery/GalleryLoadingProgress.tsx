import { Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { createUrl } from "@/lib/basePath";

interface GalleryLoadingProgressProps {
  totalPhotos: number;
  loadedPhotos: number;
  progress: number;
  isVisible?: boolean;
}

export default function GalleryLoadingProgress({
  totalPhotos,
  loadedPhotos,
  progress,
  isVisible = false
}: GalleryLoadingProgressProps) {
  // Assicuriamoci che i valori siano sempre numeri validi
  const safeProgress = isNaN(progress) ? 0 : Math.min(100, Math.max(0, progress));
  const safeLoaded = isNaN(loadedPhotos) ? 0 : loadedPhotos;
  const safeTotal = isNaN(totalPhotos) || totalPhotos <= 0 ? 100 : totalPhotos;
  
  // Non mostrare overlay se non necessario
  if (!isVisible || safeProgress >= 100) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-40 max-w-sm">
      <div className="bg-white shadow-lg rounded-lg p-4 border border-sage-200">
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-sage-600 flex-shrink-0" />
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-sage-700">Caricamento</span>
              <span className="text-xs text-sage-500">{Math.round(safeProgress)}%</span>
            </div>
            <Progress value={safeProgress} className="h-2" />
          </div>
        </div>
      </div>
    </div>
  );
}