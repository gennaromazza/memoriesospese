import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CoverControls, PhotosTab } from './organization';
import { browserFolderChapter, supportedUploadImage } from '../../lib/folderChapter';
import type { Gallery, Photo, Chapter } from '../../lib/api-hooks';

const gallery = { id: 'sample', name: 'Galleria', coverUrl: 'https://example.test/cover.jpg',
  mobileCoverUrl: 'https://example.test/mobile.jpg', focalPoint: { x: 20, y: 70 },
  mobileFocalPoint: { x: 60, y: 40 } } as Gallery;
const photos = [
  { id: 'new', name: 'foto.jpg', url: 'https://example.test/photo.jpg', chapterId: 'chapter' },
  { id: 'legacy-old', name: 'vecchia.jpg', url: 'https://example.test/old.jpg', chapterId: null },
] as Photo[];
const chapters = [{ id: 'chapter', titolo: 'Cerimonia', descrizione: 'In chiesa', ordine: 0 }] as Chapter[];

function markup(element: React.ReactNode, withPhotos = photos, withChapters = chapters) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(['gallery', gallery.id, 'photos'], withPhotos);
  client.setQueryData(['gallery', gallery.id, 'chapters'], withChapters);
  return renderToStaticMarkup(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
}

describe('desktop gallery UI with cached API data', () => {
  it('assigns only nested browser folders to chapters and filters unsupported TIFFs', () => {
    expect(browserFolderChapter('Matrimonio/foto.jpg')).toBe('Senza capitolo');
    expect(browserFolderChapter('Matrimonio/Cerimonia/foto.jpg')).toBe('Cerimonia');
    expect(browserFolderChapter('Matrimonio/Cerimonia/Ingresso/foto.jpg')).toBe('Cerimonia');
    expect(browserFolderChapter('foto.jpg')).toBe('Senza capitolo');
    expect(supportedUploadImage('scatto.TIFF')).toBe(false);
    expect(supportedUploadImage('scatto.HEIF')).toBe(true);
  });
  it('renders separate legacy/unassigned photos and editing controls for existing chapters', () => {
    const html = markup(<PhotosTab galleryId={gallery.id} />);
    expect(html).toContain('Senza capitolo (1)');
    expect(html).toContain('Cerimonia (1)');
    expect(html).toContain('In chiesa');
    expect(html).toContain('Nuovo capitolo');
    expect(html).toContain('Sposta in...');
    expect(html).toContain('vecchia.jpg');
    expect(html).toContain('Apri');
  });
  it('renders an empty gallery with the unassigned filter and create action', () => {
    const html = markup(<PhotosTab galleryId={gallery.id} />, [], []);
    expect(html).toContain('Senza capitolo (0)');
    expect(html).toContain('Nessuna foto trovata');
    expect(html).toContain('Nuovo capitolo');
  });
  it('renders distinct desktop/mobile covers with existing focal points and file inputs', () => {
    const html = markup(<CoverControls gallery={gallery} />);
    expect(html).toContain('Copertina Desktop');
    expect(html).toContain('Copertina Mobile');
    expect(html).toContain('20%, 70%');
    expect(html).toContain('60%, 40%');
    expect(html.match(/type="file"/g)).toHaveLength(2);
    expect(html).toContain('foto.jpg');
  });
});