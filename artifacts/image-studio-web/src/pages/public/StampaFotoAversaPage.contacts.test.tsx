import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import StampaFotoAversaPage from './StampaFotoAversaPage';
import {
  buildPrintServiceProvider,
  normalizePublicStudioContacts,
} from '@/lib/public-studio-contacts';

const { studioState } = vi.hoisted(() => ({
  studioState: { settings: {} as Record<string, unknown> },
}));

vi.mock('@/context/StudioContext', () => ({
  useStudio: () => ({ studioSettings: studioState.settings }),
}));

vi.mock('wouter', async () => {
  const { createElement } = await import('react');
  return {
    Link: ({ href, to, children, ...props }: any) =>
      createElement('a', { ...props, href: href ?? to }, children),
  };
});

vi.mock('@/components/Navigation', () => ({ default: () => null }));
vi.mock('@/hooks/useSEO', () => ({ useSEO: () => undefined }));

function makeSettings(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Studio di prova',
    slogan: '',
    address: '',
    phone: '',
    email: '',
    websiteUrl: '',
    socialLinks: {},
    about: '',
    whatsapp: '',
    whatsappButtonText: 'Scrivici su WhatsApp',
    fiscalComune: 'Aversa',
    fiscalProvincia: 'CE',
    ...overrides,
  };
}

function renderPage(settings: Record<string, unknown>) {
  studioState.settings = {
    ...settings,
    ...normalizePublicStudioContacts(settings),
  };
  return renderToStaticMarkup(<StampaFotoAversaPage />);
}

function providerFor(settings: Record<string, unknown>) {
  const contacts = normalizePublicStudioContacts(settings);
  return buildPrintServiceProvider({
    name: 'Studio di prova',
    ...contacts,
    fiscalComune: settings.fiscalComune,
    fiscalProvincia: settings.fiscalProvincia,
  });
}

describe('public contact details on the print service page', () => {
  it.each([
    ['address', { address: 'Via Roma 12' }, 'Via Roma 12', 'address'],
    ['phone', { phone: '3331234567' }, '3331234567', 'telephone'],
    ['email', { email: 'studio@example.it' }, 'studio@example.it', 'email'],
    ['WhatsApp', { whatsapp: '393331234567' }, 'wa.me/393331234567', null],
  ])('shows only a configured %s', (contact, overrides, visibleValue, schemaField) => {
    const markup = renderPage(makeSettings(overrides));

    expect(markup).toContain(visibleValue);
    if (contact === 'address') {
      expect(markup).not.toContain('href="tel:');
      expect(markup).not.toContain('href="mailto:');
      expect(markup).not.toContain('wa.me/');
    } else if (contact === 'phone') {
      expect(markup).toContain('href="tel:3331234567"');
      expect(markup).not.toContain('href="mailto:');
      expect(markup).not.toContain('wa.me/');
    } else if (contact === 'email') {
      expect(markup).toContain('href="mailto:studio@example.it"');
      expect(markup).not.toContain('href="tel:');
      expect(markup).not.toContain('wa.me/');
    } else {
      expect(markup).toContain('href="https://wa.me/393331234567');
      expect(markup).not.toContain('href="tel:');
      expect(markup).not.toContain('href="mailto:');
    }

    const provider = providerFor(makeSettings(overrides));
    if (schemaField) {
      expect(provider).toHaveProperty(schemaField);
    } else {
      expect(provider).not.toHaveProperty('telephone');
    }
    for (const field of ['address', 'telephone', 'email']) {
      if (field !== schemaField) expect(provider).not.toHaveProperty(field);
    }
  });

  it('hides missing and whitespace-only details from the page and JSON-LD provider', () => {
    const markup = renderPage(makeSettings({
      address: '   ',
      phone: '\t ',
      email: '\n',
      whatsapp: '   ',
    }));

    expect(markup).not.toContain('href="tel:');
    expect(markup).not.toContain('href="mailto:');
    expect(markup).not.toContain('wa.me/');
    expect(providerFor(makeSettings({
      address: '   ',
      phone: '\t ',
      email: '\n',
      whatsapp: '   ',
    }))).toEqual({
      '@type': 'LocalBusiness',
      name: 'Studio di prova',
    });
  });

  it('trims configured contact values and keeps the business address in structured data', () => {
    const provider = providerFor(makeSettings({
      address: ' Via Roma 12 ',
      phone: ' 3331234567 ',
      email: ' studio@example.it ',
      whatsapp: ' 393331234567 ',
      fiscalComune: ' Aversa ',
      fiscalProvincia: ' CE ',
    }));

    expect(provider).toEqual({
      '@type': 'LocalBusiness',
      name: 'Studio di prova',
      telephone: '3331234567',
      email: 'studio@example.it',
      address: {
        '@type': 'PostalAddress',
        streetAddress: 'Via Roma 12',
        addressLocality: 'Aversa',
        addressRegion: 'CE',
        addressCountry: 'IT',
      },
    });
  });

  it('preserves the checkout destination and existing buyer-facing policy copy', () => {
    const pageSource = readFileSync(new URL('./StampaFotoAversaPage.tsx', import.meta.url), 'utf8');
    const markup = renderPage(makeSettings());

    expect(pageSource).toContain("createUrl('/stampa-foto-aversa/ordine')");
    expect(markup).toContain('Il totale viene ricalcolato dal sistema prima del pagamento');
    expect(markup).toContain('il ritiro avviene in sede');
  });
});