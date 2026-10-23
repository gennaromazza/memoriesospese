import { describe, expect, it } from 'vitest';
import {
  INITIAL_STUDIO_QUOTE_THEME,
  resolveStudioQuoteTheme,
} from './studio-quote-theme';

describe('tema globale dei preventivi', () => {
  it('risolve colori e footer dalle impostazioni salvate dello studio', () => {
    expect(resolveStudioQuoteTheme({
      name: 'Studio Demo',
      quoteTheme: {
        primaryColor: '#123456',
        secondaryColor: '#ABCDEF',
      },
    })).toEqual({
      primaryColor: '#123456',
      secondaryColor: '#ABCDEF',
      footerText: 'Studio Demo',
    });
  });

  it('non aggiunge il footer se il nome dello studio non è configurato', () => {
    expect(resolveStudioQuoteTheme({
      quoteTheme: {
        primaryColor: '#123456',
        secondaryColor: '#ABCDEF',
      },
    })).toEqual({
      primaryColor: '#123456',
      secondaryColor: '#ABCDEF',
    });
  });

  it('rifiuta la creazione se i colori non sono configurati o non validi', () => {
    expect(() => resolveStudioQuoteTheme({})).toThrow(/Impostazioni Studio/);
    expect(() => resolveStudioQuoteTheme({
      quoteTheme: { primaryColor: 'verde', secondaryColor: '#ABCDEF' },
    })).toThrow(/Impostazioni Studio/);
  });

  it('usa la palette corrente solo come seed dei campi admin', () => {
    expect(INITIAL_STUDIO_QUOTE_THEME).toEqual({
      primaryColor: '#8B9A8B',
      secondaryColor: '#C8B8A8',
    });
  });
});
