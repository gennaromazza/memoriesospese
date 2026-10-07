import { describe, expect, it } from 'vitest';
import { GIFT_SHOP_FAQS, GIFT_SHOP_SEO, GIFT_SHOP_STEPS } from '@shared/gift-card-landing-content';

describe('contenuti della pagina regalo', () => {
  it('titolo e descrizione stanno nei limiti mostrati da Google', () => {
    expect(GIFT_SHOP_SEO.title.length).toBeLessThanOrEqual(60);
    expect(GIFT_SHOP_SEO.description.length).toBeGreaterThanOrEqual(120);
    expect(GIFT_SHOP_SEO.description.length).toBeLessThanOrEqual(160);
  });

  it('il titolo non promette solo shooting e cita il Natale', () => {
    const text = `${GIFT_SHOP_SEO.title} ${GIFT_SHOP_SEO.h1} ${GIFT_SHOP_SEO.script}`.toLowerCase();
    expect(text).toContain('natale');
    expect(text).not.toContain('shooting');
  });

  it('domande e passaggi sono completi e senza duplicati', () => {
    expect(GIFT_SHOP_FAQS.length).toBeGreaterThanOrEqual(4);
    expect(new Set(GIFT_SHOP_FAQS.map(faq => faq.question)).size).toBe(GIFT_SHOP_FAQS.length);
    expect(GIFT_SHOP_FAQS.every(faq => faq.question.endsWith('?') && faq.answer.length > 30)).toBe(true);
    expect(GIFT_SHOP_STEPS).toHaveLength(3);
  });

  it('nessun numero di telefono o email scritto nei testi: i contatti arrivano dalle impostazioni dello studio', () => {
    const all = JSON.stringify([GIFT_SHOP_SEO, GIFT_SHOP_FAQS, GIFT_SHOP_STEPS]);
    expect(all).not.toMatch(/@|\+39|\b3\d{2}[ ]?\d{6,7}\b/);
  });
});
