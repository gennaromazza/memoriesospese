import { Zap, X, CheckCircle2, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import type { GalleryPreloadState } from '@/hooks/useGalleryPreload';

interface GalleryPreloadBannerProps {
  preload: GalleryPreloadState;
  photoUrls: string[];
}

export function GalleryPreloadBanner({ preload, photoUrls }: GalleryPreloadBannerProps) {
  const [expanded, setExpanded] = useState(false);
  const { status, loaded, total, startPreload, cancelPreload, resetPreload } = preload;

  const photoCount = photoUrls.length;
  const estimatedMB = Math.round((photoCount * 300) / 1024 * 10) / 10;
  const percent = total > 0 ? Math.round((loaded / total) * 100) : 0;

  if (photoCount === 0) return null;

  // ✅ Completato
  if (status === 'done') {
    return (
      <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-xl px-4 py-2.5 mb-4">
        <div className="flex items-center gap-2 text-green-700">
          <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
          <span className="text-sm font-medium">
            {total} foto pronte in memoria — navigazione istantanea ✨
          </span>
        </div>
        <button onClick={resetPreload} className="text-green-500 hover:text-green-700 ml-3">
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  // ⏳ Caricamento in corso
  if (status === 'loading') {
    return (
      <div className="bg-[#6b7f6b]/8 border border-[#6b7f6b]/30 rounded-xl px-4 py-3 mb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-[#6b7f6b] flex-shrink-0" />
            <span className="text-sm font-semibold text-[#4a5f4a]">
              Precaricamento — {loaded} / {total} foto ({percent}%)
            </span>
          </div>
          <button
            onClick={cancelPreload}
            className="text-gray-400 hover:text-gray-600 flex items-center gap-1 text-xs"
          >
            <X className="h-3.5 w-3.5" />
            Annulla
          </button>
        </div>
        <div className="h-2 bg-[#6b7f6b]/15 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#6b7f6b] rounded-full transition-all duration-300 ease-out"
            style={{ width: `${percent}%` }}
          />
        </div>
        <p className="text-xs text-[#6b7f6b]/70 mt-1.5">
          Quando completo, sfogliare le foto sarà istantaneo
        </p>
      </div>
    );
  }

  // 🚫 Annullato
  if (status === 'cancelled') {
    return (
      <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 mb-4">
        <span className="text-sm text-gray-500">Precaricamento annullato ({loaded}/{total} foto già in memoria)</span>
        <button
          onClick={() => startPreload(photoUrls)}
          className="text-xs text-[#6b7f6b] hover:underline font-medium ml-3"
        >
          Riprendi
        </button>
      </div>
    );
  }

  // 💤 Idle — pulsante principale
  return (
    <div className="mb-4">
      <div className="bg-white border border-[#6b7f6b]/25 rounded-xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-[#6b7f6b]/10 rounded-full flex items-center justify-center flex-shrink-0">
              <Zap className="h-4 w-4 text-[#6b7f6b]" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-800">Precarica galleria</p>
              <p className="text-xs text-gray-500">
                {photoCount} foto · ~{estimatedMB} MB · navigazione istantanea
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => startPreload(photoUrls)}
              className="bg-[#6b7f6b] hover:bg-[#5a6e5a] text-white text-xs h-8 px-3"
            >
              Avvia
            </Button>
            <button
              onClick={() => setExpanded(e => !e)}
              className="text-gray-400 hover:text-gray-600"
            >
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {expanded && (
          <div className="border-t border-[#6b7f6b]/10 bg-[#f5f0e8]/40 px-4 py-3 text-xs text-gray-600 space-y-1.5">
            <p>
              <span className="font-medium">📸 Foto nella galleria:</span> {photoCount}
            </p>
            <p>
              <span className="font-medium">💾 RAM stimata:</span> ~{estimatedMB} MB
              <span className="text-gray-400 ml-1">(si libera alla chiusura della scheda)</span>
            </p>
            <p>
              <span className="font-medium">⚡ Come funziona:</span> le foto vengono scaricate tutte in anticipo.
              Scrollare, selezionare e fare zoom diventa immediato senza attese di rete.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
