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
  buildWeddingDraftRevisionPrompt,
  buildGeminiMessageContent,
  buildWeddingStoryPrompt,
  buildWeddingEditorialJobFacts,
  generateWeddingDraftWithGemini,
  inspectWeddingDraftQuality,
  GEMINI_BASE_URL,
  GEMINI_MODEL,
  MAX_WEDDING_STORY_PHOTOS,
  slugifyWeddingStory,
  toPublicWeddingStory,
  validateWeddingStoryInput,
} from './wedding-seo';

describe('Real Wedding editorial safety', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('uses the direct Gemini vision model and Google OpenAI-compatible endpoint', () => {
    expect(GEMINI_BASE_URL).toBe('https://generativelanguage.googleapis.com/v1beta/openai');
    expect(GEMINI_MODEL).toBe('gemini-3.5-flash');
  });

  it('sends the generation request directly to Gemini with structured JSON enabled', async () => {
    const generated = {
      title: 'Anna e Luca, matrimonio fotografico ad Aversa',
      excerpt: 'Un racconto fotografico del matrimonio di Anna e Luca ad Aversa.',
      story: '## Il racconto di Anna e Luca\nImage Studio ha seguito la continuità visiva della giornata con un reportage fotografico essenziale.',
      seoTitle: 'Matrimonio Anna e Luca ad Aversa',
      seoDescription: 'Il reportage fotografico del matrimonio di Anna e Luca ad Aversa realizzato da Image Studio.',
    };
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(generated) } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const draft = await generateWeddingDraftWithGemini({
      gallery: { id: 'gallery-1', name: 'Anna e Luca' },
      sources: [],
      photos: [],
      jobFacts: null,
      apiKey: 'test-key',
    });

    expect(draft).toEqual(generated);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions');
    const request = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(request).toMatchObject({
      model: 'gemini-3.5-flash',
      max_tokens: 16_000,
      reasoning_effort: 'low',
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'wedding_story_draft',
          strict: true,
          schema: { required: ['title', 'excerpt', 'story', 'seoTitle', 'seoDescription'] },
        },
      },
    });
    expect(request).not.toHaveProperty('temperature');
  });

  it('retries truncated JSON without feeding the broken assistant response back to Gemini', async () => {
    const generated = {
      title: 'Anna e Luca, matrimonio fotografico ad Aversa',
      excerpt: 'Il racconto fotografico del matrimonio di Anna e Luca.',
      story: '## Il racconto di Anna e Luca\nImage Studio ha seguito la giornata attraverso un reportage fotografico discreto.',
      seoTitle: 'Matrimonio Anna e Luca ad Aversa',
      seoDescription: 'Il reportage fotografico del matrimonio di Anna e Luca ad Aversa.',
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ finish_reason: 'length', message: { content: '{"title":"Testo interrotto' } }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(generated) } }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(generateWeddingDraftWithGemini({
      gallery: { id: 'gallery-1', name: 'Anna e Luca' },
      sources: [],
      photos: [],
      jobFacts: null,
      apiKey: 'test-key',
    })).resolves.toEqual(generated);

    const retryRequest = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(retryRequest.messages).toHaveLength(1);
    expect(retryRequest.messages[0].content[0].text).toContain('risposta di Gemini è stata troncata');
    expect(JSON.stringify(retryRequest.messages)).not.toContain('Testo interrotto');
  });

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

  it('sends Gemini only the selected, consented context and safe gallery fields', () => {
    const prompt = buildWeddingStoryPrompt({
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
    expect(prompt).toContain('800-1200 parole');
    expect(prompt).toContain('approccio deve essere chiaramente fotografico');
    expect(prompt).toContain('studio fotografico di Gennaro Mazzacane');
    expect(prompt).toContain('SEO locale');
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

  it('prefers verified Job place names and cities without exposing their private address', () => {
    const facts = buildWeddingEditorialJobFacts({
      eventLocation: 'testo precedente',
      eventPlace: { name: 'Villa Verificata', city: 'Pozzuoli', province: 'NA', primaryType: 'location per matrimoni', formattedAddress: 'Via Privata 12, Pozzuoli', websiteUri: 'https://villa.example' },
      rituLocation: 'testo rito precedente',
      ceremonyPlace: { name: 'Chiesa Verificata', city: 'Aversa', formattedAddress: 'Piazza Segreta 4, Aversa' },
    }, []);

    expect(facts).toMatchObject({ receptionVenue: 'Villa Verificata', receptionCity: 'Pozzuoli', receptionProvince: 'NA', receptionPlaceType: 'location per matrimoni', ceremonyVenue: 'Chiesa Verificata', ceremonyCity: 'Aversa' });
    expect(JSON.stringify(facts)).not.toMatch(/Via Privata|Piazza Segreta|villa\.example/);
  });

  it('treats selected vendors as mandatory and other answers as optional', () => {
    const prompt = buildWeddingStoryPrompt({
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

  it('rejects unsupported geography, guest origins and roles inferred from a legacy vendor list', () => {
    const issues = inspectWeddingDraftQuality({
      story: `Gli invitati erano provenienti da Aversa e Trentola Ducenta. ` +
        `Il wedding planner Bruno della Vecchia ha coordinato i tempi. ` +
        `I fiori di Kadoa hanno decorato i tavoli e gli abiti di Passaro hanno completato l'estetica. ` +
        `Punta Castello, sulla costa, ha ospitato il ricevimento sulla spiaggia.`,
    }, ['Passaro', 'Kadoa', 'Bruno della Vecchia'], {
      allowedText: 'Punta Castello; Aversa; Trentola Ducenta',
      unverifiedVendorNames: ['Passaro', 'Kadoa', 'Bruno della Vecchia'],
    });

    expect(issues).toContain('deduce la provenienza degli invitati dalle città dei clienti');
    expect(issues.some(issue => issue.startsWith('attribuisce caratteristiche non documentate'))).toBe(true);
    expect(issues.some(issue => issue.startsWith('attribuisce ruoli non verificati'))).toBe(true);
  });

  it('rejects internal migration language and generic invented endings', () => {
    const issues = inspectWeddingDraftQuality({
      story: 'I fornitori presenti sono registrati nell’elenco storico. La serata si è conclusa con un brindisi condiviso e uno scambio di promesse.',
    }, [], { allowedText: 'Passaro; Kadoa' });

    expect(issues).toContain('espone linguaggio amministrativo o interno');
    expect(issues.some(issue => issue.startsWith('aggiunge scene o conclusioni non documentate'))).toBe(true);
  });

  it('rejects an article that ignores the requested editorial length', () => {
    const issues = inspectWeddingDraftQuality({ story: 'Un racconto fotografico troppo breve.' }, [], { minimumWords: 700 });
    expect(issues.some(issue => issue.startsWith('racconto troppo breve'))).toBe(true);
  });

  it('rejects bureaucratic photo inventories and repeated couple surnames', () => {
    const issues = inspectWeddingDraftQuality({
      title: 'Il matrimonio di Biagio Martinelli e Roberta Fabozzi',
      story: `Le attività sono state scandite da orari precisi, dalle 10:30 alle 12:00. ` +
        `Una fotografia mostra gli sposi davanti alla credenza. Un secondo scatto ritrae una persona vicino alla porta. ` +
        `La documentazione fotografica è proseguita fino alla conclusione programmata.`,
    }, [], { privateCoupleNames: ['Biagio Martinelli', 'Roberta Fabozzi'] });

    expect(issues).toContain('usa un tono tecnico o burocratico invece di uno storytelling umano');
    expect(issues).toContain('descrive le fotografie come un inventario invece di costruire un racconto');
    expect(issues).toContain('usa troppi orari e dettagli operativi');
    expect(issues).toContain('ripete i cognomi degli sposi nel testo pubblico');
  });

  it('rejects generated fields that exceed the editor limits instead of silently truncating them', () => {
    const issues = inspectWeddingDraftQuality({
      title: 'T'.repeat(141),
      excerpt: 'E'.repeat(501),
      story: 'R'.repeat(30_001),
      seoTitle: 'S'.repeat(71),
      seoDescription: 'D'.repeat(171),
    });

    expect(issues).toContain('titolo troppo lungo: 141 caratteri, massimo 140');
    expect(issues).toContain('introduzione troppo lungo: 501 caratteri, massimo 500');
    expect(issues).toContain('racconto troppo lungo: 30001 caratteri, massimo 30000');
    expect(issues).toContain('titolo SEO troppo lungo: 71 caratteri, massimo 70');
    expect(issues).toContain('descrizione SEO troppo lungo: 171 caratteri, massimo 170');
  });

  it('requires the article to reinforce the photography brand', () => {
    const issues = inspectWeddingDraftQuality({ story: 'Un racconto fotografico senza firma.' }, [], { requiredBrand: 'Image Studio' });
    expect(issues).toContain('non valorizza il brand fotografico: Image Studio');
    expect(inspectWeddingDraftQuality({ story: 'Il reportage di Image Studio.' }, [], { requiredBrand: 'Image Studio' }))
      .not.toContain('non valorizza il brand fotografico: Image Studio');
  });

  it('builds a precise automatic revision request after a rejected first draft', () => {
    const prompt = buildWeddingDraftRevisionPrompt(['racconto troppo breve: 561 parole, minimo 700']);
    expect(prompt).toContain('Riscrivila integralmente');
    expect(prompt).toContain('rispetta tassativamente i limiti di ogni campo');
    expect(prompt).toContain('racconto troppo breve: 561 parole, minimo 700');
    expect(prompt).toContain('soltanto JSON valido');
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

  it('recognizes a historical free-text supplier list as mandatory vendor material', () => {
    const sources = buildAuthorizedSources([{
      id: 'legacy-vendors',
      data: {
        status: 'completed',
        clientName: 'Roberta',
        templateFields: [{ id: 'vendors', label: 'Quali fornitori avete scelto?', type: 'text', required: false }],
        answers: { vendors: 'Passaro, Kadoa, Bruno della Vecchia, gruppo Arechi' },
      },
    }], { includeLegacy: true });

    expect(sources[0]).toMatchObject({ category: 'vendor', legacyImported: true });
    const prompt = buildWeddingStoryPrompt({ gallery: {}, sources, photos: [] });
    expect(prompt).toContain('Passaro');
    expect(prompt).toContain('gruppo Arechi');
  });

  it('keeps base64 images in the Gemini multimodal request', async () => {
    const content = await buildGeminiMessageContent('Analizza queste immagini.', [
      { base64: 'aGVsbG8=', contentType: 'image/png' },
      { url: 'not-an-image' },
    ]);

    expect(content).toEqual([
      { type: 'text', text: 'Analizza queste immagini.' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,aGVsbG8=' } },
    ]);
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

  it('keeps only the first 12 selected photographs for a Real Wedding', () => {
    const selectedPhotoIds = Array.from({ length: 15 }, (_, index) => `p${index + 1}`);
    const draft = validateWeddingStoryInput({ title: 'Anna e Luca', story: 'Bozza iniziale', selectedPhotoIds }, false);

    expect(MAX_WEDDING_STORY_PHOTOS).toBe(12);
    expect(draft.selectedPhotoIds).toEqual(selectedPhotoIds.slice(0, 12));
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
