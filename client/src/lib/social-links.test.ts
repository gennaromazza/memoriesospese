import { describe, expect, it } from 'vitest';
import { instagramHandle, normalizeSocialUrl } from './social-links';

describe('social links', () => {
  it('normalizza un username Instagram', () => {
    expect(normalizeSocialUrl('instagram', '@imagestudio')).toBe('https://www.instagram.com/imagestudio');
  });

  it('mantiene un URL completo', () => {
    expect(normalizeSocialUrl('facebook', 'https://facebook.com/image')).toBe('https://facebook.com/image');
  });

  it('estrae il nome Instagram da URL e query string', () => {
    expect(instagramHandle('https://www.instagram.com/image.studio/?hl=it')).toBe('image.studio');
  });
});
