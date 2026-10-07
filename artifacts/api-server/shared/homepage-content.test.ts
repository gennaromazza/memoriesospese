import { describe, expect, it } from 'vitest';
import { DEFAULT_HOMEPAGE_CONTENT, resolveHomepageContent } from './homepage-content';

describe('homepage content', () => {
  it('mantiene gli attuali testi quando la configurazione non esiste', () => {
    expect(resolveHomepageContent()).toEqual(DEFAULT_HOMEPAGE_CONTENT);
  });

  it('applica le modifiche senza perdere i fallback delle altre sezioni', () => {
    const content = resolveHomepageContent({ hero: { title: 'Nuovo titolo' } } as any);
    expect(content.hero.title).toBe('Nuovo titolo');
    expect(content.hero.primaryCta).toBe(DEFAULT_HOMEPAGE_CONTENT.hero.primaryCta);
    expect(content.portfolio).toEqual(DEFAULT_HOMEPAGE_CONTENT.portfolio);
  });

  it('non accetta testi vuoti come sovrascrittura', () => {
    const content = resolveHomepageContent({ whatsapp: { buttonText: '   ' } } as any);
    expect(content.whatsapp.buttonText).toBe(DEFAULT_HOMEPAGE_CONTENT.whatsapp.buttonText);
  });
});
