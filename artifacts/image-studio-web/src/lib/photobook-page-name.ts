/** Keep the uploaded filename visible; old pages may not have one. */
export function photobookPageName(fileName: string | null | undefined, pageNumber: number): string {
  return fileName && fileName.trim() ? fileName : `Pagina ${pageNumber}`;
}
