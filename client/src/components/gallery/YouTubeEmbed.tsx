import { useState, useCallback } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "../ui/button";

interface YouTubeEmbedProps {
  videoUrl?: string; // Retrocompatibilità
  videoUrls?: string[]; // Nuovo: array di URL
}

// Funzione per estrarre l'ID del video da un URL di YouTube
function getYouTubeVideoId(url: string): string {
  try {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : "";
  } catch (error) {
    return "";
  }
}

export default function YouTubeEmbed({ videoUrl, videoUrls }: YouTubeEmbedProps) {
  // Retrocompatibilità: se c'è videoUrl singolo ma non videoUrls, usa quello
  const urls = videoUrls && videoUrls.length > 0 
    ? videoUrls 
    : videoUrl && videoUrl.trim() !== "" 
    ? [videoUrl] 
    : [];

  // Filtra URL validi
  const validUrls = urls.filter(url => getYouTubeVideoId(url));

  if (validUrls.length === 0) {
    return null;
  }

  // Se c'è solo un video, mostra senza slider
  if (validUrls.length === 1) {
    const videoId = getYouTubeVideoId(validUrls[0]);
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-8 mt-6">
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm">
          <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Video del matrimonio</h3>
          <div className="relative w-full pb-[56.25%]">
            <iframe 
              src={`https://www.youtube.com/embed/${videoId}`}
              title="Video del matrimonio"
              className="absolute top-0 left-0 w-full h-full rounded-lg"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            ></iframe>
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
      emblaApi.on('select', onSelect);
      onSelect();
    }
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-8 mt-6">
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Video del matrimonio</h3>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {selectedIndex + 1} / {videoUrls.length}
            </span>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={scrollPrev}
                className="h-8 w-8 p-0"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={scrollNext}
                className="h-8 w-8 p-0"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        <div className="overflow-hidden" ref={emblaRef}>
          <div className="flex">
            {videoUrls.map((url, index) => {
              const videoId = getYouTubeVideoId(url);
              return (
                <div key={index} className="flex-[0_0_100%] min-w-0">
                  <div className="relative w-full pb-[56.25%]">
                    <iframe 
                      src={`https://www.youtube.com/embed/${videoId}`}
                      title={`Video del matrimonio ${index + 1}`}
                      className="absolute top-0 left-0 w-full h-full rounded-lg"
                      frameBorder="0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    ></iframe>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Indicatori */}
        <div className="flex justify-center gap-2 mt-4">
          {videoUrls.map((_, index) => (
            <button
              key={index}
              onClick={() => emblaApi?.scrollTo(index)}
              className={`h-2 rounded-full transition-all ${
                index === selectedIndex 
                  ? 'w-8 bg-terracotta-600' 
                  : 'w-2 bg-gray-300 dark:bg-gray-600'
              }`}
              aria-label={`Vai al video ${index + 1}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
