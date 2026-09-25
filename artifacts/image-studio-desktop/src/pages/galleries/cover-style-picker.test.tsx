import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GALLERY_HEADER_THEMES } from '../../../../../lib/shared-src/gallery-header-themes';
import { CoverStylePicker } from './cover-style-picker';

describe('CoverStylePicker', () => {
  it('shows the same centralized cover styles as the web editor and previews the selected style', () => {
    const html = renderToStaticMarkup(
      <CoverStylePicker
        value="dorato"
        onChange={() => undefined}
        coverUrl="https://example.test/cover.jpg"
        galleryName="Matrimonio di Giulia e Marco"
        eventDate="2026-09-25"
        location="Roma"
      />,
    );

    expect(GALLERY_HEADER_THEMES).toHaveLength(6);
    for (const theme of GALLERY_HEADER_THEMES) expect(html).toContain(theme.nome);
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain('Matrimonio di Giulia e Marco');
    expect(html).toContain('https://example.test/cover.jpg');
  });
});