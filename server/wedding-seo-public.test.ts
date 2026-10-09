import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AddressInfo } from 'node:net';

const { mockCollection, state } = vi.hoisted(() => ({
  mockCollection: vi.fn(),
  state: {
    story: null as Record<string, any> | null,
    photos: {} as Record<string, Record<string, any>>,
  },
}));

vi.mock('./firebase-admin.js', () => ({
  db: { collection: mockCollection },
  FieldValue: { serverTimestamp: vi.fn(), delete: vi.fn() },
}));

vi.mock('./email-routes.js', () => ({
  authenticateFirebase: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import weddingSeoRoutes from './wedding-seo';
import { WEDDING_PUBLIC_DATA_CACHE_CONTROL } from '../shared/wedding-seo-types';

describe('Real Wedding public endpoints', () => {
  let server: ReturnType<ReturnType<typeof express>['listen']>;

  beforeEach(async () => {
    vi.clearAllMocks();
    state.story = {
      galleryId: 'gallery-1',
      jobId: '',
      status: 'published',
      slug: 'anna-e-luca',
      title: 'Anna e Luca',
      excerpt: 'Una cerimonia in giardino.',
      story: '## Cerimonia\n\nUna giornata speciale.',
      seoTitle: 'Anna e Luca',
      seoDescription: 'Il matrimonio di Anna e Luca.',
      selectedPhotoIds: ['photo-1', 'photo-2', 'photo-3'],
      coverPhotoId: 'photo-2',
      publishedAt: { seconds: 1_780_000_000 },
    };
    state.photos = Object.fromEntries(['photo-1', 'photo-2', 'photo-3'].map(id => [
      id,
      { galleryId: 'gallery-1', url: `https://images.example/${id}.jpg`, name: `${id}.jpg` },
    ]));
    mockCollection.mockImplementation((collectionName: string) => {
      if (collectionName === 'weddingSeoStories') {
        return {
          where: () => ({
            get: async () => ({
              docs: state.story ? [{ id: 'story-doc', data: () => state.story }] : [],
            }),
          }),
        };
      }
      if (collectionName === 'galleries') {
        return {
          doc: (id: string) => ({
            get: async () => ({
              exists: true,
              id,
              data: () => ({ chapters: [] }),
            }),
          }),
        };
      }
      if (collectionName === 'photos') {
        return {
          doc: (id: string) => ({
            get: async () => ({
              exists: Boolean(state.photos[id]),
              data: () => state.photos[id],
            }),
          }),
        };
      }
      return { where: () => ({ get: async () => ({ docs: [] }) }) };
    });

    const app = express();
    app.use('/api/wedding-seo', weddingSeoRoutes);
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>(resolve => server.once('listening', resolve));
  });

  afterEach(async () => {
    if (server?.listening) {
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });

  async function getJson(path: string): Promise<{ headers: Headers; body: any }> {
    const { port } = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${port}/api/wedding-seo${path}`);
    return { headers: response.headers, body: await response.json() };
  }

  it('returns the selected cover first for previews and detail without allowing stale caching', async () => {
    const previews = await getJson('/public?limit=3');
    const detail = await getJson('/public/anna-e-luca');

    expect(previews.headers.get('cache-control')).toBe(WEDDING_PUBLIC_DATA_CACHE_CONTROL);
    expect(detail.headers.get('cache-control')).toBe(WEDDING_PUBLIC_DATA_CACHE_CONTROL);
    expect(previews.body.stories[0].coverImage).toBe('https://images.example/photo-2.jpg');
    expect(detail.body.photos.map((photo: { id: string }) => photo.id))
      .toEqual(['photo-2', 'photo-1', 'photo-3']);
  });

  it.each([
    ['cover non selezionata', 'not-selected', 'available'],
    ['file della cover non disponibile', 'photo-2', 'missing'],
    ['URL della cover non utilizzabile', 'photo-2', 'missing-url'],
  ])('uses the first available selected photo when the %s', async (_case, coverPhotoId, coverAvailability) => {
    state.story!.coverPhotoId = coverPhotoId;
    if (coverAvailability === 'missing') delete state.photos['photo-2'];
    if (coverAvailability === 'missing-url') delete state.photos['photo-2'].url;

    const previews = await getJson('/public?limit=3');
    const detail = await getJson('/public/anna-e-luca');

    expect(previews.body.stories[0].coverImage).toBe('https://images.example/photo-1.jpg');
    expect(detail.body.photos[0].id).toBe('photo-1');
  });
});
