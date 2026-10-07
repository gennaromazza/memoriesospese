import { POLAROID_FRAME } from '@shared/print-shop-catalog';
import type { LocalPrintPhoto, PrintComposition } from './types';

export const DEFAULT_POLAROID_COMPOSITION: PrintComposition = { version: 1, x: 0.5, y: 0.5, zoom: 1 };

export function clampComposition(value: PrintComposition): PrintComposition {
  return {
    version: 1,
    x: Math.max(0, Math.min(1, value.x)),
    y: Math.max(0, Math.min(1, value.y)),
    zoom: Math.max(1, Math.min(4, value.zoom)),
  };
}

/** x/y identify the normalized source pixel at the center of the print window. */
export function polaroidCropStyle(
  photo: Pick<LocalPrintPhoto, 'widthPx' | 'heightPx'>,
  composition: PrintComposition,
): React.CSSProperties {
  const windowRatio = POLAROID_FRAME.imageWidthMm / POLAROID_FRAME.imageHeightMm;
  const sourceRatio = photo.widthPx / Math.max(1, photo.heightPx);
  const baseScale = sourceRatio > windowRatio
    ? POLAROID_FRAME.imageHeightMm / Math.max(1, photo.heightPx)
    : POLAROID_FRAME.imageWidthMm / Math.max(1, photo.widthPx);
  const renderedWidth = photo.widthPx * baseScale * composition.zoom;
  const renderedHeight = photo.heightPx * baseScale * composition.zoom;
  const windowWidth = POLAROID_FRAME.imageWidthMm;
  const windowHeight = POLAROID_FRAME.imageHeightMm;
  const left = Math.min(0, Math.max(windowWidth - renderedWidth, windowWidth / 2 - renderedWidth * composition.x));
  const top = Math.min(0, Math.max(windowHeight - renderedHeight, windowHeight / 2 - renderedHeight * composition.y));
  return {
    width: `${renderedWidth / windowWidth * 100}%`,
    height: `${renderedHeight / windowHeight * 100}%`,
    left: `${left / windowWidth * 100}%`,
    top: `${top / windowHeight * 100}%`,
  };
}

/** Drag distance measured inside the image window, matching the print crop. */
export function movePolaroidComposition(
  photo: Pick<LocalPrintPhoto, 'widthPx' | 'heightPx'>,
  current: PrintComposition,
  dx: number,
  dy: number,
  windowWidthPx: number,
  windowHeightPx: number,
): PrintComposition {
  if (windowWidthPx <= 0 || windowHeightPx <= 0) return current;
  const windowRatio = POLAROID_FRAME.imageWidthMm / POLAROID_FRAME.imageHeightMm;
  const sourceRatio = photo.widthPx / Math.max(1, photo.heightPx);
  const scale = sourceRatio > windowRatio
    ? POLAROID_FRAME.imageHeightMm / Math.max(1, photo.heightPx)
    : POLAROID_FRAME.imageWidthMm / Math.max(1, photo.widthPx);
  const widthFactor = photo.widthPx * scale * current.zoom / POLAROID_FRAME.imageWidthMm;
  const heightFactor = photo.heightPx * scale * current.zoom / POLAROID_FRAME.imageHeightMm;
  return clampComposition({
    ...current,
    x: current.x - dx / windowWidthPx / widthFactor,
    y: current.y - dy / windowHeightPx / heightFactor,
  });
}