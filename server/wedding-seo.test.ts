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
  buildWeddingEditorialJobFacts,
  inspectWeddingDraftQuality,
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
    expect(prompt).toContain("passato prossimo e imperfetto");
    expect(prompt).toContain('omettilo in silenzio');
    expect(prompt).toContain('non un riepilogo del modulo');
  });

  it('projects only safe Job facts and derives cities without exposing exact addresses', () => {
    const facts = buildWeddingEditorialJobFacts({
      nomeEvento: 'Matrimonio Biagio e Roberta',
      eventDate: new Date('2026-07-09T10:00:00Z'),
      eventLocation: 'Punta Castello',
      rituLocation: 'Monastero San Francesco ad Aversa',
      noteInterne: 'Dato segreto',
      financials: { total: 2700 },
    }, [{
      nome: 'Biagio', cognome: 'Martinelli', citta: 'Aversa',
      via: 'via Michelangelo 151', email: 'biagio@example.com', cellulare1: '3331234567',
    }, {
      nome: 'Roberta', cognome: 'Fabozzi', citta: 'Trentola Ducenta', via: 'via Marconi 6',
    }]);

    expect(facts).toMatchObject({
      coupleNames: ['Biagio Martinelli', 'Roberta Fabozzi'],
      eventDate: '2026-07-09',
      receptionVenue: 'Punta Castello',
      ceremonyVenue: 'Monastero San Francesco ad Aversa',
      ceremonyCity: 'Aversa',
      clientCities: ['Aversa', 'Trentola Ducenta'],
    });
    expect(JSON.stringify(facts)).not.toMatch(/Michelangelo|Marconi|example\.com|3331234567|Dato segreto|2700/);
  });

  it('treats selected vendors as mandatory and other answers as optional', () => {
    const prompt = buildGroqPrompt({
      gallery: { name: 'Galleria' },
      jobFacts: {
        coupleNames: ['Biagio Martinelli', 'Roberta Fabozzi'], clientCities: ['Aversa'],
        ceremonyVenue: 'Monastero San Francesco ad Aversa', ceremonyCity: 'Aversa',
      },
      sources: [
        { id: 'v', submissionId: 's', fieldId: 'v', label: 'Fornitore', value: { name: 'Kadoa', role: 'Floral designer', url: 'https://example.com' }, clientName: 'Roberta', category: 'vendor', consentGranted: true },
        { id: 'a', submissionId: 's', fieldId: 'a', label: 'Indirizzo di casa', value: 'Via Roma 12, Aversa', clientName: 'Roberta', category: 'story', consentGranted: true },
      ],
      photos: [],
    });

    expect(prompt).toContain('FORNITORI SELEZIONATI DA CITARE SEMPRE');
    expect(prompt).toContain('Kadoa');
    expect(prompt).toContain('materiale secondario e facoltativo');
    expect(prompt).toContain('Monastero San Francesco ad Aversa');
    expect(prompt).not.toContain('Via Roma 12');
    expect(prompt).not.toContain('https://example.com');
    expect(inspectWeddingDraftQuality({ story: 'Un racconto senza crediti' }, ['Kadoa']))
      .toContain('non cita i fornitori selezionati: Kadoa');
    expect(inspectWeddingDraftQuality({ story: 'Gli allestimenti floreali di Kadoa.' }, ['Kadoa']))
      .not.toContain('non cita i fornitori selezionati: Kadoa');
  });

  it('rejects operational, speculative drafts like the bad generated example', () => {
    const issues = inspectWeddingDraftQuality({
      title: 'Biagio e Roberta',
      excerpt: 'Il loro matrimonio',
      story: `## Preparativi\n\nBiagio e Roberta si prepareranno a casa. Non sono indicati ulteriori dettagli.\n\n` +
        `## Cerimonia\n\nLa cerimonia è prevista alle 15:30.\n\n` +
        `## Fornitori\n\nPassaro, probabilmente per gli abiti.`,
    });

    expect(issues).toContain('commenta informazioni mancanti o il processo editoriale');
    expect(issues).toContain('contiene inferenze non verificabili');
    expect(issues).toContain('usa il futuro o un tono da programma operativo');
    expect(issues).toContain('usa intestazioni generiche da dossier');
  });

  it('makes completed legacy submissions available to the admin migration flow', () => {
    const sources = buildAuthorizedSources([
      {
        id: 'legacy-submission',
        data: {
          status: 'completed',
          clientName: 'Anna',
          editorialConsent: false,
          templateFields: [
            { id: 'story', label: 'Il loro racconto', type: 'textarea', required: false },
            { id: 'schedule', label: 'Orario', type: 'text', required: false },
          ],
          answers: { story: 'Una risposta storica', schedule: '16:00' },
        },
      },
    ], { includeLegacy: true });

    expect(sources).toHaveLength(2);
    expect(sources.every(source => source.consentGranted && source.legacyImported)).toBe(true);
    expect(sources.map(source => source.value)).toEqual(['Una risposta storica', '16:00']);
  });

  it('does not treat modern fields explicitly disabled for editorial use as legacy', () => {
    const sources = buildAuthorizedSources([
      {
        id: 'modern-submission',
        data: {
          status: 'completed',
          clientName: 'Anna',
          editorialConsent: false,
          templateFields: [
            {
              id: 'internal',
              label: 'Indicazione operativa',
              type: 'text',
              required: false,
              editorialUse: false,
              editorialCategory: 'story',
            },
          ],
          answers: { internal: 'Non usare nel racconto' },
        },
      },
    ], { includeLegacy: true });

    expect(sources).toEqual([]);
  });

  it('does not mutate historical submissions while creating the read-only migration view', () => {
    const submission = {
      id: 'legacy-submission',
      data: {
        status: 'completed',
        clientName: 'Anna',
        templateFields: [{ id: 'story', label: 'Racconto', type: 'textarea', required: false }],
        answers: { story: 'Testo storico' },
      },
    };
    const original = structuredClone(submission);

    buildAuthorizedSources([submission], { includeLegacy: true });

    expect(submission).toEqual(original);
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
