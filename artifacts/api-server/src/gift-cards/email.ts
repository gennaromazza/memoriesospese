import type { GiftCardThemeKey } from '@shared/gift-card-types';

/** Colori delle email per tema: le email non supportano i gradienti in modo affidabile. */
const EMAIL_THEMES: Record<GiftCardThemeKey, { bg: string; ink: string; sub: string; accent: string; button: string; buttonInk: string }> = {
  natale: { bg: '#6E0F1A', ink: '#FFF0CF', sub: '#E9C27A', accent: '#F2C46B', button: '#F2C46B', buttonInk: '#2B0A0E' },
  carnevale: { bg: '#30114F', ink: '#FFE9C7', sub: '#E2B8FF', accent: '#FFD36B', button: '#F08A24', buttonInk: '#2B0F47' },
  'san-valentino': { bg: '#53102A', ink: '#FFE4E1', sub: '#F4B2BE', accent: '#F9D2C6', button: '#E23B5E', buttonInk: '#FFF0F0' },
  pasqua: { bg: '#E9E3FA', ink: '#33264F', sub: '#6C5A93', accent: '#8E6FCB', button: '#8E6FCB', buttonInk: '#FFFFFF' },
  halloween: { bg: '#140B2A', ink: '#FFD9A8', sub: '#B58CE0', accent: '#FF9A2E', button: '#FF9A2E', buttonInk: '#1A0C2E' },
  classico: { bg: '#1B2C3A', ink: '#EAF0EC', sub: '#9DB3A8', accent: '#DCC48A', button: '#DCC48A', buttonInk: '#1B2C3A' },
};

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

interface StudioFooter {
  studioName: string;
  studioPhone?: string;
  studioEmail?: string;
}

function footer({ studioName, studioPhone, studioEmail }: StudioFooter): string {
  return `
    <div style="border-top:1px solid #e5e5e5;margin-top:28px;padding-top:18px;text-align:center;color:#777;font-size:12px;line-height:1.7">
      <strong>${escapeHtml(studioName)}</strong><br>
      ${studioPhone ? `${escapeHtml(studioPhone)}<br>` : ''}
      ${studioEmail ? `${escapeHtml(studioEmail)}` : ''}
    </div>`;
}

function cardBlock(p: { theme: GiftCardThemeKey; title: string; line2: string; to?: string; message?: string; code: string; validUntilLabel: string }): string {
  const t = EMAIL_THEMES[p.theme];
  return `
    <div style="background:${t.bg};color:${t.ink};border:1px solid ${t.accent};border-radius:6px;padding:26px 24px;margin:22px 0;font-family:Georgia,'Times New Roman',serif">
      <div style="font:600 10px Arial,sans-serif;letter-spacing:3px;text-transform:uppercase;color:${t.sub}">Image Studio · Gift card</div>
      <div style="font-size:30px;font-style:italic;line-height:1.1;margin:10px 0 4px">${escapeHtml(p.title)}</div>
      ${p.line2 ? `<div style="font:600 11px Arial,sans-serif;letter-spacing:2px;text-transform:uppercase;color:${t.sub}">${escapeHtml(p.line2)}</div>` : ''}
      ${p.to ? `<div style="font-size:24px;font-style:italic;color:${t.accent};margin-top:18px">Per ${escapeHtml(p.to)}</div>` : ''}
      ${p.message ? `<div style="font-size:18px;font-style:italic;line-height:1.4;margin-top:8px">“${escapeHtml(p.message)}”</div>` : ''}
      <div style="border-top:1px solid ${t.sub};margin-top:20px;padding-top:12px;font:12px 'Courier New',monospace;color:${t.sub}">
        Codice <strong style="color:${t.ink}">${escapeHtml(p.code)}</strong> · ${escapeHtml(p.validUntilLabel)}
      </div>
    </div>`;
}

