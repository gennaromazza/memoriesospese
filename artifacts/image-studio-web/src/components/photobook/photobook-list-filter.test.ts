import { describe, expect, it } from 'vitest';
import { filterPhotobookSections } from './photobook-list-filter';

const books = [
  {
    id: 'active',
    locked: false,
    name: 'Matrimonio Luca',
    clientName: 'Luca',
    galleryName: 'Matrimonio Luca',
    galleryId: 'gallery-1',
    jobId: 'job-1',
    currentVersion: 1,
    approval: undefined,
  },
  {
    id: 'alice',
    locked: true,
    name: 'Battesimo Alice',
    clientName: 'Famiglia Rossi',
    galleryName: 'Battesimo Alice',
    galleryId: 'gallery-2',
    jobId: 'job-2',
    currentVersion: 1,
    approval: undefined,
  },
  {
    id: 'standalone',
    locked: true,
    name: 'Album autonomo',
    clientName: 'Famiglia Bianchi',
    galleryName: undefined,
    galleryId: undefined,
    jobId: undefined,
    currentVersion: 1,
    approval: undefined,
  },
];

describe('filterPhotobookSections', () => {
  it('trova i fotolibri in coda di stampa e segnala che la coda va aperta', () => {
    const result = filterPhotobookSections(books, 'battesimo alice', 'all', new Map());
    expect(result.visibleArchivedLinkedBooks.map((book) => book.id)).toEqual(['alice']);
    expect(result.visibleArchivedStandaloneBooks).toEqual([]);
    expect(result.hasArchivedSearchMatches).toBe(true);
  });

  it('filtra anche i fotolibri autonomi archiviati', () => {
    const result = filterPhotobookSections(books, 'famiglia bianchi', 'all', new Map());
    expect(result.visibleArchivedStandaloneBooks.map((book) => book.id)).toEqual(['standalone']);
    expect(result.hasArchivedSearchMatches).toBe(true);
  });

  it('non apre la coda se la ricerca trova solo album attivi', () => {
    const result = filterPhotobookSections(books, 'luca', 'all', new Map());
    expect(result.visibleLinkedBooks.map((book) => book.id)).toEqual(['active']);
    expect(result.hasArchivedSearchMatches).toBe(false);
  });
});
