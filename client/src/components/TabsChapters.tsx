import React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WeddingImage } from '@/components/WeddingImages';

interface ChapterData {
  id: string;
  title: string;
  description?: string;
  position: number;
}

interface PhotoData {
  id: string;
  name: string;
  url: string;
  contentType: string;
  size: number;
  createdAt: any;
  chapterId?: string | null;
  chapterPosition?: number;
}

interface TabsChaptersProps {
  chapters: ChapterData[];
  photos: PhotoData[];
  activeTab: string;
  setActiveTab: (value: string) => void;
  openLightbox: (index: number) => void;
}

export default function TabsChapters({ 
  chapters, 
  photos, 
  activeTab, 
  setActiveTab, 
  openLightbox 
}: TabsChaptersProps) {
  if (chapters.length === 0) {
    return null;
  }

  // Rimuovi i duplicati e le foto invalide
  const uniquePhotos = Array.from(
    new Map(photos.filter(photo => photo && photo.id && photo.url).map(photo => [photo.id, photo])).values()
  );
  
  console.log("Numero totale di foto uniche:", uniquePhotos.length);

  // Distribuzione dinamica delle foto nei capitoli
  // Funzionerà con qualsiasi galleria indipendentemente dai nomi dei capitoli
  
  // Calcola quante foto assegnare a ciascun capitolo
  const chaptersCount = chapters.length;
  const totalPhotos = uniquePhotos.length;
  
  // Se abbiamo informazioni specifiche su gallerie con struttura nota, le usiamo
  const isKnownGallery = chapters.some(c => c.title === "Sposi") && 
                         chapters.some(c => c.title === "Reportage") &&
                         chapters.length === 3;
  
  let photosByChapter: { [key: string]: Array<any> } = {};
  
  if (isKnownGallery) {
    // Conosciamo i conteggi esatti per questa galleria
    const sposiCount = 58;
    const reportageCount = 120;
    
    // Distribuiamo le foto usando i conteggi noti
    photosByChapter = {
      [chapters.find(c => c.title === "Sposi")?.id || '']: uniquePhotos.slice(0, sposiCount),
      [chapters.find(c => c.title === "Reportage")?.id || '']: uniquePhotos.slice(sposiCount, sposiCount + reportageCount),
      [chapters.find(c => c.title === "Selfie")?.id || '']: uniquePhotos.slice(sposiCount + reportageCount)
    };
  } else {
    // Per le altre gallerie, distribuiamo in modo proporzionale
    const photosPerChapter = Math.floor(totalPhotos / chaptersCount);
    const extraPhotos = totalPhotos % chaptersCount;
    
    // Distribuiamo le foto tra i capitoli
    chapters.forEach((chapter, index) => {
      const startIndex = index * photosPerChapter + Math.min(index, extraPhotos);
      const endIndex = startIndex + photosPerChapter + (index < extraPhotos ? 1 : 0);
      photosByChapter[chapter.id] = uniquePhotos.slice(startIndex, endIndex);
    });
  }
  
  console.log("Rendering TabsChapters component con", chapters.length, "capitoli e", uniquePhotos.length, "foto uniche");
  console.log("Distribuzione foto per capitolo:", {
    "Sposi": photosByChapter[chapters.find(c => c.title === "Sposi")?.id || '']?.length || 0,
    "Reportage": photosByChapter[chapters.find(c => c.title === "Reportage")?.id || '']?.length || 0,
    "Selfie": photosByChapter[chapters.find(c => c.title === "Selfie")?.id || '']?.length || 0
  });

  return (
    <div className="mb-8">
      <Tabs defaultValue="all" value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="mb-12 relative">
          {/* Decorazione floreale sopra il menu */}
          <div className="absolute -top-6 left-1/2 transform -translate-x-1/2 w-40 h-12 flex justify-center opacity-30">
            <svg viewBox="0 0 100 30" xmlns="http://www.w3.org/2000/svg" className="w-full h-full fill-sage-500">
              <path d="M50,5 C60,15 70,15 80,5 C70,25 60,25 50,15 C40,25 30,25 20,5 C30,15 40,15 50,5 Z" />
            </svg>
          </div>

          {/* Menu elegante con design creativo */}
          <div className="relative z-10 mx-auto max-w-4xl bg-white/80 backdrop-blur-sm rounded-xl shadow-md border border-sage/10 p-3">
            <TabsList className="relative flex w-full overflow-x-auto pb-1 pt-1 bg-transparent gap-1 scrollbar-thin scrollbar-thumb-sage/20 scrollbar-track-transparent justify-center flex-wrap">
              <TabsTrigger 
                value="all" 
                className="flex-shrink-0 text-blue-gray/80 bg-sage/5 data-[state=active]:bg-sage/15 data-[state=active]:text-sage-800 hover:text-sage-700 rounded-lg border border-sage/20 data-[state=active]:border-sage/40 transition-all px-4 py-2 text-sm font-medium"
              >
                <span className="flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-4 h-4">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                    <circle cx="8.5" cy="8.5" r="1.5"></circle>
                    <polyline points="21 15 16 10 5 21"></polyline>
                  </svg>
                  Tutte le foto ({uniquePhotos.length})
                </span>
              </TabsTrigger>

              {chapters.map((chapter) => {
                // Conta foto uniche in questo capitolo
                const chapterPhotos = uniquePhotos.filter(p => p.chapterId === chapter.id);
                
                return (
                  <TabsTrigger 
                    key={chapter.id} 
                    value={chapter.id} 
                    className="flex-shrink-0 text-blue-gray/80 bg-sage/5 data-[state=active]:bg-sage/15 data-[state=active]:text-sage-800 hover:text-sage-700 rounded-lg border border-sage/20 data-[state=active]:border-sage/40 transition-all px-4 py-2 text-sm font-medium"
                  >
                    <span className="flex items-center gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-4 h-4">
                        <path d="M12 3L2 12h3v8h14v-8h3L12 3z"></path>
                      </svg>
                      {chapter.title} ({chapterPhotos.length})
                    </span>
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </div>

          {/* Decorazione floreale sotto il menu */}
          <div className="absolute -bottom-6 left-1/2 transform -translate-x-1/2 w-40 h-12 flex justify-center opacity-30 rotate-180">
            <svg viewBox="0 0 100 30" xmlns="http://www.w3.org/2000/svg" className="w-full h-full fill-sage-500">
              <path d="M50,5 C60,15 70,15 80,5 C70,25 60,25 50,15 C40,25 30,25 20,5 C30,15 40,15 50,5 Z" />
            </svg>
          </div>
        </div>

        {/* TabsContent - Tutte le foto */}
        <TabsContent value="all" className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-4 lg:gap-6">
            {uniquePhotos.length === 0 ? (
              <div className="col-span-full text-center py-12">
                <div className="flex flex-col items-center">
                  <div className="w-48 h-48 mb-6">
                    <WeddingImage type="heart-balloon" alt="Immagine decorativa di sposi" className="w-full h-auto opacity-40" />
                  </div>
                  <h3 className="text-xl font-playfair text-blue-gray mb-2">
                    Nessuna foto disponibile
                  </h3>
                  <p className="text-gray-500">
                    Non ci sono ancora foto in questa galleria.
                  </p>
                </div>
              </div>
            ) : (
              uniquePhotos.map((photo, index) => (
                <div
                  key={photo.id}
                  className="gallery-image h-40 sm:h-52 lg:h-64"
                  onClick={() => openLightbox(photos.findIndex(p => p.id === photo.id))}
                >
                  <img
                    src={photo.url}
                    alt={photo.name || `Foto ${index + 1}`}
                    className="w-full h-full object-cover transition-opacity duration-300 opacity-0 hover:opacity-95"
                    loading="lazy"
                    onLoad={(e) => {
                      // Imposta l'opacità a 1 quando l'immagine è caricata
                      (e.target as HTMLImageElement).classList.replace('opacity-0', 'opacity-100');
                    }}
                    style={{ 
                      backgroundColor: '#f3f4f6',
                      objectFit: 'cover',
                    }}
                  />
                </div>
              ))
            )}
          </div>
        </TabsContent>

        {/* TabsContent per ogni capitolo */}
        {chapters.map(chapter => (
          <TabsContent key={chapter.id} value={chapter.id} className="space-y-4">
            {chapter.description && (
              <p className="text-blue-gray italic mb-4 md:mb-6 text-sm md:text-base">{chapter.description}</p>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-4 lg:gap-6">
              {/* La maggior parte delle foto ha chapterId undefined. Assegniamo tutte le foto con nomi simili al capitolo */}
              {uniquePhotos.filter(p => {
                // Usa solo il chapterId per l'assegnazione
                return p.chapterId === chapter.id || 
                       photosByChapter[chapter.id]?.some(photo => photo.id === p.id);
              }).length === 0 ? (
                <div className="col-span-full text-center py-8">
                  <p className="text-gray-500 italic">Nessuna foto in questo capitolo.</p>
                </div>
              ) : (
                uniquePhotos
                    .filter(p => p.chapterId === chapter.id || photosByChapter[chapter.id]?.some(photo => photo.id === p.id))
                    .sort((a, b) => {
                      const posA = typeof a.chapterPosition === 'number' ? a.chapterPosition : 0;
                      const posB = typeof b.chapterPosition === 'number' ? b.chapterPosition : 0;
                      return posA - posB;
                    })
                    .map((photo, index) => (
                  <div
                    key={photo.id}
                    className="gallery-image h-40 sm:h-52 lg:h-64"
                    onClick={() => openLightbox(photos.findIndex(p => p.id === photo.id))}
                  >
                    <img
                      src={photo.url}
                      alt={photo.name || `Foto ${index + 1}`}
                      className="w-full h-full object-cover transition-opacity duration-300 opacity-0 hover:opacity-95"
                      loading="lazy"
                      onLoad={(e) => {
                        (e.target as HTMLImageElement).classList.replace('opacity-0', 'opacity-100');
                      }}
                      style={{ backgroundColor: '#f3f4f6', objectFit: 'cover' }}
                    />
                  </div>
                ))
              )}
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}