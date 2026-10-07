/**
 * GalleryHeaderOverlay
 * Renderizza l'overlay con nome, data e location sopra la foto di copertina.
 * Template-driven: il look dipende interamente dal GalleryHeaderTheme selezionato.
 * Componente puro — non ha stato, non fa fetch, non dipende da Gallery.tsx.
 */

import { getThemeById, type GalleryHeaderThemeId } from '@/lib/gallery-header-themes';

interface GalleryHeaderOverlayProps {
  name: string;
  date: string;
  location?: string;
  themeId?: GalleryHeaderThemeId | string | null;
}

function DiamondSeparator({ color }: { color: string }) {
  return (
    <div className="flex items-center gap-2 sm:gap-3 my-3 sm:my-4">
      <div className="h-px w-8 sm:w-12" style={{ background: `linear-gradient(to right, transparent, ${color})` }} />
      <svg width="10" height="10" viewBox="0 0 10 10">
        <rect x="2.5" y="2.5" width="5" height="5" rx="0.5" fill={color} transform="rotate(45 5 5)" />
      </svg>
      <div className="h-px w-8 sm:w-12" style={{ background: `linear-gradient(to left, transparent, ${color})` }} />
    </div>
  );
}

function StarsSeparator({ color }: { color: string }) {
  return (
    <div className="flex items-center gap-3 sm:gap-4 my-3 sm:my-4">
      <div className="h-px w-6 sm:w-10" style={{ background: `linear-gradient(to right, transparent, ${color})` }} />
      <span style={{ color, fontSize: '10px', letterSpacing: '0.4em', opacity: 0.9 }}>✦ ✦ ✦</span>
      <div className="h-px w-6 sm:w-10" style={{ background: `linear-gradient(to left, transparent, ${color})` }} />
    </div>
  );
}

function FloralSeparator({ color }: { color: string }) {
  return (
    <div className="flex items-center gap-2 sm:gap-3 my-3 sm:my-4">
      <div className="h-px w-8 sm:w-12" style={{ background: `linear-gradient(to right, transparent, ${color})` }} />
      <svg width="20" height="12" viewBox="0 0 20 12" style={{ opacity: 0.8 }}>
        <path d="M10 6 C7 2, 2 2, 2 6 C2 10, 7 10, 10 6 Z" fill={color} />
        <path d="M10 6 C13 2, 18 2, 18 6 C18 10, 13 10, 10 6 Z" fill={color} />
        <circle cx="10" cy="6" r="1.5" fill={color} />
      </svg>
      <div className="h-px w-8 sm:w-12" style={{ background: `linear-gradient(to left, transparent, ${color})` }} />
    </div>
  );
}

function LineSeparator({ color }: { color: string }) {
  return (
    <div className="flex items-center justify-center my-3 sm:my-4 w-full">
      <div className="h-px w-16 sm:w-24" style={{ backgroundColor: color }} />
    </div>
  );
}

export default function GalleryHeaderOverlay({ name, date, location, themeId }: GalleryHeaderOverlayProps) {
  const theme = getThemeById(themeId);

  return (
    <div
      className="absolute inset-0 pointer-events-none flex flex-col justify-end"
      style={{ background: theme.gradient }}
    >
      <div
        className="flex flex-col items-center w-full px-6"
        style={{ paddingBottom: theme.paddingBottom, alignItems: theme.align === 'left' ? 'flex-start' : 'center', paddingLeft: theme.align === 'left' ? '2rem' : '1.5rem' }}
      >

        {/* Etichetta decorativa (opzionale) */}
        {theme.labelText && (
          <div className="flex items-center gap-3 mb-3 sm:mb-4 w-full justify-center">
            <div
              className="h-px flex-1 max-w-[60px] sm:max-w-[90px]"
              style={{ background: `linear-gradient(to right, transparent, ${theme.lineColor.replace(/[\d.]+\)$/, '0.45)').replace('rgba', 'rgba')})` }}
            />
            <span
              className="text-[9px] sm:text-[10px] uppercase font-light select-none"
              style={{
                fontFamily: "'Playfair Display', serif",
                letterSpacing: '0.35em',
                color: theme.lineColor,
                opacity: theme.labelOpacity,
              }}
            >
              {theme.labelText}
            </span>
            <div
              className="h-px flex-1 max-w-[60px] sm:max-w-[90px]"
              style={{ background: `linear-gradient(to left, transparent, ${theme.lineColor.replace(/[\d.]+\)$/, '0.45)').replace('rgba', 'rgba')})` }}
            />
          </div>
        )}

        {/* Nome principale */}
        <h1
          className={`font-playfair text-center ${theme.titleClass}`}
          style={theme.titleStyle}
        >
          {name}
        </h1>

        {/* Separatore */}
        {theme.separator === 'diamond' && <DiamondSeparator color={theme.separatorColor} />}
        {theme.separator === 'stars' && <StarsSeparator color={theme.separatorColor} />}
        {theme.separator === 'floral' && <FloralSeparator color={theme.separatorColor} />}
        {theme.separator === 'line' && <LineSeparator color={theme.separatorColor} />}

        {/* Data e location */}
        <div className="text-center" style={theme.metaStyle}>
          <span>{date}</span>
          {location && (
            <>
              <span className="mx-2" style={{ opacity: 0.4, fontStyle: 'normal' }}>·</span>
              <span>{location}</span>
            </>
          )}
        </div>

      </div>
    </div>
  );
}
