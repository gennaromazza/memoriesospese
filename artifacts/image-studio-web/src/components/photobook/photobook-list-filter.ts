import type { Photobook } from '@shared/photobook-types';

export type PhotobookListFilter = 'all' | 'attention' | 'approved';

type SearchablePhotobook = Pick<
  Photobook,
  'id' | 'locked' | 'jobId' | 'galleryId' | 'name' | 'clientName' | 'galleryName' | 'approval' | 'currentVersion'
>;

export function filterPhotobookSections<T extends SearchablePhotobook>(
  books: T[],
  search: string,
  filter: PhotobookListFilter,
  pendingByBook: ReadonlyMap<string, number>,
) {
  const searchTerm = search.trim().toLocaleLowerCase();
  const matches = (book: T) => {
    const matchesSearch = !searchTerm || [
      book.name,
      book.clientName || '',
      book.galleryName || '',
      book.galleryId || '',
      book.jobId || '',
    ].some((value) => value.toLocaleLowerCase().includes(searchTerm));
    const pending = pendingByBook.get(book.id) || 0;
    const approved = book.approval?.version === book.currentVersion;
    const matchesStatus =
      filter === 'all' ||
      (filter === 'attention' && pending > 0) ||
      (filter === 'approved' && approved);
    return matchesSearch && matchesStatus;
  };

  const activeBooks = books.filter((book) => !book.locked);
  const archivedBooks = books.filter((book) => book.locked);
  const isStandalone = (book: T) => !book.jobId && !book.galleryId;
  const activeLinkedBooks = activeBooks.filter((book) => !isStandalone(book));
  const activeStandaloneBooks = activeBooks.filter(isStandalone);
  const archivedLinkedBooks = archivedBooks.filter((book) => !isStandalone(book));
  const archivedStandaloneBooks = archivedBooks.filter(isStandalone);
  const visibleArchivedLinkedBooks = archivedLinkedBooks.filter(matches);
  const visibleArchivedStandaloneBooks = archivedStandaloneBooks.filter(matches);

  return {
    activeBooks,
    archivedBooks,
    visibleLinkedBooks: activeLinkedBooks.filter(matches),
    visibleStandaloneBooks: activeStandaloneBooks.filter(matches),
    visibleArchivedLinkedBooks,
    visibleArchivedStandaloneBooks,
    hasArchivedSearchMatches: Boolean(searchTerm)
      && (visibleArchivedLinkedBooks.length > 0 || visibleArchivedStandaloneBooks.length > 0),
  };
}
