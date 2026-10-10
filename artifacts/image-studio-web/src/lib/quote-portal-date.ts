type QuotePortalDate = Date | string | number | { toDate(): Date } | null | undefined;

/** Returns today's calendar date in the studio's time zone for a date input. */
export function getQuoteManualSignatureDateValue(now: Date = new Date()): string {
  const parts = new Map(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Europe/Rome',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(now)
      .map(({ type, value }) => [type, value])
  );
  const year = parts.get('year');
  const month = parts.get('month');
  const day = parts.get('day');

  if (!year || !month || !day) {
    throw new Error('Impossibile determinare la data italiana per la firma manuale');
  }

  return `${year}-${month}-${day}`;
}

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
