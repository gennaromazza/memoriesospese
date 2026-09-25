import React from 'react';
import { Check } from 'lucide-react';
import { GALLERY_HEADER_THEMES, getThemeById, type GalleryHeaderThemeId } from '../../../../../lib/shared-src/gallery-header-themes';

interface CoverStylePickerProps {
  value: string;
  onChange: (theme: GalleryHeaderThemeId) => void;
  coverUrl?: string;
  galleryName: string;
  eventDate?: string;
  location?: string;
}

export function CoverStylePicker({
  value, onChange, coverUrl, galleryName, eventDate, location,
}: CoverStylePickerProps) {
  const selected = getThemeById(value);
  const meta = [eventDate, location].filter(Boolean).join(' · ') || 'Data e luogo dell’evento';

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium">Stile copertina</p>
        <p className="mt-1 text-xs text-muted-foreground">Scegli uno dei temi condivisi con la versione web.</p>
      </div>
      <div role="radiogroup" aria-label="Stile copertina" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {GALLERY_HEADER_THEMES.map(theme => (
          <button
            key={theme.id}
            type="button"
            role="radio"
            aria-checked={selected.id === theme.id}
            onClick={() => onChange(theme.id)}
            className={`relative h-24 overflow-hidden rounded-lg border-2 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              selected.id === theme.id ? 'border-primary ring-2 ring-primary/25' : 'border-border hover:border-primary/50'
            }`}
          >
            <span className="absolute inset-0 flex">
              {theme.previewColors.map((color, index) => (
                <span key={`${theme.id}-${index}`} className="h-full flex-1" style={{ backgroundColor: color }} />
              ))}
            </span>
            <span className="absolute inset-0 bg-gradient-to-t from-black/80 to-black/5" />
            <span className="absolute bottom-0 left-0 right-0 px-2 pb-2">
              <span className="block text-xs font-semibold text-white">{theme.nome}</span>
              <span className="mt-0.5 line-clamp-2 block text-[10px] leading-tight text-white/75">{theme.descrizione}</span>
            </span>
            {selected.id === theme.id && (
              <span className="absolute right-2 top-2 rounded-full bg-primary p-1 shadow" aria-hidden="true">
                <Check className="h-3 w-3 text-primary-foreground" />
              </span>
            )}
          </button>
        ))}
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Anteprima</p>
        <div
          className="relative flex aspect-video max-w-2xl items-end justify-center overflow-hidden rounded-lg border bg-neutral-900 p-4 text-center sm:p-8"
          aria-label={`Anteprima stile ${selected.nome}`}
        >
          {coverUrl && <img src={coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />}
          <div className="absolute inset-0" style={{ background: selected.gradient }} />
          <div className="relative z-10 max-w-full">
            {selected.labelText && (
              <p className="mb-2 text-[9px] uppercase tracking-[0.18em] sm:text-xs" style={{ color: selected.titleStyle.color, opacity: selected.labelOpacity }}>
                {selected.labelText}
              </p>
            )}
            <h3 className="truncate text-lg sm:text-3xl" style={selected.titleStyle}>{galleryName || 'Nome galleria'}</h3>
            {selected.separator !== 'none' && (
              <div className="mx-auto my-2 h-px w-10 sm:my-3 sm:w-16" style={{ backgroundColor: selected.separatorColor }} />
            )}
            <p className="truncate text-[10px] sm:text-sm" style={selected.metaStyle}>{meta}</p>
          </div>
        </div>
      </div>
    </div>
  );
}