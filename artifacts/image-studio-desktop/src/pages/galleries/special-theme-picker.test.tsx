import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { getAllThemes } from '../../../../../lib/shared-src/special-themes';
import { SpecialThemePicker } from './special-theme-picker';

describe('SpecialThemePicker', () => {
  it('uses the centralized theme IDs, names, and icons', () => {
    const html = renderToStaticMarkup(
      <SpecialThemePicker value="none" onChange={() => undefined} />,
    );

    for (const theme of getAllThemes()) {
      expect(html).toContain(`value="${theme.id}"`);
      expect(html).toContain(theme.name);
      expect(html).toContain(theme.icon);
    }
    expect(html).toContain('Nessun tema (galleria normale)');
  });

  it('keeps an unknown saved theme visible until the user replaces it', () => {
    const html = renderToStaticMarkup(
      <SpecialThemePicker value="natale2024" onChange={() => undefined} />,
    );

    expect(html).toContain('value="natale2024"');
    expect(html).toContain('Tema precedente non disponibile (natale2024)');
  });
});