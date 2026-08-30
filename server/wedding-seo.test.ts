import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./firebase-admin.js', () => ({
  db: {
    collection: () => ({
      doc: () => ({
        get: async () => ({
          exists: true,
          data: () => ({
            lookupVersion: 2,
            matched: false,
            checkedAt: { toMillis: () => Date.now() },
          }),
        }),
      }),
    }),
  },
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
  MAX_WEDDING_DRAFT_ATTEMPTS,
  MAX_WEDDING_STORY_PHOTOS,
  slugifyWeddingStory,
  toPublicWeddingStory,
  validateWeddingVendorSearchResult,
  validateWeddingStoryInput,
} from './wedding-seo';

function weddingDraft(story: string) {
  return {
    title: 'Anna e Luca, un matrimonio fotografico ad Aversa',
    excerpt: 'Il racconto fotografico del matrimonio di Anna e Luca ad Aversa.',
    story,
    seoTitle: 'Matrimonio Anna e Luca ad Aversa',
    seoDescription: 'Il reportage fotografico del matrimonio di Anna e Luca ad Aversa realizzato da Image Studio.',
  };
}

function repeatedWords(count: number): string {
  return Array.from({ length: count }, (_, index) => `gesto${index}`).join(' ');
}

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
      story: `## Il racconto di Anna e Luca\nImage Studio ha seguito la continuità visiva della giornata con un reportage fotografico essenziale. ${repeatedWords(250)}`,
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
      story: `## Il racconto di Anna e Luca\nImage Studio ha seguito la giornata attraverso un reportage fotografico discreto. ${repeatedWords(250)}`,
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

  it('accepts navata only when a church-related photo was actually prepared for Gemini', async () => {
    const generated = weddingDraft(
      `## Il passaggio nella chiesa\nNella navata Image Studio ha seguito la continuità del racconto fotografico. ${repeatedWords(250)}`,
    );
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({
      choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(generated) } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(generateWeddingDraftWithGemini({
      gallery: { id: 'gallery-church', name: 'Anna e Luca' },
      sources: [],
      photos: [{
        id: 'ceremony-photo',
        base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZVZsAAAAASUVORK5CYII=',
        contentType: 'image/png',
        chapterTitle: 'Cerimonia',
      }],
      jobFacts: {
        coupleNames: ['Anna Rossi', 'Luca Bianchi'],
        ceremonyVenue: 'Chiesa di San Paolo',
        ceremonyPlaceType: 'church',
        clientCities: [],
      },
      apiKey: 'test-key',
    })).resolves.toEqual(generated);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('stops after the configured number of editorial attempts when every draft stays too short', async () => {
    const shortDraft = weddingDraft('## Un testo incompleto\nImage Studio ha seguito il matrimonio.');
    const completion = new Response(JSON.stringify({
      choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(shortDraft) } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const fetchMock = vi.fn().mockImplementation(async () => completion.clone());
    vi.stubGlobal('fetch', fetchMock);

    await expect(generateWeddingDraftWithGemini({
      gallery: { id: 'gallery-short', name: 'Anna e Luca' },
      sources: [],
      photos: [],
      jobFacts: null,
      apiKey: 'test-key',
    })).rejects.toThrow('dopo 2 correzioni automatiche');

    expect(fetchMock).toHaveBeenCalledTimes(MAX_WEDDING_DRAFT_ATTEMPTS);
  });

  it('corrects roles, location claims, schedules and length across three editorial attempts', async () => {
    const vendorSource = {
      id: 'legacy-vendors:vendors',
      submissionId: 'legacy-vendors',
      fieldId: 'vendors',
      label: 'Quali fornitori avete scelto?',
      value: 'gruppo Arechi, kadoa, Passaro, Bruno della Vecchia',
      clientName: 'Anna',
      category: 'vendor' as const,
      consentGranted: true,
      legacyImported: true,
    };
    const photos = Array.from({ length: 4 }, (_, index) => ({
      id: `p${index + 1}`,
      base64: 'aGVsbG8=',
      contentType: 'image/png',
      chapterTitle: 'Festa',
    }));
    const firstDraft = weddingDraft(
      `## Un programma operativo\nLe attività sono iniziate alle 10:30 e sono proseguite alle 12:00. ` +
      `Punta Castello, sulla costa, ha accolto la coppia. Il wedding planner Bruno della Vecchia ha coordinato i tempi. ` +
      `Kadoa ha curato i fiori, gli abiti di Passaro hanno completato la scena e gruppo Arechi ha accompagnato la musica. ` +
      `Image Studio ha seguito il matrimonio. ${repeatedWords(710)}`,
    );
    const secondDraft = weddingDraft(
      `## Dentro la scena\nNella navata Image Studio ha seguito la continuità del racconto. ` +
      `Tra le realtà scelte dalla coppia figurano gruppo Arechi, kadoa, Passaro e Bruno della Vecchia. ` +
      repeatedWords(500),
    );
    const finalDraft = weddingDraft(
      `## Un racconto costruito sui gesti\nImage Studio ha seguito il matrimonio con un reportage discreto. ` +
      `Tra le realtà scelte dalla coppia figurano gruppo Arechi, kadoa, Passaro e Bruno della Vecchia. ` +
      repeatedWords(710),
    );
    const completion = (draft: ReturnType<typeof weddingDraft>) => new Response(JSON.stringify({
      choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(draft) } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(completion(firstDraft))
      .mockResolvedValueOnce(completion(secondDraft))
      .mockResolvedValueOnce(completion(finalDraft));
    vi.stubGlobal('fetch', fetchMock);

    await expect(generateWeddingDraftWithGemini({
      gallery: { id: 'gallery-1', name: 'Anna e Luca' },
      sources: [vendorSource],
      photos,
      jobFacts: null,
      apiKey: 'test-key',
    })).resolves.toEqual(finalDraft);

    expect(MAX_WEDDING_DRAFT_ATTEMPTS).toBe(3);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const secondRequest = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    const firstRevision = String(secondRequest.messages.at(-1)?.content || '');
    expect(firstRevision).toContain('usa troppi orari e dettagli operativi');
    expect(firstRevision).toContain('sulla costa');
    expect(firstRevision).toContain('attribuisce ruoli non verificati ai fornitori');
    expect(firstRevision).toContain('Tra le realtà scelte dalla coppia figurano gruppo Arechi, kadoa, Passaro e Bruno della Vecchia.');

    const thirdRequest = JSON.parse(String(fetchMock.mock.calls[2][1]?.body));
    const secondRevision = String(thirdRequest.messages.at(-1)?.content || '');
    expect(secondRevision).toContain('racconto troppo breve');
    expect(secondRevision).toContain('navata');
    expect(secondRevision).toContain('usa troppi orari e dettagli operativi');
    expect(secondRevision).toContain('attribuisce ruoli non verificati ai fornitori');
    expect(secondRevision).toContain('punta a 900-1100 parole');
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
      preparedPhotoCount: 4,
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
    expect(prompt).toContain('900-1200 parole');
    expect(prompt).toContain('punta ad almeno 900 parole');
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
      coupleSurnames: ['Martinelli', 'Fabozzi'],
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

  it('accepts navata only when the selected material contains real ceremony-photo evidence', () => {
    const draft = { story: 'La navata è entrata nel ritmo visivo seguito da Image Studio.' };

    expect(inspectWeddingDraftQuality(draft, [], { hasChurchPhotoEvidence: true }))
      .not.toContain('attribuisce caratteristiche non documentate alle location: navata');
    expect(inspectWeddingDraftQuality(draft, [], { hasChurchPhotoEvidence: false }))
      .toContain('attribuisce caratteristiche non documentate alle location: navata');
  });

  it('distinguishes a neutral vendor credit from real role attributions', () => {
    const names = ['gruppo Arechi', 'kadoa', 'Passaro', 'Bruno della Vecchia'];
    const neutral = inspectWeddingDraftQuality({
      story: `Tra le realtà scelte dalla coppia figurano gruppo Arechi, kadoa, Passaro e Bruno della Vecchia. ` +
        `la musica è rimasta un elemento separato del racconto fotografico.`,
    }, names, { unverifiedVendorNames: names });
    expect(neutral).toEqual([]);

    const attributed = inspectWeddingDraftQuality({
      story: `Kadoa ha curato i fiori. I fiori di Kadoa hanno definito la scena. ` +
        `Bruno della Vecchia è stato il wedding planner, Passaro per gli abiti e gruppo Arechi ha accompagnato la musica.`,
    }, names, { unverifiedVendorNames: names });
    expect(attributed).toContain(
      'attribuisce ruoli non verificati ai fornitori: gruppo Arechi, kadoa, Passaro, Bruno della Vecchia',
    );

    const evasiveAttribution = inspectWeddingDraftQuality({
      story: `Tra le realtà scelte dalla coppia figurano gruppo Arechi, kadoa, Passaro e Bruno della Vecchia. ` +
        `Più tardi gruppo Arechi ha suonato e Kadoa si è occupata dei fiori.`,
    }, names, { unverifiedVendorNames: names });
    expect(evasiveAttribution).toContain(
      'cita fornitori non verificati fuori dal credito neutro: gruppo Arechi, kadoa',
    );

    const duplicatedInSeo = inspectWeddingDraftQuality({
      story: 'Tra le realtà scelte dalla coppia figurano gruppo Arechi, kadoa, Passaro e Bruno della Vecchia.',
      seoDescription: 'Tra le realtà scelte dalla coppia figurano gruppo Arechi, kadoa, Passaro e Bruno della Vecchia.',
    }, names, { unverifiedVendorNames: names });
    expect(duplicatedInSeo).toContain(
      'cita fornitori non verificati fuori dal credito neutro: gruppo Arechi, kadoa, Passaro, Bruno della Vecchia',
    );
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

  it('protects couple surnames in SEO metadata as well as in the visible article', () => {
    const issues = inspectWeddingDraftQuality({
      title: 'Il matrimonio di Biagio e Roberta',
      story: 'Image Studio ha raccontato il matrimonio di Biagio e Roberta.',
      seoTitle: 'Matrimonio Martinelli e Fabozzi',
      seoDescription: 'Il reportage fotografico di Martinelli e Fabozzi.',
    }, [], {
      privateCoupleNames: ['Biagio Martinelli', 'Roberta Fabozzi'],
      privateCoupleSurnames: ['Martinelli', 'Fabozzi'],
    });

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
    expect(prompt).toContain('punta a 900-1100 parole');
    expect(prompt).toContain('5-7 sezioni sostanziose');
    expect(prompt).toContain('soltanto JSON valido');

    const vendorPrompt = buildWeddingDraftRevisionPrompt(
      ['attribuisce ruoli non verificati ai fornitori: Passaro, Kadoa, Bruno della Vecchia'],
      { unverifiedVendorNames: ['Passaro', 'Kadoa', 'Bruno della Vecchia'] },
    );
    expect(vendorPrompt).toContain(
      'Tra le realtà scelte dalla coppia figurano Passaro, Kadoa e Bruno della Vecchia.',
    );
    expect(vendorPrompt).toContain('Non citare altrove gli stessi nomi');
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

  it('keeps a vendor-only source compact and provides one canonical neutral credit', () => {
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
    expect(prompt).toContain('300-450 parole, 2-3 sezioni');
    expect(prompt).not.toContain('900-1200 parole');
    expect(prompt).not.toContain('minimo 700');
    expect(prompt).toContain(
      'Tra le realtà scelte dalla coppia figurano Passaro, Kadoa, Bruno della Vecchia e gruppo Arechi.',
    );
    expect(prompt).toContain('Usa esattamente una volta questa frase');
  });

  it('accepts only a high-confidence wedding supplier URL supported by a Google citation', () => {
    const result = validateWeddingVendorSearchResult('Atelier Aurora', {
      matched: true,
      canonicalName: 'Atelier Aurora Sposa',
      category: 'atelier_sposa',
      role: 'Atelier di abiti da sposa',
      officialUrl: 'https://atelieraurora.example/collezioni',
      socialUrl: '',
      confidence: 0.94,
    }, ['https://atelieraurora.example/chi-siamo']);

    expect(result).toMatchObject({
      matched: true,
      role: 'Atelier di abiti da sposa',
      url: 'https://atelieraurora.example/collezioni',
    });
  });

  it('recognizes a proprietor name when cited evidence connects it to the public wedding brand', () => {
    const result = validateWeddingVendorSearchResult('Bruno della Vecchia', {
      matched: true,
      canonicalName: "L'Angolo Verde",
      matchedNameEvidence: "L'Angolo Verde di Della Vecchia Bruno ad Aversa",
      category: 'fiorista_floral_designer',
      role: 'Fiorista e floral designer',
      officialUrl: '',
      socialUrl: 'https://www.instagram.com/langoloverde_aversa/',
      confidence: 0.90,
    }, ['https://www.instagram.com/langoloverde_aversa/']);

    expect(result).toMatchObject({
      matched: true,
      name: "L'Angolo Verde",
      role: 'Fiorista e floral designer',
    });
  });

  it('rejects ambiguous, uncited or directory-only wedding supplier matches', () => {
    expect(validateWeddingVendorSearchResult('Passaro', {
      matched: true, canonicalName: 'Passaro', category: 'atelier_sposa', role: 'Atelier',
      officialUrl: 'https://passaro.example', socialUrl: '', confidence: 0.70,
    }, ['https://passaro.example'])).toBeNull();

    expect(validateWeddingVendorSearchResult('Kadoa', {
      matched: true, canonicalName: 'Kadoa', category: 'fiorista_floral_designer', role: 'Fiorista',
      officialUrl: 'https://www.matrimonio.com/kadoa', socialUrl: '', confidence: 0.98,
    }, ['https://www.matrimonio.com/kadoa'])).toBeNull();
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

  it('persists an explicit cover photo and safely falls back to the first selected photo', () => {
    const fields = { title: 'Anna e Luca', story: 'Bozza iniziale', selectedPhotoIds: ['p1', 'p2'] };

    expect(validateWeddingStoryInput({ ...fields, coverPhotoId: 'p2' }, false).coverPhotoId).toBe('p2');
    expect(validateWeddingStoryInput({ ...fields, coverPhotoId: 'photo-estranea' }, false).coverPhotoId).toBe('p1');
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
