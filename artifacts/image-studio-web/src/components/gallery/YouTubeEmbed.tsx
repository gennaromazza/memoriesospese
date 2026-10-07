import { useState, useCallback, useEffect } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight, AlertCircle } from "lucide-react";
import { Button } from "../ui/button";

interface YouTubeEmbedProps {
  videoUrl?: string; // Retrocompatibilità
  videoUrls?: string[]; // Nuovo: array di URL
}

// Funzione per estrarre l'ID del video da un URL di YouTube (supporta anche Shorts)
function getYouTubeVideoId(url: string): string {
  try {
    // Pattern che supporta: watch, embed, youtu.be, shorts
    const regExp =
      /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|shorts\/|watch\?v=|&v=)([^#&?\s]*).*/;
    const match = url.match(regExp);
    return match && match[2].length === 11 ? match[2] : "";
  } catch (error) {
    return "";
  }
}

// Componente per singolo video con gestione errori
function YouTubeIframe({ videoId, title, isVertical = false }: { videoId: string; title: string; isVertical?: boolean }) {
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Reset error state when videoId changes
  useEffect(() => {
    setHasError(false);
    setIsLoading(true);
  }, [videoId]);

  if (hasError) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-100 dark:bg-gray-700 rounded-lg">
        <AlertCircle className="h-12 w-12 text-gray-400 mb-3" />
        <p className="text-sm text-gray-500 dark:text-gray-400 text-center px-4">
          Video non disponibile
        </p>
        <a 
          href={`https://www.youtube.com/watch?v=${videoId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 text-sm text-terracotta-600 hover:underline"
        >
          Apri su YouTube
        </a>
      </div>
    );
  }

  return (
    <>
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-gray-700 rounded-lg">
          <div className="animate-pulse text-gray-400">Caricamento video...</div>
        </div>
      )}
      <iframe
        src={`https://www.youtube.com/embed/${videoId}?playsinline=1&rel=0`}
        title={title}
        className="absolute top-0 left-0 w-full h-full rounded-lg"
        frameBorder="0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        onLoad={() => setIsLoading(false)}
        onError={() => {
          setHasError(true);
          setIsLoading(false);
        }}
      />
    </>
  );
}

export default function YouTubeEmbed({
  videoUrl,
  videoUrls,
}: YouTubeEmbedProps) {
  // Retrocompatibilità: se c'è videoUrl singolo ma non videoUrls, usa quello
  const urls =
    videoUrls && videoUrls.length > 0
      ? videoUrls
      : videoUrl && videoUrl.trim() !== ""
        ? [videoUrl]
        : [];

  // Filtra URL validi
  const validUrls = urls.filter((url) => getYouTubeVideoId(url));

  if (validUrls.length === 0) {
    return null;
  }

  // Se c'è solo un video, mostra senza slider
  if (validUrls.length === 1) {
    const videoId = getYouTubeVideoId(validUrls[0]);
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-8 mt-6">
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm">
          <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
            Video
          </h3>
          <div className="relative w-full pb-[56.25%]">
            <YouTubeIframe videoId={videoId} title="Video" />
          </div>
        </div>
      </div>
    );
  }

  // Slider per video multipli
  return <YouTubeSlider videoUrls={validUrls} />;
}

// Componente slider separato
function YouTubeSlider({ videoUrls }: { videoUrls: string[] }) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true });
  const [selectedIndex, setSelectedIndex] = useState(0);

  const scrollPrev = useCallback(() => {
    if (emblaApi) emblaApi.scrollPrev();
  }, [emblaApi]);

  const scrollNext = useCallback(() => {
    if (emblaApi) emblaApi.scrollNext();
  }, [emblaApi]);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelectedIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  // Aggiorna l'indice quando cambia la selezione
  useState(() => {
    if (emblaApi) {
      emblaApi.on("select", onSelect);
      onSelect();
    }
  });

  return (
    <div className="max-w-7xl mx-auto px-2 sm:px-6 lg:px-8 mb-8 mt-6">
      <div className="bg-white dark:bg-gray-800 p-3 sm:p-6 rounded-lg shadow-sm">
        <div className="flex items-center justify-between mb-3 sm:mb-4">
          <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white">
            Video
          </h3>
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 font-medium">
              {selectedIndex + 1} / {videoUrls.length}
            </span>
          </div>
        </div>

        {/* Hint swipe su mobile */}
        <div className="sm:hidden text-center mb-2">
          <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center justify-center gap-1">
            <ChevronLeft className="h-3 w-3" />
            <span>Scorri per vedere altri video</span>
            <ChevronRight className="h-3 w-3" />
          </span>
        </div>

        {/* Container video con controlli su desktop */}
        <div className="relative">
          {/* Freccia sinistra - Desktop only */}
          <Button
            variant="outline"
            size="icon"
            onClick={scrollPrev}
            className="hidden sm:flex absolute left-2 top-1/2 -translate-y-1/2 z-10 h-10 w-10 rounded-full bg-white/90 hover:bg-white shadow-lg"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>

          {/* Slider video */}
          <div className="overflow-hidden rounded-lg" ref={emblaRef}>
            <div className="flex">
              {videoUrls.map((url, index) => {
                const videoId = getYouTubeVideoId(url);
                return (
                  <div key={index} className="flex-[0_0_100%] min-w-0 px-0">
                    <div className="relative w-full pb-[56.25%]">
                      <YouTubeIframe videoId={videoId} title={`Video ${index + 1}`} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Freccia destra - Desktop only */}
          <Button
            variant="outline"
            size="icon"
            onClick={scrollNext}
            className="hidden sm:flex absolute right-2 top-1/2 -translate-y-1/2 z-10 h-10 w-10 rounded-full bg-white/90 hover:bg-white shadow-lg"
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>

        {/* Indicatori più grandi e tappabili su mobile */}
        <div className="flex justify-center gap-2 sm:gap-3 mt-4 sm:mt-5">
          {videoUrls.map((_, index) => (
            <button
              key={index}
              onClick={() => emblaApi?.scrollTo(index)}
              className={`h-2.5 sm:h-2 rounded-full transition-all touch-manipulation ${
                index === selectedIndex
                  ? "w-10 sm:w-8 bg-terracotta-600"
                  : "w-2.5 sm:w-2 bg-gray-300 dark:bg-gray-600"
              }`}
              aria-label={`Vai al video ${index + 1}`}
            />
          ))}
        </div>

        {/* Controlli mobile - Frecce grandi sotto il video */}
        <div className="flex sm:hidden justify-center gap-3 mt-4">
          <Button
            variant="outline"
            onClick={scrollPrev}
            className="h-12 w-12 rounded-full"
            size="icon"
          >
            <ChevronLeft className="h-6 w-6" />
          </Button>
          <Button
            variant="outline"
            onClick={scrollNext}
            className="h-12 w-12 rounded-full"
            size="icon"
          >
            <ChevronRight className="h-6 w-6" />
          </Button>
        </div>
      </div>
    </div>
  );
}
