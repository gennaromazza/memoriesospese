import { describe, expect, it } from 'vitest';
import { ADMIN_NAV_GROUPS, getFlatNavItems } from './adminNavigation';

describe('menu dell\'admin: vendite online', () => {
  const group = ADMIN_NAV_GROUPS.find(item => item.id === 'shop-online');

  it('shop di Natale, stampe e gift card stanno tutti sotto "Shop online"', () => {
    expect(group?.label).toBe('Shop online');
    expect(group?.items?.map(item => item.label)).toEqual(['Shop di Natale', 'Stampe online', 'Gift card']);
  });

  it('stampe e gift card non sono più voci separate della barra', () => {
    const labels = ADMIN_NAV_GROUPS.map(item => item.label);
    expect(labels).not.toContain('Stampe online');
    expect(labels).not.toContain('Gift card');
    expect(ADMIN_NAV_GROUPS.find(item => item.id === 'stampe-online')).toBeUndefined();
    expect(ADMIN_NAV_GROUPS.find(item => item.id === 'gift-card')).toBeUndefined();
  });

  it('i valori interni delle schede non cambiano: collegamenti, notifiche e memoria della sessione continuano a funzionare', () => {
    const targets = Object.fromEntries((group?.items ?? []).map(item => [item.id, item.target.tab]));
    expect(targets).toEqual({
      'shop-di-natale': 'shop-online',
      'stampe-online': 'print-shop-orders',
      'gift-card': 'gift-card',
    });
  });

  it('il gruppo risulta attivo su tutte e tre le schede', () => {
    for (const tab of ['shop-online', 'print-shop-orders', 'gift-card']) {
      expect(ADMIN_NAV_GROUPS.find(item => item.tabs.includes(tab))?.id).toBe('shop-online');
    }
  });

  it('ogni scheda dell\'admin resta raggiungibile dalla ricerca (Ctrl+K)', () => {
    const flat = getFlatNavItems();
    for (const label of ['Shop di Natale', 'Stampe online', 'Gift card']) {
      const found = flat.find(item => item.label === label);
      expect(found?.group).toBe('Shop online');
    }
    const ids = flat.map(item => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
