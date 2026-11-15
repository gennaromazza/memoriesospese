import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_MOCKUP_PREVIEW_BYTES, prepareMockupPhotoPreview } from './mockup-photo-preview';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('anteprima leggera per il mockup', () => {
  it('ridimensiona e comprime la foto prima dell’upload senza usare il file originale', async () => {
    const close = vi.fn();
    const outputSizes: number[] = [];
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 6000, height: 4000, close })));
    let canvas: HTMLCanvasElement;
    canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({ drawImage: vi.fn() })),
      toBlob: vi.fn(callback => {
        outputSizes.push(canvas.width * canvas.height);
        callback(new Blob([new Uint8Array(1024)], { type: 'image/jpeg' }));
      }),
    } as unknown as HTMLCanvasElement;
    vi.stubGlobal('document', { createElement: vi.fn(() => canvas) });

    const source = new File([new Uint8Array(8 * 1024 * 1024)], 'foto-originale.png', { type: 'image/png' });
    const preview = await prepareMockupPhotoPreview(source);

    expect(preview.name).toBe('foto-originale.jpg');
    expect(preview.type).toBe('image/jpeg');
    expect(preview.size).toBeLessThanOrEqual(MAX_MOCKUP_PREVIEW_BYTES);
    expect(preview.size).toBeLessThan(source.size);
    expect(canvas.width).toBe(0);
    expect(outputSizes[0]).toBe(2048 * 1365);
    expect(canvas.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', 0.82);
    expect(close).toHaveBeenCalledOnce();
  });

  it('rilascia la foto decodificata anche se la compressione non riesce', async () => {
    const close = vi.fn();
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 2000, height: 1000, close })));
    const tooLarge = new Blob([new Uint8Array(MAX_MOCKUP_PREVIEW_BYTES + 1)], { type: 'image/jpeg' });
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({ drawImage: vi.fn() })),
      toBlob: vi.fn(callback => callback(tooLarge)),
    } as unknown as HTMLCanvasElement;
    vi.stubGlobal('document', { createElement: vi.fn(() => canvas) });

    await expect(prepareMockupPhotoPreview(new File(['source'], 'foto.jpg', { type: 'image/jpeg' })))
      .rejects.toThrow('Prova a esportare una copia JPEG');
    expect(close).toHaveBeenCalledOnce();
  });
});
