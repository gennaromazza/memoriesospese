import type { QuoteTheme } from './quotes-types';

/**
 * Seed shown in the Admin Studio settings form when quote colors have never
 * been configured. Runtime quote creation must read the persisted settings.
 */
export const INITIAL_STUDIO_QUOTE_THEME = {
  primaryColor: '#8B9A8B',
  secondaryColor: '#C8B8A8',
} as const;

/**
 * Resolve the single global theme used for newly created quotes.
 * Missing or invalid colors are an explicit configuration error, not a runtime fallback.
 */
export function resolveStudioQuoteTheme(settings: {
  name?: unknown;
  quoteTheme?: unknown;
}): QuoteTheme {
  const storedTheme =
    settings.quoteTheme && typeof settings.quoteTheme === 'object'
      ? settings.quoteTheme as Record<string, unknown>
      : {};
  const primaryColor =
    typeof storedTheme.primaryColor === 'string' ? storedTheme.primaryColor.trim() : '';
  const secondaryColor =
    typeof storedTheme.secondaryColor === 'string' ? storedTheme.secondaryColor.trim() : '';
  const colorPattern = /^#[\da-f]{6}$/i;

  if (!colorPattern.test(primaryColor) || !colorPattern.test(secondaryColor)) {
    throw new Error(
      'Configura e salva i colori dei preventivi in Impostazioni Studio prima di crearne uno.'
    );
  }

  const studioName = typeof settings.name === 'string' ? settings.name.trim() : '';
  return {
    primaryColor,
    secondaryColor,
    ...(studioName ? { footerText: studioName } : {}),
  };
}
