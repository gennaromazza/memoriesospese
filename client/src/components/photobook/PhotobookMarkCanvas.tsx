/**
 * Canvas di disegno per la revisione fotolibro "a penna".
 * Mostra la pagina JPEG con sopra le X già disegnate (inviate e bozze).
 * Su tutti i dispositivi il disegno va ATTIVATO con il pulsante matita
 * ("Segna una X"): finché non è attivo, il tocco scorre la pagina normalmente
 * (evita X accidentali da smartphone). Dopo il primo tratto compare la barra
 * Conferma/Cancella. Coordinate normalizzate 0–1 rispetto alla pagina.
 */

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Check, Eraser, PenLine, X as XIcon } from 'lucide-react';
import type { PhotobookMarkPoint } from '@shared/photobook-types';

export interface CanvasMark {
  color: string;
  strokes: PhotobookMarkPoint[][];
  /** Bozza (tratteggio leggermente diverso per distinguerla dalle inviate) */
  isDraft?: boolean;
}

interface Props {
  pageUrl: string;
  pageAlt: string;
  marks: CanvasMark[];
  /** Colore assegnato alla prossima X */
  nextColor: string;
  /** false per versioni precedenti (sola lettura) */
  drawingEnabled: boolean;
  /** Chiamato quando il cliente conferma la X disegnata */
  onMarkComplete: (strokes: PhotobookMarkPoint[][]) => void;
}

const MAX_STROKES = 4;
const MAX_POINTS = 600;
/** Distanza minima (normalizzata) tra due punti registrati */
const MIN_DIST = 0.004;
/** Dimensione minima (normalizzata) del tratto per non essere scartato come tocco accidentale */
const MIN_STROKE_SPAN = 0.02;
/** Margine (normalizzato) entro cui un nuovo tratto è considerato parte della stessa X */
const SAME_MARK_MARGIN = 0.06;

