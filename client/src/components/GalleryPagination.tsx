import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { PhotoData } from '@/hooks/use-gallery-data';

interface GalleryPaginationProps {
  photos: PhotoData[];
  itemsPerPage: number;
  onItemClick: (index: number) => void;
  loadMorePhotos: () => void;
  isLoading: boolean;
  hasMore: boolean;
  totalCount?: number;
}

const GalleryPagination: React.FC<GalleryPaginationProps> = ({
  photos,
  itemsPerPage,
  onItemClick,
  loadMorePhotos,
  isLoading,
  hasMore,
  totalCount
}) => {
  const [renderedItems, setRenderedItems] = useState(Math.min(photos.length, itemsPerPage));
  
  // Calcola la percentuale di foto mostrate rispetto al totale
  const percentageLoaded = totalCount ? Math.round((photos.length / totalCount) * 100) : 0;
  
  // Foto attualmente visualizzate
  const visiblePhotos = photos.slice(0, renderedItems);
  
  // Funzione per mostrare più foto già caricate (renderizzazione progressiva)
  const showMoreItems = () => {
    setRenderedItems(prev => Math.min(prev + itemsPerPage, photos.length));
  };
  
  // Determina se ci sono più foto già caricate ma non ancora visualizzate
  const hasMoreToRender = renderedItems < photos.length;
  
  // Funzione per caricare più foto da Firebase e poi mostrarle
  const handleLoadMore = () => {
    if (hasMoreToRender) {
      // Se abbiamo già altre foto caricate ma non visualizzate, mostriamole
      showMoreItems();
    } else if (hasMore && !isLoading) {
      // Altrimenti carichiamo altre foto da Firebase
      loadMorePhotos();
    }
  };
  
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-4 lg:gap-6">
        {visiblePhotos.map((photo, index) => (
          <div
            key={photo.id}
            className="gallery-image h-40 sm:h-52 lg:h-64 relative"
            onClick={() => onItemClick(index)}
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
        ))}
      </div>
      
      {/* Informazioni sul caricamento e pulsante "Mostra altre foto" */}
      <div className="flex flex-col items-center space-y-2 py-4">
        {totalCount && photos.length > 0 && (
          <div className="text-sm text-gray-500 mb-2">
            Mostrate {renderedItems} di {photos.length} foto caricate ({percentageLoaded}% del totale)
          </div>
        )}
        
        {(hasMoreToRender || hasMore) && (
          <Button
            onClick={handleLoadMore}
            disabled={isLoading && !hasMoreToRender}
            className="px-6"
            variant="secondary"
          >
            {isLoading && !hasMoreToRender ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Caricamento in corso...
              </>
            ) : (
              hasMoreToRender ? 'Mostra altre foto' : 'Carica altre foto'
            )}
          </Button>
        )}
      </div>
    </div>
  );
};

export default GalleryPagination;