import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./queryClient', () => ({ apiRequest: vi.fn() }));
vi.mock('./config', () => ({ createUrl: (value: string) => value }));

import {
  isWeddingJobType,
  saveWeddingStorySelection,
  visibleWeddingPhotos,
  WEDDING_PHOTO_PAGE_SIZE,
  weddingPhotoPreview,
} from './wedding-seo';
import { apiRequest } from './queryClient';

describe('Real Wedding client helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the editor only for wedding galleries', () => {
    expect(isWeddingJobType('matrimonio')).toBe(true);
    expect(isWeddingJobType('WEDDING')).toBe(true);
    expect(isWeddingJobType('battesimo')).toBe(false);
  });

  it('uses the lightweight thumbnail in selection grids', () => {
    expect(weddingPhotoPreview({ thumbnailUrl: 'thumb.webp', url: 'original.jpg' })).toBe('thumb.webp');
    expect(weddingPhotoPreview({ url: 'legacy-original.jpg' })).toMatch(/^data:image\/svg\+xml/);
    expect(weddingPhotoPreview({ url: 'legacy-original.jpg' })).not.toContain('legacy-original.jpg');
  });

  it('renders a bounded first batch even for a very large gallery', () => {
    const gallery = Array.from({ length: 5_000 }, (_, position) => ({ id: `photo-${position}`, position }));
    const visible = visibleWeddingPhotos(gallery, WEDDING_PHOTO_PAGE_SIZE);

    expect(visible).toHaveLength(60);
    expect(visible[0].id).toBe('photo-0');
    expect(visible[59].id).toBe('photo-59');
  });

  it('saves selected photos and cover independently from the article', async () => {
    vi.mocked(apiRequest).mockResolvedValue(new Response(JSON.stringify({
      selectedPhotoIds: ['photo-1', 'photo-2'],
      coverPhotoId: 'photo-2',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    await expect(saveWeddingStorySelection(
      'gallery/id',
      ['photo-1', 'photo-2'],
      'photo-2',
    )).resolves.toEqual({
      selectedPhotoIds: ['photo-1', 'photo-2'],
      coverPhotoId: 'photo-2',
    });
    expect(apiRequest).toHaveBeenCalledWith(
      'PUT',
      '/api/wedding-seo/gallery/gallery%2Fid/selection',
      { selectedPhotoIds: ['photo-1', 'photo-2'], coverPhotoId: 'photo-2' },
    );
  });
});
