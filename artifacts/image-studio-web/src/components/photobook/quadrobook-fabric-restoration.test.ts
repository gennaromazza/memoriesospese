import { describe, expect, it, vi } from 'vitest';
import { restoreQuadrobookFabrics } from '../../../public/mockups/scatola-v1/fabric-restoration.js';

describe('ripristino tessuti Quadrobook', () => {
  it('ripristina separatamente scatola e album quando hanno tessuti diversi', async () => {
    const setFabric = vi.fn(async () => undefined);

    await restoreQuadrobookFabrics(
      { materialId: 'tessuto-scatola', albumMaterialId: 'tessuto-album' },
      setFabric,
    );

    expect(setFabric.mock.calls).toEqual([
      ['tessuto-scatola', ['box']],
      ['tessuto-album', ['album']],
    ]);
  });

  it('applica una sola scelta quando il tessuto è condiviso o il dato album manca', async () => {
    const setFabric = vi.fn(async () => undefined);

    await restoreQuadrobookFabrics({ materialId: 'tessuto-unico' }, setFabric);

    expect(setFabric.mock.calls).toEqual([
      ['tessuto-unico', ['box', 'album']],
    ]);
  });
});
