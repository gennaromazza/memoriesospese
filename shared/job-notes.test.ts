import { describe, expect, it } from 'vitest';
import type { NoteFotoItem } from './jobs-types';
import { getChangedJobNotes } from './job-notes';

const photoNote = (overrides: Partial<NoteFotoItem> = {}): NoteFotoItem =>
  ({
    id: 'photo-1',
    imageUrl: 'https://example.test/photo.jpg',
    nota: 'Nota sulla foto',
    createdAt: { seconds: 1, nanoseconds: 0 },
    ...overrides,
  }) as NoteFotoItem;

describe('getChangedJobNotes', () => {
  it('does not write either field when neither section changed', () => {
    const photos = [photoNote()];

    expect(
      getChangedJobNotes({
        originalNote: 'Nota generale',
        originalNotePerFoto: photos,
        note: 'Nota generale',
        notePerFoto: photos,
      }),
    ).toEqual({});
  });

  it('updates only the general note without replacing existing photo notes', () => {
    const photos = [photoNote()];

    expect(
      getChangedJobNotes({
        originalNote: 'Prima nota',
        originalNotePerFoto: photos,
        note: 'Nota aggiornata',
        notePerFoto: photos,
      }),
    ).toEqual({ note: 'Nota aggiornata' });
  });

  it('updates only photo notes without replacing an existing general note', () => {
    const originalPhotos = [photoNote()];
    const changedPhotos = [photoNote({ nota: 'Descrizione aggiornata' })];

    expect(
      getChangedJobNotes({
        originalNote: 'Nota generale da mantenere',
        originalNotePerFoto: originalPhotos,
        note: 'Nota generale da mantenere',
        notePerFoto: changedPhotos,
      }),
    ).toEqual({ notePerFoto: changedPhotos });
  });

  it('saves both sections together when both are new or changed', () => {
    const photos = [photoNote()];

    expect(
      getChangedJobNotes({
        note: 'Nuova nota generale',
        notePerFoto: photos,
      }),
    ).toEqual({ note: 'Nuova nota generale', notePerFoto: photos });
  });

  it('sends explicit empty values only when an existing section is intentionally cleared', () => {
    expect(
      getChangedJobNotes({
        originalNote: 'Da cancellare',
        originalNotePerFoto: [photoNote()],
        note: '',
        notePerFoto: [],
      }),
    ).toEqual({ note: '', notePerFoto: [] });
  });
});