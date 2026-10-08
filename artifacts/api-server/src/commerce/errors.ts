/**
 * Errore HTTP condiviso dai moduli di vendita online (stampe e shop).
 * Il negozio stampe lo riesporta come `PrintShopHttpError`: è la stessa classe,
 * quindi i controlli `instanceof` esistenti continuano a riconoscerlo.
 */
export class CommerceHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'CommerceHttpError';
  }
}
