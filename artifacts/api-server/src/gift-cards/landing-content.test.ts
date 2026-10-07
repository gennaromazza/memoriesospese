import { describe, expect, it } from 'vitest';
import {
  GIFT_HOW_NOTES,
  GIFT_HOW_SECTIONS,
  GIFT_HOW_SEO,
  GIFT_SHOP_FAQS,
  GIFT_SHOP_SEO,
  GIFT_SHOP_STEPS,
} from '@shared/gift-card-landing-content';

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

describe('guida «Come funziona»', () => {
  it('titolo e descrizione stanno nei limiti mostrati da Google e sono diversi dalla pagina regalo', () => {
    expect(GIFT_HOW_SEO.title.length).toBeLessThanOrEqual(60);
    expect(GIFT_HOW_SEO.description.length).toBeGreaterThanOrEqual(120);
    expect(GIFT_HOW_SEO.description.length).toBeLessThanOrEqual(160);
    expect(GIFT_HOW_SEO.title).not.toBe(GIFT_SHOP_SEO.title);
    expect(GIFT_HOW_SEO.description).not.toBe(GIFT_SHOP_SEO.description);
  });

  it('spiega sia come regalare sia come ricevere, con passaggi completi', () => {
    expect(GIFT_HOW_SECTIONS.map(section => section.id)).toEqual(['regalare', 'ricevere']);
    expect(GIFT_HOW_SECTIONS.every(section => section.steps.length >= 3)).toBe(true);
    expect(GIFT_HOW_SECTIONS.flatMap(section => section.steps).every(step => step.title.length > 3 && step.text.length > 20)).toBe(true);
  });

  it('non promette giorni precisi né contiene recapiti scritti a mano', () => {
    const all = JSON.stringify([GIFT_HOW_SEO, GIFT_HOW_SECTIONS, GIFT_HOW_NOTES]);
    expect(all).not.toMatch(/25 dicembre/i);
    expect(all).not.toMatch(/@|\+39|\b3\d{2}[ ]?\d{6,7}\b/);
  });
});
