import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./firebase-admin.js', () => ({
  db: {},
  FieldValue: {
    serverTimestamp: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('./email-routes.js', () => ({
  authenticateFirebase: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import {
  buildAuthorizedSources,
  buildGroqPrompt,
  slugifyWeddingStory,
  toPublicWeddingStory,
  validateWeddingStoryInput,
} from './wedding-seo';

describe('Real Wedding editorial safety', () => {
  beforeEach(() => vi.clearAllMocks());

  it('keeps answers private without explicit editorial consent', () => {
    const sources = buildAuthorizedSources([
      {
        id: 'submission-1',
        data: {
          status: 'completed',
          clientName: 'Anna',
          editorialConsent: false,
          templateFields: [
            { id: 'story', label: 'Il momento più importante', type: 'textarea', required: false, editorialUse: true },
            { id: 'internal', label: 'Nota operativa', type: 'text', required: false },
          ],
          answers: { story: 'La cerimonia in giardino', internal: 'Saldo da verificare' },
        },
      },
    ]);

    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({ id: 'submission-1:story', consentGranted: false });
    expect(sources[0].value).toBeUndefined();
    expect(JSON.stringify(sources)).not.toContain('Saldo da verificare');
  });

  it('sends Groq only the selected, consented context and safe gallery fields', () => {
    const prompt = buildGroqPrompt({
      gallery: {
        name: 'Anna e Luca',
        date: '2026-06-12',
        location: 'Aversa',
        internalNotes: 'Non pubblicare questa nota',
      },
      sources: [{
        id: 's:f', submissionId: 's', fieldId: 'f', label: 'Dettaglio', value: 'Cerimonia in giardino',
        clientName: 'Anna', category: 'story', consentGranted: true,
      }],
      photos: [{ id: 'p1', name: 'preparativi.jpg', chapterTitle: 'Preparativi', url: 'https://full.example/photo.jpg' }],
    });

    expect(prompt).toContain('Cerimonia in giardino');
    expect(prompt).toContain('Preparativi');
    expect(prompt).not.toContain('Non pubblicare questa nota');
    expect(prompt).not.toContain('https://full.example/photo.jpg');
    expect(prompt).not.toContain('preparativi.jpg');
    expect(prompt).toContain('Non inventare');
  });

  it('requires meaningful copy and a photo only for explicit publication', () => {
    const draft = validateWeddingStoryInput({ title: 'Anna e Luca', story: 'Bozza iniziale' }, false);
    expect(draft.selectedPhotoIds).toEqual([]);

    expect(() => validateWeddingStoryInput({ title: 'Anna e Luca', story: 'Breve', selectedPhotoIds: ['p1'] }, true))
      .toThrow('troppo breve');
    expect(() => validateWeddingStoryInput({ title: 'Anna e Luca', story: 'x'.repeat(300), selectedPhotoIds: [] }, true))
      .toThrow('almeno una fotografia');
    expect(validateWeddingStoryInput({ title: 'Anna e Luca', story: 'x'.repeat(300), selectedPhotoIds: ['p1'] }, true).selectedPhotoIds)
      .toEqual(['p1']);
  });

  it('removes private and operational references from the public projection', () => {
    const publicStory = toPublicWeddingStory({
      id: 'g1', galleryId: 'g1', jobId: 'j1', status: 'published', slug: 'anna-luca',
      title: 'Anna e Luca', excerpt: 'Una giornata', story: 'Racconto', seoTitle: '', seoDescription: '',
      selectedPhotoIds: ['p1'], approvedSourceIds: ['submission:field'],
    }, [{ id: 'p1', name: 'foto.jpg', url: 'https://example.com/foto.jpg' }]);

    expect(publicStory).not.toHaveProperty('approvedSourceIds');
    expect(publicStory).not.toHaveProperty('selectedPhotoIds');
    expect(publicStory).not.toHaveProperty('jobId');
    expect(publicStory).not.toHaveProperty('galleryId');
    expect(publicStory.photos).toHaveLength(1);
  });

  it('creates stable, URL-safe slugs', () => {
    expect(slugifyWeddingStory('  Il Matrimonio di Anna & Luca! ')).toBe('il-matrimonio-di-anna-luca');
  });
});
