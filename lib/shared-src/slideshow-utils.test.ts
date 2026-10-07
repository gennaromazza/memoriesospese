import { describe, expect, it } from 'vitest';
import { filterActiveSlideshowImages, normalizeSlideshowPositions } from './slideshow-utils';

describe('slideshow utils', () => {
  it('esclude solo le immagini disattivate esplicitamente', () => {
    const result = filterActiveSlideshowImages([{ id: 'legacy' }, { id: 'on', active: true }, { id: 'off', active: false }]);
    expect(result.map((item) => item.id)).toEqual(['legacy', 'on']);
  });

  it('ordina e assegna posizioni univoche consecutive', () => {
    const result = normalizeSlideshowPositions([{ id: 'b', position: 4 }, { id: 'a', position: 4 }, { id: 'c', position: 1 }]);
    expect(result.map(({ id, position }) => ({ id, position }))).toEqual([
      { id: 'c', position: 0 }, { id: 'a', position: 1 }, { id: 'b', position: 2 },
    ]);
  });
});
