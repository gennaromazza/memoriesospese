import { describe, expect, it } from 'vitest';
import { renderPrintSocialPageHtml } from '../build/print-social-page';

const HOME_INDEX = `<!doctype html>
<html lang="it"><head>
  <title>Fotografo Matrimoni Aversa, Napoli e Caserta | Image Studio</title>
  <meta name="description" content="Homepage description" />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="https://imagestudiofotografico.com/" />
  <meta property="og:title" content="Fotografo Matrimoni Aversa, Napoli e Caserta | Image Studio" />
  <meta property="og:url" content="https://imagestudiofotografico.com" />
  <meta property="og:image" content="https://imagestudiofotografico.com/1200x630px.jpg" />
  <meta property="og:image" content="https://imagestudiofotografico.com/legacy-home-image.jpg" />
  <meta name="twitter:image" content="https://imagestudiofotografico.com/1200x630px.jpg" />
  <meta name="twitter:image" content="https://imagestudiofotografico.com/legacy-home-image.jpg" />
  <link rel="canonical" href="https://imagestudiofotografico.com/duplicate-home-canonical" />
  <meta property="og:url" content="https://imagestudiofotografico.com/duplicate-home-url" />
  <script type="application/ld+json">{"@type":"WebSite","url":"https://imagestudiofotografico.com/"}</script>
</head><body><div id="root"></div></body></html>`;

describe('static print-page social metadata', () => {
  it('replaces homepage SEO metadata with one exact print-page metadata set', () => {
    const html = renderPrintSocialPageHtml(HOME_INDEX);

    expect(html.match(/<link rel="canonical"/g)).toHaveLength(1);
    expect(html).toContain(
      '<link rel="canonical" href="https://imagestudiofotografico.com/stampa-foto-aversa" />',
    );
    expect(html.match(/<meta property="og:url"/g)).toHaveLength(1);
    expect(html).toContain(
      '<meta property="og:url" content="https://imagestudiofotografico.com/stampa-foto-aversa" />',
    );
    expect(html.match(/<meta property="og:image"/g)).toHaveLength(1);
    expect(html.match(/<meta name="twitter:image"/g)).toHaveLength(1);
    expect(html).toContain(
      '<meta property="og:image" content="https://imagestudiofotografico.com/images/print-service/printed-memories-table.jpg" />',
    );
    expect(html).toContain(
      '<meta name="twitter:image" content="https://imagestudiofotografico.com/images/print-service/printed-memories-table.jpg" />',
    );
    expect(html).not.toContain('1200x630px.jpg');
    expect(html).not.toContain('Homepage description');
    expect(html).not.toContain('Fotografo Matrimoni Aversa, Napoli e Caserta');
    expect(html).not.toContain('application/ld+json');
    expect(html).not.toContain('fb:app_id');
  });

  it('fails clearly when the built HTML has no head to update', () => {
    expect(() => renderPrintSocialPageHtml('<html><body></body></html>'))
      .toThrow('index.html has no closing head tag');
  });
});
