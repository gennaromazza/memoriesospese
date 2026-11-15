// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { BlogPost } from '@shared/schema';
import { BlogPostStatus } from '@shared/schema';
import type { WeddingStoryEditorContext } from '@shared/wedding-seo-types';
import BlogManager from './BlogManager';
import WeddingSeoDraftPanel from '@/components/WeddingSeoDraftPanel';

const weddingSeoMocks = vi.hoisted(() => ({
  getWeddingStoryEditor: vi.fn(),
  saveWeddingStory: vi.fn(),
  saveWeddingStorySelection: vi.fn(),
}));

vi.mock('react-quill-new', () => ({ default: () => null }));
vi.mock('react-quill-new/dist/quill.snow.css', () => ({}));
vi.mock('@/lib/firebase', () => ({ db: {}, storage: {} }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/lib/wedding-seo', () => ({
  ...weddingSeoMocks,
  generateWeddingStoryDraft: vi.fn(),
  visibleWeddingPhotos: (photos: unknown[], count: number) => photos.slice(0, count),
  WEDDING_PHOTO_PAGE_SIZE: 60,
  weddingPhotoPreview: (photo: { thumbnailUrl?: string; url: string }) => photo.thumbnailUrl || photo.url,
}));

const publishedPost = {
  id: 'post-published',
  title: 'Titolo precedente',
  slug: 'titolo-precedente',
  excerpt: 'Descrizione precedente',
  content: '<p>Contenuto del post</p>',
  coverImage: 'https://cdn.example.test/copertina-precedente.jpg',
  coverImageAlt: 'Copertina precedente',
  status: BlogPostStatus.PUBLISHED,
  author: 'Autrice di prova',
  createdAt: { seconds: 1, nanoseconds: 0 },
  publishedAt: { seconds: 2, nanoseconds: 0 },
  metaTitle: '',
  metaDescription: '',
} as unknown as BlogPost;

const publishedWeddingStory: WeddingStoryEditorContext = {
  gallery: { id: 'gallery-social-card', name: 'Matrimonio di prova' },
  sources: [],
  vendorReviews: [],
  story: {
    id: 'story-social-card',
    galleryId: 'gallery-social-card',
    jobId: 'job-social-card',
    status: 'published',
    slug: 'matrimonio-di-prova',
    title: 'Titolo precedente',
    excerpt: 'Descrizione precedente',
    story: 'Racconto precedente',
    seoTitle: '',
    seoDescription: '',
    selectedPhotoIds: ['photo-old-cover'],
    coverPhotoId: 'photo-old-cover',
    approvedSourceIds: [],
    publishedAt: { seconds: 2, nanoseconds: 0 },
  },
};

const weddingPhotos = [
  {
    id: 'photo-old-cover',
    galleryId: 'gallery-social-card',
    name: 'copertina-precedente.jpg',
    url: 'https://cdn.example.test/copertina-precedente.jpg',
    contentType: 'image/jpeg',
    size: 1,
    uploaderUid: 'admin',
    uploaderEmail: 'admin@example.test',
    uploaderName: 'Admin',
    likeCount: 0,
    commentCount: 0,
    createdAt: new Date(0),
  },
  {
    id: 'photo-new-cover',
    galleryId: 'gallery-social-card',
    name: 'copertina-nuova.jpg',
    url: 'https://cdn.example.test/copertina-nuova.jpg',
    contentType: 'image/jpeg',
    size: 1,
    uploaderUid: 'admin',
    uploaderEmail: 'admin@example.test',
    uploaderName: 'Admin',
    likeCount: 0,
    commentCount: 0,
    createdAt: new Date(1),
  },
];

describe('scheda social negli editor', () => {
  beforeEach(() => {
    weddingSeoMocks.getWeddingStoryEditor.mockResolvedValue(publishedWeddingStory);
    weddingSeoMocks.saveWeddingStory.mockReset();
    weddingSeoMocks.saveWeddingStorySelection.mockResolvedValue({
      selectedPhotoIds: ['photo-old-cover'],
      coverPhotoId: 'photo-old-cover',
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('segue titolo, descrizione e copertina del post senza cambiare lo stato pubblicato', async () => {
    render(<BlogManager loadBlogPosts={async () => [publishedPost]} />);
    fireEvent.click(await screen.findByTestId('button-edit-post-published'));

    fireEvent.change(await screen.findByTestId('input-title'), {
      target: { value: 'Titolo aggiornato' },
    });
    fireEvent.change(screen.getByTestId('input-excerpt'), {
      target: { value: 'Descrizione aggiornata' },
    });
    fireEvent.change(screen.getByTestId('input-cover-image'), {
      target: { value: 'https://cdn.example.test/copertina-aggiornata.jpg' },
    });
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Social' }), { button: 0 });

    expect(screen.getByTestId('blog-social-preview-title').textContent).toBe(
      'Titolo aggiornato | Blog Image Studio',
    );
    expect(screen.getByTestId('blog-social-preview').textContent).toContain('Descrizione aggiornata');
    expect(screen.getByTestId('blog-social-preview-image').getAttribute('src')).toBe(
      'https://cdn.example.test/copertina-aggiornata.jpg',
    );
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Contenuto' }), { button: 0 });
    expect(screen.getByTestId('select-status').textContent?.trim()).toBe('Pubblicato');
  });

  it('segue titolo, descrizione e copertina Real Wedding senza cambiare lo stato pubblicato', async () => {
    render(
      <WeddingSeoDraftPanel
        gallery={{ id: 'gallery-social-card', name: 'Matrimonio di prova', chapters: [] } as never}
        photos={weddingPhotos as never}
      />,
    );

    fireEvent.change(await screen.findByLabelText(/Titolo \(/), {
      target: { value: 'Titolo aggiornato' },
    });
    fireEvent.change(screen.getByLabelText(/Introduzione \(/), {
      target: { value: 'Descrizione aggiornata' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Usa copertina-nuova.jpg come copertina' }));

    expect(screen.getByTestId('wedding-social-preview-title').textContent).toBe('Titolo aggiornato');
    expect(screen.getByTestId('wedding-social-preview').textContent).toContain('Descrizione aggiornata');
    expect(screen.getByTestId('wedding-social-preview-image').getAttribute('src')).toBe(
      'https://cdn.example.test/copertina-nuova.jpg',
    );
    expect(screen.getByText('Pubblicata')).toBeTruthy();
    expect(weddingSeoMocks.saveWeddingStory).not.toHaveBeenCalled();
  });
});
