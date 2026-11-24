import { vademecumForCampaign, vademecumUrl } from '@shared/seasonal-vademecum';

/**
 * Blocco da inserire nelle email ai clienti: invita a leggere il vademecum della stagione.
 * Stringa vuota se la campagna non ne ha uno (per le email si conosce solo il nome della campagna).
 */
export function vademecumEmailBlock(campaignName: string): string {
  const vademecum = vademecumForCampaign({ nome: campaignName });
  if (!vademecum) return '';
  const url = vademecumUrl(vademecum);
  return `
      <div style="margin: 24px 0; padding: 18px; border: 1px solid #e5d5c0; background: #fbf7f1; border-radius: 8px; text-align: center;">
        <p style="margin: 0 0 8px 0; font-weight: 600; color: #5c3b27;">🎄 Prima di venire a trovarci</p>
        <p style="margin: 0 0 14px 0; font-size: 14px; color: #555;">
          Abbiamo preparato un piccolo vademecum con tutto quello che serve sapere: numero di persone, animali, cambio d'abito,
          spostamenti dell'appuntamento, puntualità e durata dello shooting.
        </p>
        <a href="${url}" style="display: inline-block; background: #8b5a3c; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold;">
          Leggi il vademecum di Natale
        </a>
        <p style="margin: 12px 0 0 0; font-size: 12px; color: #888; word-break: break-all;">${url}</p>
      </div>`;
}
