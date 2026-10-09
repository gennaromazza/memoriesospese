type QuotePortalDate = Date | string | number | { toDate(): Date } | null | undefined;

/** Contract signature and payment dates always use the studio's time zone. */
export function formatQuotePortalDate(date: QuotePortalDate): string {
  if (!date) return '-';
  try {
    const d = typeof date === 'object' && 'toDate' in date
      ? date.toDate()
      : new Date(date as Date | string | number);
    if (isNaN(d.getTime())) return '-';
    return d.toLocaleDateString('it-IT', {
      timeZone: 'Europe/Rome',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return '-';
  }
}
