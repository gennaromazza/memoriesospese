import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { getAllThemes } from '@shared/special-themes';
import SpecialGalleryTheme from './SpecialGalleryTheme';
import GalleryHeaderOverlay from './GalleryHeaderOverlay';

const renderGallery = (themeId?: string | null) =>
  renderToStaticMarkup(
    <SpecialGalleryTheme themeId={themeId}>
      <span>Galleria cliente</span>
    </SpecialGalleryTheme>,
  );

describe('client gallery seasonal theme', () => {
  it.each(getAllThemes())('renders the saved desktop catalog theme $name', theme => {
    const html = renderGallery(theme.id);
    expect(html).toContain(`theme-${theme.id}`);
    expect(html).toContain('Galleria cliente');

    // The public gallery imports these stylesheets; every catalog ID must have a matching rule.
    const css = readFileSync(new URL(`../../styles/themes/${theme.id}.css`, import.meta.url), 'utf8');
    expect(css).toContain(`.theme-${theme.id}`);
  });

  it.each([null, undefined, 'none', 'natale2024'])(
    'shows the normal gallery when the theme is removed or unavailable (%s)',
    themeId => {
      const html = renderGallery(themeId);
      expect(html).toContain('bg-off-white');
      expect(html).not.toContain('theme-natale2024');
      expect(html).not.toMatch(/class="[^"]*theme-/);
    },
  );

  it('keeps the cover overlay independent of the seasonal catalog', () => {
    const html = renderToStaticMarkup(
      <SpecialGalleryTheme themeId="natale">
        <GalleryHeaderOverlay name="Galleria cliente" date="25 settembre" themeId="classico" />
      </SpecialGalleryTheme>,
    );
    expect(html).toContain('theme-natale');
    expect(html).toContain('Galleria cliente');
    expect(html).toContain('25 settembre');
  });
});