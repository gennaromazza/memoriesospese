import { useMemo, useState } from 'react';

type GalleryPhoto = { id: string; name?: string; url: string; thumbnailUrl?: string | null; chapterId?: string | null };
type GalleryChapter = { id: string; titolo: string };

interface Props {
  photos: GalleryPhoto[];
  chapters: GalleryChapter[];
  disabled?: boolean;
  /** Foto già scelta (mostra la spunta). */
  selectedId?: string | null;
  onPick: (photo: GalleryPhoto) => void;
}

/**
 * Galleria del cliente dentro lo slide (telefono): capitoli come filtri, miniature a tre colonne.
 * Usa le classi dello standard telefono (public/mockups/phone-ui.css), caricato nel visualizzatore.
 */
export default function PhotobookInlineGallery({ photos, chapters, disabled, selectedId, onPick }: Props) {
  const [chapter, setChapter] = useState('');
  const used = useMemo(() => chapters.filter(c => photos.some(p => p.chapterId === c.id)), [chapters, photos]);
  const visible = chapter ? photos.filter(p => p.chapterId === chapter) : photos;
  return <div className="mq-gallery">
    {used.length > 0 && <div className="mq-chips" role="group" aria-label="Capitoli della galleria">
      {[{ id: '', titolo: 'Tutte' }, ...used].map(c => <button key={c.id || 'all'} type="button" aria-pressed={chapter === c.id} onClick={() => setChapter(c.id)}>{c.titolo}</button>)}
    </div>}
    <div className="mq-thumbs">
      {visible.map(photo => <button
        key={photo.id}
        type="button"
        aria-label={photo.name || 'Foto'}
        aria-pressed={selectedId === photo.id}
        disabled={disabled}
        style={{ backgroundImage: `url("${String(photo.thumbnailUrl || photo.url).replace(/"/g, '%22')}")` }}
        onClick={() => onPick(photo)}
      />)}
      {!photos.length && <p>Caricamento della galleria…</p>}
    </div>
  </div>;
}
