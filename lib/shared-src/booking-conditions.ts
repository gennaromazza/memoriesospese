export const BOOKING_CONDITIONS_VERSION = 'shooting-2026-11-v1';
export const BOOKING_CONDITIONS_TEXT = 'Puoi annullare dal link personale prima dell’inizio dello shooting. L’annullamento libera l’orario, ma non avvia né esclude automaticamente un rimborso: lo studio valuta l’acconto e ti comunica l’esito. Puoi cambiare autonomamente appuntamento una sola volta, nella stessa campagna, fino a 24 ore prima. Dopo questi termini contatta lo studio.';
export function bookingConditionsSnapshot(version: unknown) {
  return version === BOOKING_CONDITIONS_VERSION
    ? { version: BOOKING_CONDITIONS_VERSION, text: BOOKING_CONDITIONS_TEXT } : null;
}