function button(href: string, label: string, theme: GiftCardThemeKey): string {
  const t = EMAIL_THEMES[theme];
  return `
    <div style="text-align:center;margin:26px 0">
      <a href="${escapeHtml(href)}" style="background:${t.button};color:${t.buttonInk};padding:14px 30px;text-decoration:none;border-radius:4px;font:700 15px Arial,sans-serif;display:inline-block">${escapeHtml(label)}</a>
    </div>`;
}

export interface ReceiptEmailParams extends StudioFooter {
  theme: GiftCardThemeKey;
  buyerName: string;
  recipientName: string;
  message: string;
  title: string;
  line2: string;
  code: string;
  giftUrl: string;
  amountLabel: string;
  validUntilLabel: string;
  /** Giorno di consegna in italiano, oppure `null` se la card parte subito. */
  deliveryLabel: string | null;
  /** `true` se chi riceve avrà una sua email; altrimenti l'inoltro tocca a chi compra. */
  recipientGetsEmail: boolean;
}

export function giftCardReceiptSubject(title: string): string {
  return `La tua gift card è pronta: ${title}`;
}

export function giftCardReceiptEmail(p: ReceiptEmailParams): string {
  const delivery = p.recipientGetsEmail
    ? p.deliveryLabel
      ? `Abbiamo programmato l'invio a ${escapeHtml(p.recipientName || 'chi riceve')} per <strong>${escapeHtml(p.deliveryLabel)}</strong>, alle 8:00. Il link qui sotto resta tuo: puoi anche aprirlo prima per vedere come appare.`
      : `Abbiamo già inviato il regalo a ${escapeHtml(p.recipientName || 'chi riceve')}.`
    : `Il regalo non è ancora stato inviato a nessuno: inoltra tu il link qui sotto a ${escapeHtml(p.recipientName || 'chi vuoi')}, oppure stampalo.`;
  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#222">
      <h2 style="font-family:Georgia,serif;font-weight:normal;margin:0 0 12px">Grazie, ${escapeHtml(p.buyerName)}!</h2>
      <p style="font-size:15px;line-height:1.6">Il pagamento di <strong>${escapeHtml(p.amountLabel)}</strong> è andato a buon fine e la gift card è attiva.</p>
      ${cardBlock({ theme: p.theme, title: p.title, line2: p.line2, to: p.recipientName, message: p.message, code: p.code, validUntilLabel: p.validUntilLabel })}
      <p style="font-size:15px;line-height:1.6">${delivery}</p>
      ${button(p.giftUrl, 'Apri il regalo', p.theme)}
      <p style="font-size:13px;color:#666;line-height:1.6">Chi riceve la card sceglie il giorno dello shooting direttamente dal link, senza pagare nulla. Conserva questa email: contiene il codice.</p>
      ${footer(p)}
    </div>`;
}

export interface RecipientEmailParams extends StudioFooter {
  theme: GiftCardThemeKey;
  buyerName: string;
  recipientName: string;
  message: string;
  title: string;
  line2: string;
  code: string;
  giftUrl: string;
  validUntilLabel: string;
}

export function giftCardRecipientSubject(buyerName: string): string {
  return `${buyerName} ti ha fatto un regalo`;
}

export function giftCardRecipientEmail(p: RecipientEmailParams): string {
  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#222">
      <h2 style="font-family:Georgia,serif;font-weight:normal;margin:0 0 12px">${escapeHtml(p.recipientName ? `Ciao ${p.recipientName},` : 'Ciao,')} c'è un regalo per te</h2>
      <p style="font-size:15px;line-height:1.6"><strong>${escapeHtml(p.buyerName)}</strong> ha pensato a te con una gift card Image Studio.</p>
      ${cardBlock({ theme: p.theme, title: p.title, line2: p.line2, to: p.recipientName, message: p.message, code: p.code, validUntilLabel: p.validUntilLabel })}
      ${button(p.giftUrl, 'Apri il tuo regalo', p.theme)}
      <p style="font-size:13px;color:#666;line-height:1.6;text-align:center">Dal link scegli il giorno che preferisci. Non devi pagare nulla.</p>
      ${footer(p)}
    </div>`;
}
