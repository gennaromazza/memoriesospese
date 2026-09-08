import { describe, expect, it } from 'vitest';
import {
  photobookJobHasLinkedGalleries,
  selectPhotobookGalleryForJob,
} from './photobook-job-gallery';

describe('photobook Job-galleria selection', () => {
  const galleries = [{ id: 'gallery-a' }, { id: 'gallery-b' }, { id: 'gallery-unrelated' }];

  it('keeps the selected gallery when it is linked to a Job with multiple galleries', () => {
    expect(
      selectPhotobookGalleryForJob(
        { galleryIds: ['gallery-a', 'gallery-b'] },
        galleries,
        'gallery-b',
      ),
    ).toBe('gallery-b');
  });

  it('selects the first available linked gallery when the current one is not linked', () => {
    expect(
      selectPhotobookGalleryForJob(
        { galleryIds: ['gallery-b', 'gallery-a'] },
        galleries,
        'gallery-unrelated',
      ),
    ).toBe('gallery-a');
  });

  it('completes the selection when galleries arrive after the Job', () => {
    const job = { galleryIds: ['gallery-b'] };

    expect(selectPhotobookGalleryForJob(job, [], '')).toBe('');
    expect(selectPhotobookGalleryForJob(job, galleries, '')).toBe('gallery-b');
  });

  it('leaves a Job without galleries available for manual gallery selection', () => {
    const job = { galleryIds: [] };

    expect(photobookJobHasLinkedGalleries(job)).toBe(false);
    expect(selectPhotobookGalleryForJob(job, galleries, '')).toBe('');
  });

  it('does not silently accept an unrelated current gallery', () => {
    expect(
      selectPhotobookGalleryForJob(
        { galleryIds: ['gallery-a'] },
        galleries,
        'gallery-unrelated',
      ),
    ).toBe('gallery-a');
  });
});