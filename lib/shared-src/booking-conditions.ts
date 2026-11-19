import { vademecumForCampaign } from './seasonal-vademecum.js';

type CampaignLike = { nome?: string | null; temaStagionale?: string | null } | null | undefined;
export interface BookingConditions { version: string; text: string }

// Condizioni generali (cambio appuntamento fino a 24 ore prima). Testo storico: non va modificato,
// perche' le prenotazioni gia' fatte ne conservano una copia e l'annullamento online la confronta.
export const BOOKING_CONDITIONS_VERSION = 'shooting-2026-11-v1';
export const BOOKING_CONDITIONS_TEXT = 'Puoi annullare dal link personale prima dell’inizio dello shooting. L’annullamento libera l’orario, ma non avvia né esclude automaticamente un rimborso: lo studio valuta l’acconto e ti comunica l’esito. Puoi cambiare autonomamente appuntamento una sola volta, nella stessa campagna, fino a 24 ore prima. Dopo questi termini contatta lo studio.';

// Natale 2026: il cambio appuntamento e' possibile fino a 4 giorni prima, come scritto nel vademecum.
export const BOOKING_CONDITIONS_NATALE_2026_VERSION = 'shooting-natale-2026-v1';
export const BOOKING_CONDITIONS_NATALE_2026_TEXT = 'Puoi annullare dal link personale prima dell’inizio dello shooting. L’annullamento libera l’orario, ma non avvia né esclude automaticamente un rimborso: lo studio valuta l’acconto e ti comunica l’esito. Puoi cambiare autonomamente appuntamento una sola volta, nella stessa campagna, fino a 4 giorni prima dello shooting, come indicato nel vademecum di Natale. Dopo questi termini contatta lo studio.';

const GENERAL: BookingConditions = { version: BOOKING_CONDITIONS_VERSION, text: BOOKING_CONDITIONS_TEXT };
const NATALE_2026: BookingConditions = { version: BOOKING_CONDITIONS_NATALE_2026_VERSION, text: BOOKING_CONDITIONS_NATALE_2026_TEXT };
const REGISTRY = [GENERAL, NATALE_2026];

/** Le condizioni che valgono per una campagna: quelle di Natale 2026 oppure le generali. */
export function bookingConditionsFor(campaign: CampaignLike): BookingConditions {
  return vademecumForCampaign(campaign) ? { ...NATALE_2026 } : { ...GENERAL };
}

/**
 * Snapshot da salvare sulla prenotazione. Il cliente invia la versione che ha visto; se non e' una versione
 * conosciuta non si salva nulla. Il testo salvato e' sempre quello della campagna (la fonte e' il server).
 */
export function bookingConditionsSnapshot(version: unknown, campaign?: CampaignLike): BookingConditions | null {
  if (!REGISTRY.some(entry => entry.version === version)) return null;
  if (campaign === undefined) return { ...REGISTRY.find(entry => entry.version === version)! };
  return bookingConditionsFor(campaign);
}

/** Vero se versione e testo salvati corrispondono a una versione registrata (annullamento online). */
export function isKnownBookingConditions(saved: unknown): saved is BookingConditions {
  const value = saved as Partial<BookingConditions> | null | undefined;
  return !!value && REGISTRY.some(entry => entry.version === value.version && entry.text === value.text);
}
