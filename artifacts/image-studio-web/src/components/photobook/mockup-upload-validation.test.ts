import { describe, expect, it } from 'vitest';
import { MAX_MOCKUP_PHOTO_BYTES, mockupUploadValidationError } from './mockup-upload-validation';

describe('avvisi caricamento foto mockup', () => {
  it.each(['image/jpeg', 'image/png', 'image/webp'])('accetta %s fino al limite esatto', type => {
    expect(mockupUploadValidationError({ name: 'retro.jpg', type, size: MAX_MOCKUP_PHOTO_BYTES })).toBe('');
  });
  it('segnala nome, peso, mancato caricamento e limite per file troppo grandi', () => {
    const message = mockupUploadValidationError({ name: 'retro.png', type: 'image/png', size: 21 * 1024 * 1024 });
    expect(message).toContain('retro.png');
    expect(message).toContain('pesa 21 MB e non è stata caricata');
    expect(message).toContain('Il limite è 20 MB per file');
    expect(message).toContain('versione più leggera');
  });
  it('rifiuta anche un byte oltre il limite', () => {
    expect(mockupUploadValidationError({ name: 'retro.jpg', type: 'image/jpeg', size: MAX_MOCKUP_PHOTO_BYTES + 1 })).not.toBe('');
  });
  it('segnala il formato non supportato', () => {
    expect(mockupUploadValidationError({ name: 'retro.tif', type: 'image/tiff', size: 1024 })).toContain('Formato non supportato');
  });
});
