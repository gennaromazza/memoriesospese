import { describe, expect, it } from 'vitest';
import { POLAROID_FRAME } from '@shared/print-shop-catalog';
import { polaroidCropStyle } from './PrintGroupEditor';
import { DEFAULT_POLAROID_COMPOSITION, movePolaroidComposition } from './polaroid-crop';

describe('Polaroid crop preview', () => {
  it('uses the frame window ratio and clamps the source edges like cover crop', () => {
    const style = polaroidCropStyle({ widthPx: 4000, heightPx: 3000 }, { version: 1, x: 0, y: 0.5, zoom: 1 });
    const windowRatio = POLAROID_FRAME.imageWidthMm / POLAROID_FRAME.imageHeightMm;
    const scale = POLAROID_FRAME.imageHeightMm / 3000;
    expect(windowRatio).toBe(0.8);
    expect(parseFloat(String(style.height))).toBeCloseTo(100);
    expect(style.width).toBe(`${(4000 * scale / POLAROID_FRAME.imageWidthMm) * 100}%`);
    expect(style.left).toBe('0%');
    expect(parseFloat(String(style.top))).toBeCloseTo(0);
  });

  it('moves the source in the opposite direction to the drag and respects crop bounds', () => {
    const photo = { widthPx: 4000, heightPx: 3000 };
    const moved = movePolaroidComposition(photo, DEFAULT_POLAROID_COMPOSITION, 40, 0, 240, 300);
    expect(moved.x).toBeLessThan(0.5);
    expect(moved.y).toBe(0.5);
    expect(parseFloat(String(polaroidCropStyle(photo, moved).left))).toBeGreaterThan(
      parseFloat(String(polaroidCropStyle(photo, DEFAULT_POLAROID_COMPOSITION).left)),
    );
    expect(movePolaroidComposition(photo, moved, 9999, 0, 240, 300).x).toBe(0);
    expect(movePolaroidComposition(photo, moved, 40, 0, 0, 300)).toEqual(moved);
  });
});