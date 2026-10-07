import type { PointerEvent as ReactPointerEvent } from 'react';
import type { EditorialCoverPosition, EditorialCoverPositions } from '@shared/editorial-cover';

type PositionKey = keyof EditorialCoverPositions;

const MODES: Array<{
  key: PositionKey;
  label: string;
  hint: string;
  frameClass: string;
}> = [
  { key: 'coverImagePosition', label: 'Hero desktop', hint: 'Pagina articolo', frameClass: 'aspect-[3.6/1]' },
  { key: 'coverImageMobilePosition', label: 'Hero smartphone', hint: 'Pagina articolo', frameClass: 'mx-auto max-w-[280px] aspect-[5/6]' },
  { key: 'coverImageCardPosition', label: 'Card desktop', hint: 'Home e archivio', frameClass: 'aspect-[4/3]' },
  { key: 'coverImageCardMobilePosition', label: 'Card smartphone', hint: 'Home e archivio', frameClass: 'mx-auto max-w-[280px] aspect-[4/3]' },
];

const DEFAULT_POSITION: EditorialCoverPosition = { x: 50, y: 50 };

interface Props {
  imageUrl: string;
  alt?: string;
  positions: EditorialCoverPositions;
  onChange: (key: PositionKey, position: EditorialCoverPosition) => void;
}

export default function EditorialCoverPositionEditor({ imageUrl, alt, positions, onChange }: Props) {
  const updatePosition = (event: ReactPointerEvent<HTMLDivElement>, key: PositionKey) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    onChange(key, {
      x: Math.round(Math.max(0, Math.min(100, ((event.clientX - bounds.left) / bounds.width) * 100))),
      y: Math.round(Math.max(0, Math.min(100, ((event.clientY - bounds.top) / bounds.height) * 100))),
    });
  };

  return (
    <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
      <div>
        <p className="text-sm font-medium">Centra la copertina per ogni dispositivo</p>
        <p className="text-xs text-muted-foreground">
          Clicca sull’area da mantenere visibile. Le posizioni di hero e card sono indipendenti.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {MODES.map(mode => {
          const position = positions[mode.key] || DEFAULT_POSITION;
          return (
            <div key={mode.key} className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-medium">{mode.label}</span>
                <span className="text-[11px] text-muted-foreground">{mode.hint}</span>
              </div>
              <div
                className={`relative cursor-crosshair overflow-hidden rounded border bg-black ${mode.frameClass}`}
                onPointerDown={event => updatePosition(event, mode.key)}
                role="button"
                tabIndex={0}
                aria-label={`Centra copertina: ${mode.label}`}
                onKeyDown={event => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    const bounds = event.currentTarget.getBoundingClientRect();
                    onChange(mode.key, {
                      x: Math.round(Math.max(0, Math.min(100, ((bounds.width / 2) / bounds.width) * 100))),
                      y: Math.round(Math.max(0, Math.min(100, ((bounds.height / 2) / bounds.height) * 100))),
                    });
                  }
                }}
              >
                <img
                  src={imageUrl}
                  alt={alt || ''}
                  className="h-full w-full select-none object-cover"
                  style={{ objectPosition: `${position.x}% ${position.y}%` }}
                  draggable={false}
                />
                <span
                  className="pointer-events-none absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-black/20 shadow"
                  style={{ left: `${position.x}%`, top: `${position.y}%` }}
                  aria-hidden="true"
                />
              </div>
              <p className="text-[11px] text-muted-foreground">Punto {position.x}% × {position.y}%</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}