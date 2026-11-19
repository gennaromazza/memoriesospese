/**
 * Vademecum stagionale: regole dello studio da leggere prima di prenotare e da linkare nelle email.
 * Oggi esiste solo quello di Natale 2026. Il testo completo e' nella pagina pubblica del sito.
 */
export interface SeasonalVademecum {
  id: string;
  title: string;
  /** Percorso della pagina pubblica sul sito. */
  path: string;
}

export const VADEMECUM_NATALE_2026: SeasonalVademecum = {
  id: 'natale-2026',
  title: 'Il nostro piccolo vademecum di Natale',
  path: '/vademecum-natale-2026',
};

const PUBLIC_SITE = 'https://imagestudiofotografico.com';

/** Link assoluto (per le email). */
export function vademecumUrl(vademecum: SeasonalVademecum): string {
  return `${PUBLIC_SITE}${vademecum.path}`;
}

/**
 * Quale vademecum si applica a una campagna. Natale: tema 'natale' oppure "natal…" nel nome, ma un anno
 * diverso dal 2026 nel nome (es. "Natale 2025") esclude la campagna: il vademecum e' quello del 2026.
 */
export function vademecumForCampaign(
  campaign: { nome?: string | null; temaStagionale?: string | null } | null | undefined,
): SeasonalVademecum | null {
  if (!campaign) return null;
  const name = String(campaign.nome ?? '');
  const isChristmas = campaign.temaStagionale === 'natale' || /natal/i.test(name);
  const otherYear = /\b(19|20)(?!26)\d\d\b/.test(name);
  return isChristmas && !otherYear ? VADEMECUM_NATALE_2026 : null;
}

const DAY_MS = 86_400_000;

/** Preavviso minimo per cambiare appuntamento da soli: 4 giorni per Natale 2026 (vademecum), 24 ore altrimenti. */
export function rescheduleNoticeFor(
  campaign: { nome?: string | null; temaStagionale?: string | null } | null | undefined,
): { ms: number; label: string } {
  return vademecumForCampaign(campaign) ? { ms: 4 * DAY_MS, label: '4 giorni' } : { ms: DAY_MS, label: '24 ore' };
}

/** Il modulo di prenotazione si invia solo con la privacy e, se previsto, il vademecum letto. */
export function canSubmitBooking(input: { privacyConsent: boolean; vademecumRequired: boolean; vademecumConsent: boolean }): boolean {
  return input.privacyConsent && (!input.vademecumRequired || input.vademecumConsent);
}
