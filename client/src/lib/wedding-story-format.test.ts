import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import WeddingStoryInline from '@/components/WeddingStoryInline';
import { parseWeddingStoryInlineMarkdown } from './wedding-story-format';

describe('Real Wedding inline Markdown', () => {
  it('parses a safe https link', () => {
    expect(parseWeddingStoryInlineMarkdown('[Test](https://example.com)')).toEqual([
      { type: 'link', label: 'Test', href: 'https://example.com', external: true },
    ]);
  });

  it('parses http links too', () => {
    expect(parseWeddingStoryInlineMarkdown('[Test](http://example.com)')).toEqual([
      { type: 'link', label: 'Test', href: 'http://example.com', external: true },
    ]);
  });

  it('does not turn javascript URLs into links', () => {
    expect(parseWeddingStoryInlineMarkdown('[Test](javascript:alert(1))')).toEqual([
      { type: 'text', value: '[Test](javascript:alert(1)' },
      { type: 'text', value: ')' },
    ]);
  });

  it('keeps HTML written by the author as text', () => {
    expect(parseWeddingStoryInlineMarkdown('<b>Test</b>')).toEqual([
      { type: 'text', value: '<b>Test</b>' },
    ]);
  });

  it('leaves normal text unchanged', () => {
    expect(parseWeddingStoryInlineMarkdown('Testo normale')).toEqual([
      { type: 'text', value: 'Testo normale' },
    ]);
  });

  it('renders two links in one paragraph', () => {
    expect(parseWeddingStoryInlineMarkdown(
      'Visita [Villa](https://villa.example) o [Atelier](https://atelier.example).',
    )).toEqual([
      { type: 'text', value: 'Visita ' },
      { type: 'link', label: 'Villa', href: 'https://villa.example', external: true },
      { type: 'text', value: ' o ' },
      { type: 'link', label: 'Atelier', href: 'https://atelier.example', external: true },
      { type: 'text', value: '.' },
    ]);
  });

  it('does not break on malformed or disallowed links', () => {
    const text = 'Prima [link senza chiusura e [file](file:///tmp/a) dopo.';
    const parts = parseWeddingStoryInlineMarkdown(text);

    expect(parts.every(part => part.type === 'text')).toBe(true);
    expect(parts.map(part => part.value).join('')).toBe(text);
  });

  it('keeps same-site links in the current tab and opens external links safely', () => {
    const html = renderToStaticMarkup(
      createElement(WeddingStoryInline, {
        text: 'Vai su [interno](https://imagestudiofotografico.com/portfolio) o [esterno](https://example.com).',
        currentOrigin: 'https://preview.example.test',
      }),
    );

    expect(html).toMatch(/href="https:\/\/imagestudiofotografico\.com\/portfolio" class=/);
    expect(html).toMatch(/href="https:\/\/example\.com" target="_blank" rel="noopener noreferrer"/);
  });
});