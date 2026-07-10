/**
 * Dialog di selezione foto dalla galleria (riutilizzato da editor admin e pagina cliente).
 */

import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';
import type { PhotobookGalleryPhoto } from '@shared/photobook-types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  photos: PhotobookGalleryPhoto[];
  title?: string;
  onSelect: (photo: PhotobookGalleryPhoto) => void;
  /** Id foto da evidenziare come attuale */
  currentPhotoId?: string | null;
}

export default function PhotobookPhotoPicker({
  open,
  onOpenChange,
  photos,
  title = 'Scegli una foto',
  onSelect,
  currentPhotoId,
}: Props) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return photos;
    return photos.filter((p) => p.name.toLowerCase().includes(q));
  }, [photos, search]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {photos.length} foto disponibili nella galleria
          </DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cerca per nome file..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-photo-search"
          />
        </div>
        <div className="overflow-y-auto flex-1 mt-2">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nessuna foto trovata
            </p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
              {filtered.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    onSelect(p);
                    onOpenChange(false);
                  }}
                  className={`group relative aspect-square rounded-md overflow-hidden border-2 transition-colors ${
                    currentPhotoId === p.id
                      ? 'border-primary ring-2 ring-primary/40'
                      : 'border-transparent hover:border-primary/60'
                  }`}
                  data-testid={`button-pick-photo-${p.id}`}
                >
                  <img
                    src={p.thumbnailUrl || p.url}
                    alt={p.name}
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />
                  <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] px-1 py-0.5 truncate opacity-0 group-hover:opacity-100 transition-opacity">
                    {p.name}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