function strokePath(points: PhotobookMarkPoint[]): string {
  if (points.length === 0) return '';
  return points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${(p.x * 100).toFixed(2)},${(p.y * 100).toFixed(2)}`)
    .join(' ');
}

interface BBox { minX: number; maxX: number; minY: number; maxY: number }

function strokeBBox(points: PhotobookMarkPoint[]): BBox {
  let minX = 1, maxX = 0, minY = 1, maxY = 0;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, maxX, minY, maxY };
}

/** Estensione (bounding box) di un tratto, per scartare tocchi accidentali. */
function strokeSpan(points: PhotobookMarkPoint[]): number {
  const b = strokeBBox(points);
  return Math.max(b.maxX - b.minX, b.maxY - b.minY);
}

/**
 * True se il nuovo tratto appartiene alla stessa X dei tratti già disegnati
 * (bounding box che si toccano entro un margine). Un tratto lontano è una
 * seconda X su un'altra foto: va confermata prima quella in corso.
 */
function isSameMark(pending: PhotobookMarkPoint[][], stroke: PhotobookMarkPoint[]): boolean {
  if (pending.length === 0) return true;
  const s = strokeBBox(stroke);
  for (const p of pending) {
    const b = strokeBBox(p);
    const overlaps =
      s.minX <= b.maxX + SAME_MARK_MARGIN &&
      s.maxX >= b.minX - SAME_MARK_MARGIN &&
      s.minY <= b.maxY + SAME_MARK_MARGIN &&
      s.maxY >= b.minY - SAME_MARK_MARGIN;
    if (overlaps) return true;
  }
  return false;
}

export default function PhotobookMarkCanvas({
  pageUrl,
  pageAlt,
  marks,
  nextColor,
  drawingEnabled,
  onMarkComplete,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [penActive, setPenActive] = useState(false);
  const [pendingStrokes, setPendingStrokes] = useState<PhotobookMarkPoint[][]>([]);
  const [currentStroke, setCurrentStroke] = useState<PhotobookMarkPoint[] | null>(null);
  // Avviso transitorio: il cliente ha provato a segnare una seconda X senza confermare
  const [farStrokeHint, setFarStrokeHint] = useState(false);
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const drawingRef = useRef(false);
  // Copia in ref del tratto in corso: evita side effect annidati negli updater
  // di stato (in Strict Mode verrebbero eseguiti due volte)
  const currentStrokeRef = useRef<PhotobookMarkPoint[] | null>(null);
  // Puntatore che sta disegnando: ignora dita/penne aggiuntive (multi-touch)
  const activePointerIdRef = useRef<number | null>(null);

  const canDraw = drawingEnabled && penActive;

  const toNorm = (e: React.PointerEvent): PhotobookMarkPoint | null => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return null;
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!canDraw) return;
    if (drawingRef.current) return; // già in corso con un altro dito/puntatore
    if (pendingStrokes.length >= MAX_STROKES) return;
    const p = toNorm(e);
    if (!p) return;
    e.preventDefault();
    drawingRef.current = true;
    activePointerIdRef.current = e.pointerId;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    currentStrokeRef.current = [p];
    setCurrentStroke(currentStrokeRef.current);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drawingRef.current) return;
    if (e.pointerId !== activePointerIdRef.current) return;
    const p = toNorm(e);
    if (!p) return;
    e.preventDefault();
    const prev = currentStrokeRef.current;
    if (!prev) return;
    const last = prev[prev.length - 1];
    const dx = p.x - last.x;
    const dy = p.y - last.y;
    if (dx * dx + dy * dy < MIN_DIST * MIN_DIST) return;
    if (prev.length >= MAX_POINTS) return;
    currentStrokeRef.current = [...prev, p];
    setCurrentStroke(currentStrokeRef.current);
  };

  const endStroke = (e?: React.PointerEvent) => {
    if (!drawingRef.current) return;
    if (e && e.pointerId !== activePointerIdRef.current) return;
    drawingRef.current = false;
    activePointerIdRef.current = null;
    const stroke = currentStrokeRef.current;
    currentStrokeRef.current = null;
    setCurrentStroke(null);
    // Tratti troppo piccoli = tocco accidentale: vengono scartati
    if (!stroke || stroke.length < 2 || strokeSpan(stroke) < MIN_STROKE_SPAN) return;
    if (pendingStrokes.length >= MAX_STROKES) return;
    // Un tratto lontano dalla X in corso è una seconda X su un'altra foto:
    // va confermata prima quella già disegnata (una X = una foto = una richiesta)
    if (!isSameMark(pendingStrokes, stroke)) {
      if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
      setFarStrokeHint(true);
      hintTimerRef.current = setTimeout(() => setFarStrokeHint(false), 3000);
      return;
    }
    setPendingStrokes([...pendingStrokes, stroke]);
  };

  const confirmPending = () => {
    if (pendingStrokes.length === 0) return;
    onMarkComplete(pendingStrokes);
    setPendingStrokes([]);
    setPenActive(false);
  };

  const clearPending = () => {
    setPendingStrokes([]);
    setCurrentStroke(null);
    currentStrokeRef.current = null;
    drawingRef.current = false;
    activePointerIdRef.current = null;
    setFarStrokeHint(false);
    setPenActive(false);
  };

  // Reset completo se cambia la pagina o il permesso di disegno
  useEffect(() => {
    setPendingStrokes([]);
    setCurrentStroke(null);
    currentStrokeRef.current = null;
    drawingRef.current = false;
    activePointerIdRef.current = null;
    setFarStrokeHint(false);
    setPenActive(false);
  }, [pageUrl, drawingEnabled]);

  useEffect(
    () => () => {
      if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    },
    [],
  );

  const hasPending = pendingStrokes.length > 0 || !!currentStroke;

  return (
    <div className="space-y-2">
      <div
        ref={containerRef}
        className={`relative rounded-lg overflow-hidden border bg-white shadow-sm select-none ${
          canDraw ? 'touch-none cursor-crosshair ring-2 ring-offset-2' : ''
        }`}
        style={canDraw ? ({ ['--tw-ring-color' as any]: nextColor } as React.CSSProperties) : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endStroke}
        onPointerCancel={endStroke}
        onLostPointerCapture={endStroke}
      >
        <img
          src={pageUrl}
          alt={pageAlt}
          loading="lazy"
          className="w-full h-auto block pointer-events-none"
          draggable={false}
        />
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          {marks.map((m, mi) =>
            m.strokes.map((s, si) => (
              <path
                key={`m-${mi}-${si}`}
                d={strokePath(s)}
                fill="none"
                stroke={m.color}
                strokeWidth={3.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={m.isDraft ? '6 4' : undefined}
                opacity={m.isDraft ? 0.9 : 0.85}
                vectorEffect="non-scaling-stroke"
              />
            )),
          )}
          {pendingStrokes.map((s, si) => (
            <path
              key={`p-${si}`}
              d={strokePath(s)}
              fill="none"
              stroke={nextColor}
              strokeWidth={4}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {currentStroke && (
            <path
              d={strokePath(currentStroke)}
              fill="none"
              stroke={nextColor}
              strokeWidth={4}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>

        {/* Pulsante attivazione penna: finché non è attivo, il tocco scorre la pagina */}
        {drawingEnabled && !penActive && (
          <button
            type="button"
            onClick={() => setPenActive(true)}
            className="absolute top-2 right-2 flex items-center gap-1.5 bg-white/90 backdrop-blur-sm rounded-full pl-2.5 pr-3 py-1.5 text-xs font-medium text-stone-700 shadow-md border active:scale-95 transition-transform"
            data-testid="button-activate-pen"
          >
            <PenLine className="h-4 w-4" style={{ color: nextColor }} />
            Segna una X
          </button>
        )}
        {farStrokeHint && (
          <div
            className="absolute inset-x-2 bottom-2 bg-amber-50/95 backdrop-blur-sm border border-amber-300 text-amber-900 rounded-md px-3 py-2 text-xs font-medium shadow-md text-center"
            data-testid="hint-far-stroke"
          >
            Hai già disegnato una X: confermala prima di segnarne un'altra.
            Ogni X corrisponde a una sola foto.
          </div>
        )}
        {canDraw && !hasPending && (
          <>
            <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-white/90 backdrop-blur-sm rounded-full px-2.5 py-1 text-xs text-stone-600 shadow-sm pointer-events-none">
              <PenLine className="h-3.5 w-3.5" style={{ color: nextColor }} />
              Disegna la X con il dito
            </div>
            <button
              type="button"
              onClick={clearPending}
              className="absolute top-2 right-2 flex items-center justify-center bg-white/90 backdrop-blur-sm rounded-full w-7 h-7 text-stone-500 shadow-md border"
              title="Esci dalla modalità disegno"
              data-testid="button-deactivate-pen"
            >
              <XIcon className="h-4 w-4" />
            </button>
          </>
        )}
      </div>

      {hasPending && (
        <div className="flex items-center gap-2 justify-end">
          <span
            className="inline-block w-3 h-3 rounded-full border shrink-0"
            style={{ backgroundColor: nextColor }}
          />
          <span className="text-xs text-muted-foreground mr-auto">
            X disegnata: confermala per scegliere cosa richiedere
          </span>
          <Button size="sm" variant="outline" onClick={clearPending} data-testid="button-clear-mark">
            <Eraser className="h-3.5 w-3.5 mr-1.5" />
            Cancella
          </Button>
          <Button
            size="sm"
            disabled={pendingStrokes.length === 0}
            onClick={confirmPending}
            data-testid="button-confirm-mark"
          >
            <Check className="h-3.5 w-3.5 mr-1.5" />
            Conferma X
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * Genera lo snapshot JPEG di una pagina con le X disegnate sopra.
 * Richiede che l'immagine sia servita con CORS (i download URL di Firebase
 * Storage lo sono). Il lato lungo viene limitato a 2000px.
 */
export async function generatePageSnapshot(
  pageUrl: string,
  marks: CanvasMark[],
): Promise<Blob> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.crossOrigin = 'anonymous';
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Immagine pagina non caricabile per lo snapshot'));
    el.src = pageUrl;
  });

  const maxSide = 2000;
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas non disponibile');
  ctx.drawImage(img, 0, 0, w, h);

  const lineWidth = Math.max(4, Math.round(Math.min(w, h) * 0.006));
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = lineWidth;
  for (const mark of marks) {
    ctx.strokeStyle = mark.color;
    for (const stroke of mark.strokes) {
      if (stroke.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(stroke[0].x * w, stroke[0].y * h);
      for (let i = 1; i < stroke.length; i++) {
        ctx.lineTo(stroke[i].x * w, stroke[i].y * h);
      }
      ctx.stroke();
    }
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Generazione snapshot fallita'))),
      'image/jpeg',
      0.85,
    );
  });
}