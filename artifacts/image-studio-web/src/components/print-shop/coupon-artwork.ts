export type CouponArtworkTemplateId = 'contact-sheet' | 'darkroom' | 'gallery-label' | 'field-notes';

export type CouponPlacementId =
  | 'instagram-organic-34'
  | 'instagram-organic-square'
  | 'meta-feed-45'
  | 'meta-feed-square'
  | 'stories-reels'
  | 'whatsapp-status'
  | 'whatsapp-channel-square'
  | 'whatsapp-channel-45';

export interface CouponArtworkData {
  code: string;
  discountType: 'percentage' | 'fixed' | 'fixed_total';
  value: number;
  endsAt: string;
  minPrintQuantity: number;
  scope: 'all' | 'selected';
  eligibleFormats: readonly string[];
}

export interface CouponArtworkPlacement {
  id: CouponPlacementId;
  channel: string;
  format: string;
  width: number;
  height: number;
  qualification?: string;
}

export interface CouponArtworkAssetMetadata {
  templateId: CouponArtworkTemplateId;
  placementId: CouponPlacementId;
  width: number;
  height: number;
  mimeType: 'image/jpeg';
}

export const COUPON_ARTWORK_TEMPLATES: ReadonlyArray<{
  id: CouponArtworkTemplateId;
  name: string;
  note: string;
}> = [
  { id: 'contact-sheet', name: 'Provino', note: 'Caldo, fotografico, a contatto' },
  { id: 'darkroom', name: 'Camera oscura', note: 'Notturno, ad alto contrasto' },
  { id: 'gallery-label', name: 'Etichetta editoriale', note: 'Pulita, essenziale' },
  { id: 'field-notes', name: 'Taccuino', note: 'Materico, da studio' },
];

export const COUPON_ARTWORK_PLACEMENTS: ReadonlyArray<CouponArtworkPlacement> = [
  { id: 'instagram-organic-34', channel: 'Instagram organico', format: '3:4 · 1080 × 1440', width: 1080, height: 1440 },
  { id: 'instagram-organic-square', channel: 'Instagram organico', format: '1:1 · 1080 × 1080', width: 1080, height: 1080 },
  { id: 'meta-feed-45', channel: 'Meta / Instagram Ads', format: '4:5 · 1080 × 1350', width: 1080, height: 1350 },
  { id: 'meta-feed-square', channel: 'Meta / Instagram Ads', format: '1:1 · 1080 × 1080', width: 1080, height: 1080 },
  { id: 'stories-reels', channel: 'Stories / Reels', format: '9:16 · 1080 × 1920', width: 1080, height: 1920 },
  { id: 'whatsapp-status', channel: 'WhatsApp Status', format: '9:16 · 1080 × 1920', width: 1080, height: 1920 },
  {
    id: 'whatsapp-channel-square',
    channel: 'WhatsApp Channel',
    format: '1:1 · anteprima crop compatibile',
    width: 1080,
    height: 1080,
    qualification: 'Crop compatibile per un post immagine. WhatsApp non pubblica qui un requisito ufficiale di dimensione.',
  },
  {
    id: 'whatsapp-channel-45',
    channel: 'WhatsApp Channel',
    format: '4:5 · anteprima crop compatibile',
    width: 1080,
    height: 1350,
    qualification: 'Crop compatibile per un post immagine. WhatsApp non pubblica qui un requisito ufficiale di dimensione.',
  },
];

const palettes: Record<CouponArtworkTemplateId, {
  bg: string; ink: string; accent: string; paper: string; soft: string;
}> = {
  'contact-sheet': { bg: '#e8ded0', ink: '#273b3c', accent: '#bd684f', paper: '#f6f0e7', soft: '#d4c6b4' },
  darkroom: { bg: '#213638', ink: '#f1e9d9', accent: '#d98963', paper: '#31494a', soft: '#476161' },
  'gallery-label': { bg: '#efe9dd', ink: '#303d3c', accent: '#a85e4d', paper: '#faf7f0', soft: '#d8d0c2' },
  'field-notes': { bg: '#dce5df', ink: '#324742', accent: '#b45c47', paper: '#f5f1e6', soft: '#c3d1c7' },
};

function xml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
  })[character] || character);
}

export function formatCouponOffer(coupon: CouponArtworkData): string {
  if (coupon.discountType === 'percentage') return `${coupon.value}%`;
  const euros = (coupon.value / 100).toLocaleString('it-IT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${euros} €`;
}

export function formatCouponOfferCaption(coupon: CouponArtworkData): string {
  if (coupon.discountType === 'fixed_total') {
    return coupon.minPrintQuantity > 0
      ? `PREZZO FINALE · ${coupon.minPrintQuantity} STAMPE`
      : 'PREZZO FINALE PROMOZIONALE';
  }
  if (coupon.discountType === 'fixed') return 'DI SCONTO MASSIMO SULLE STAMPE';
  return 'DI SCONTO SULLE STAMPE';
}

export function formatCouponOfferSummary(coupon: CouponArtworkData): string {
  if (coupon.discountType === 'percentage') return `${coupon.value}% di sconto sulle stampe`;
  const amount = (coupon.value / 100).toLocaleString('it-IT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (coupon.discountType === 'fixed_total') {
    return coupon.minPrintQuantity > 0
      ? `${coupon.minPrintQuantity} stampe a ${amount} €`
      : `Prezzo promozionale: ${amount} €`;
  }
  return `Fino a ${amount} € di sconto sulle stampe`;
}

export function formatCouponTerms(coupon: CouponArtworkData): string[] {
  const expiry = Number.isNaN(new Date(coupon.endsAt).getTime())
    ? 'Scadenza da definire'
    : `Valido fino al ${new Date(coupon.endsAt).toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' })}`;
  const quantity = coupon.minPrintQuantity > 0
    ? coupon.discountType === 'fixed_total'
      ? `Solo ${coupon.minPrintQuantity} stampe esatte`
      : `Da almeno ${coupon.minPrintQuantity} ${coupon.minPrintQuantity === 1 ? 'stampa' : 'stampe'}`
    : 'Senza minimo di stampe';
  const formats = coupon.scope === 'all'
    ? 'Su tutti i formati'
    : coupon.eligibleFormats.length
      ? `Formati inclusi: ${coupon.eligibleFormats.join(', ')}`
      : 'Su formati selezionati';
  return [expiry, quantity, formats];
}

function textElement(text: string, x: number, y: number, size: number, color: string, opts = ''): string {
  return `<text x="${x}" y="${y}" fill="${color}" font-size="${size}" ${opts}>${xml(text)}</text>`;
}

function wrapText(input: string, maxLength: number): string[] {
  const words = input.split(/\s+/).filter(Boolean).flatMap(word =>
    word.match(new RegExp(`.{1,${maxLength}}`, 'gu')) || [],
  );
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxLength && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** Keeps every condition above the footer; long format lists use an explicit, accurate summary. */
export function layoutCouponArtworkTerms(coupon: CouponArtworkData, placement: CouponArtworkPlacement) {
  const { width, height } = placement;
  const story = height / width > 1.6;
  const margin = story ? 94 : 76;
  const fontSize = width === height ? 27 : 29;
  const lineHeight = fontSize + 14;
  const startY = height * (story ? 0.45 : 0.44) + (story ? 350 : 340);
  const footerY = height - margin - (story ? 72 : 54);
  const bottomY = Math.min(footerY - 42, story ? height - 230 : Infinity);
  const maxLines = Math.max(1, Math.floor((bottomY - startY - fontSize * 0.3) / lineHeight) + 1);
  const lineMax = width === height ? 34 : 39;
  const terms = formatCouponTerms(coupon);
  let lines = terms.flatMap(term => wrapText(term, lineMax));
  const compact = lines.length > maxLines;
  if (compact) {
    const formats = coupon.scope === 'all'
      ? 'Su tutti i formati'
      : coupon.eligibleFormats.length
        ? `Su ${coupon.eligibleFormats.length} formati inclusi`
        : 'Su formati selezionati';
    lines = [terms[0], terms[1], formats].flatMap(term => wrapText(term, lineMax));
  }
  return { lines, compact, fontSize, lineHeight, startY, bottomY, footerY };
}

/** Builds a standalone SVG, used identically for the live preview and image export. */
export function createCouponArtworkSvg(
  coupon: CouponArtworkData,
  templateId: CouponArtworkTemplateId,
  placement: CouponArtworkPlacement,
  options: { showGuides?: boolean } = {},
): string {
  const { width: w, height: h } = placement;
  const palette = palettes[templateId];
  const story = h / w > 1.6;
  const margin = story ? 94 : 76;
  const cx = w / 2;
  const centerY = story ? h * 0.45 : h * 0.44;
  const offer = formatCouponOffer(coupon);
  const offerCaption = formatCouponOfferCaption(coupon);
  const code = coupon.code.trim().toUpperCase() || 'IL TUO CODICE';
  const codeBoxWidth = Math.min(w - margin * 2 - 140, Math.max(400, code.length * 22));
  const codeSpacing = code.length > 18 ? 1 : 3;
  const codeFont = Math.min(31, Math.max(12, Math.floor((codeBoxWidth - 48 - codeSpacing * code.length) / (code.length * 0.65))));
  const termsLayout = layoutCouponArtworkTerms(coupon, placement);
  const offerFont = offer.length > 8 ? 112 : offer.length > 5 ? 144 : 184;
  const commonText = `font-family="DM Sans, Arial, sans-serif"`;
  const serifText = `font-family="Playfair Display, Georgia, serif"`;
  let art = '';

  if (templateId === 'contact-sheet') {
    art = `
      <rect width="${w}" height="${h}" fill="${palette.bg}"/>
      <rect x="${margin / 2}" y="${margin / 2}" width="${w - margin}" height="${h - margin}" rx="5" fill="${palette.paper}"/>
      <rect x="${margin}" y="${margin}" width="${w - margin * 2}" height="${h - margin * 2}" rx="3" fill="${palette.bg}" stroke="${palette.soft}" stroke-width="2"/>
      <path d="M ${margin + 24} ${margin} v ${h - margin * 2} M ${w - margin - 24} ${margin} v ${h - margin * 2}" stroke="${palette.soft}" stroke-width="3" stroke-dasharray="3 17"/>
      <rect x="${margin + 50}" y="${margin + 48}" width="${w - margin * 2 - 100}" height="${h - margin * 2 - 96}" fill="${palette.paper}"/>
      <circle cx="${w - margin - 94}" cy="${margin + 100}" r="24" fill="${palette.accent}"/>
        ${textElement('UN VANTAGGIO PER I TUOI RICORDI', cx, margin + 112, 20, palette.ink, `${commonText} text-anchor="middle" letter-spacing="3"`)}
      <path d="M ${cx - 100} ${centerY - 210} h 200" stroke="${palette.accent}" stroke-width="3"/>
        ${textElement('Dai più spazio', cx, centerY - 143, 38, palette.ink, `${serifText} text-anchor="middle" font-style="italic"`)}
        ${textElement('AI TUOI RICORDI', cx, centerY - 98, 27, palette.ink, `${commonText} text-anchor="middle" letter-spacing="4"`)}
      ${textElement(offer, cx, centerY + 95, offerFont, palette.accent, `${serifText} text-anchor="middle" font-weight="600"`)}
        ${textElement(offerCaption, cx, centerY + 145, 20, palette.ink, `${commonText} text-anchor="middle" letter-spacing="2"`)}
        ${textElement('CODICE COUPON', cx, centerY + 195, 16, palette.ink, `${commonText} text-anchor="middle" letter-spacing="3"`)}
       <rect x="${cx - codeBoxWidth / 2}" y="${centerY + 210}" width="${codeBoxWidth}" height="74" rx="37" fill="${palette.ink}"/>
        ${textElement(code, cx, centerY + 258, codeFont, palette.paper, `${commonText} text-anchor="middle" font-weight="700" letter-spacing="${codeSpacing}"`)}
        ${textElement('INSERISCILO NEL CARRELLO', cx, centerY + 307, 17, palette.ink, `${commonText} text-anchor="middle" letter-spacing="2"`)}
    `;
  } else if (templateId === 'darkroom') {
    art = `
      <rect width="${w}" height="${h}" fill="${palette.bg}"/>
      <path d="M0 ${h * 0.17} C ${w * 0.35} ${h * 0.06}, ${w * 0.72} ${h * 0.28}, ${w} ${h * 0.12} V ${h * 0.43} C ${w * 0.64} ${h * 0.32}, ${w * 0.33} ${h * 0.49}, 0 ${h * 0.37} Z" fill="${palette.soft}" opacity=".36"/>
      <circle cx="${w * 0.82}" cy="${h * 0.22}" r="${w * 0.19}" fill="${palette.accent}" opacity=".16"/>
      <rect x="${margin}" y="${margin}" width="${w - margin * 2}" height="${h - margin * 2}" rx="24" fill="none" stroke="${palette.soft}" stroke-width="2"/>
       ${textElement('IMAGE STUDIO FOTOGRAFICO', margin + 30, margin + 64, 20, palette.ink, `${commonText} letter-spacing="3"`)}
        ${textElement('Le tue foto', cx, centerY - 160, 38, palette.ink, `${commonText} text-anchor="middle"`)}
        ${textElement('meritano la stampa.', cx, centerY - 104, 58, palette.ink, `${serifText} text-anchor="middle" font-style="italic"`)}
      ${textElement(offer, cx, centerY + 90, offerFont + 10, palette.accent, `${serifText} text-anchor="middle" font-weight="600"`)}
       ${textElement(offerCaption, cx, centerY + 140, 19, palette.ink, `${commonText} text-anchor="middle" letter-spacing="2"`)}
       <path d="M ${cx - 185} ${centerY + 190} h 370" stroke="${palette.accent}" stroke-width="2"/>
        ${textElement('CODICE COUPON', cx, centerY + 218, 16, palette.ink, `${commonText} text-anchor="middle" letter-spacing="3"`)}
        ${textElement(code, cx, centerY + 260, codeFont, palette.ink, `${commonText} text-anchor="middle" font-weight="700" letter-spacing="${codeSpacing}"`)}
        ${textElement('INSERISCILO NEL CARRELLO', cx, centerY + 307, 17, palette.ink, `${commonText} text-anchor="middle" letter-spacing="2"`)}
    `;
  } else if (templateId === 'gallery-label') {
    art = `
      <rect width="${w}" height="${h}" fill="${palette.paper}"/>
      <rect x="${margin}" y="${margin}" width="${w - margin * 2}" height="${h - margin * 2}" fill="none" stroke="${palette.ink}" stroke-width="2"/>
      <rect x="${margin + 16}" y="${margin + 16}" width="${w - margin * 2 - 32}" height="${h - margin * 2 - 32}" fill="none" stroke="${palette.soft}" stroke-width="2"/>
      <rect x="${margin + 44}" y="${margin + 44}" width="92" height="8" fill="${palette.accent}"/>
      ${textElement('IMAGE STUDIO', margin + 44, margin + 100, 23, palette.ink, `${commonText} letter-spacing="5"`)}
       ${textElement('STAMPE FOTOGRAFICHE', margin + 44, margin + 136, 16, palette.ink, `${commonText} letter-spacing="3" opacity=".75"`)}
       ${textElement('Stampa i tuoi', cx, centerY - 150, 44, palette.ink, `${serifText} text-anchor="middle" font-style="italic"`)}
       ${textElement('ricordi più belli.', cx, centerY - 94, 44, palette.ink, `${serifText} text-anchor="middle" font-style="italic"`)}
      <path d="M ${cx - 60} ${centerY - 44} h 120" stroke="${palette.accent}" stroke-width="2"/>
      ${textElement(offer, cx, centerY + 100, offerFont, palette.accent, `${serifText} text-anchor="middle" font-weight="600"`)}
       ${textElement(offerCaption, cx, centerY + 148, 19, palette.ink, `${commonText} text-anchor="middle" letter-spacing="2"`)}
       ${textElement('CODICE COUPON', cx, centerY + 203, 15, palette.ink, `${commonText} text-anchor="middle" letter-spacing="3" opacity=".82"`)}
        ${textElement(code, cx, centerY + 248, codeFont, palette.ink, `${commonText} text-anchor="middle" font-weight="700" letter-spacing="${codeSpacing}"`)}
        ${textElement('INSERISCILO NEL CARRELLO', cx, centerY + 300, 16, palette.ink, `${commonText} text-anchor="middle" letter-spacing="2"`)}
    `;
  } else {
    art = `
      <rect width="${w}" height="${h}" fill="${palette.bg}"/>
      <path d="M ${margin + 18} ${margin} H ${w - margin} V ${h - margin} H ${margin} V ${margin + 22}" fill="${palette.paper}" stroke="${palette.soft}" stroke-width="3"/>
      <path d="M ${margin + 18} ${margin} l 22 22 h -22 Z" fill="${palette.soft}"/>
      <circle cx="${w - margin - 76}" cy="${margin + 80}" r="39" fill="${palette.accent}"/>
       ${textElement('UN’IDEA PER TE', margin + 62, margin + 85, 20, palette.ink, `${commonText} letter-spacing="3"`)}
       ${textElement('Le tue foto più belle', cx, centerY - 140, 40, palette.ink, `${serifText} text-anchor="middle" font-style="italic"`)}
       ${textElement('da tenere con te.', cx, centerY - 88, 32, palette.ink, `${commonText} text-anchor="middle"`)}
      ${textElement(offer, cx, centerY + 93, offerFont, palette.accent, `${serifText} text-anchor="middle" font-weight="600"`)}
       ${textElement(offerCaption, cx, centerY + 142, 19, palette.ink, `${commonText} text-anchor="middle" letter-spacing="2"`)}
      <path d="M ${cx - 170} ${centerY + 184} h 340" stroke="${palette.soft}" stroke-width="2" stroke-dasharray="8 8"/>
        ${textElement('CODICE COUPON', cx, centerY + 213, 15, palette.ink, `${commonText} text-anchor="middle" letter-spacing="3"`)}
        ${textElement(code, cx, centerY + 257, codeFont, palette.ink, `${commonText} text-anchor="middle" font-weight="700" letter-spacing="${codeSpacing}"`)}
        ${textElement('INSERISCILO NEL CARRELLO', cx, centerY + 307, 16, palette.ink, `${commonText} text-anchor="middle" letter-spacing="2"`)}
    `;
  }

  const details = termsLayout.lines.map((line, index) =>
    textElement(line, cx, termsLayout.startY + index * termsLayout.lineHeight, termsLayout.fontSize, palette.ink, `${commonText} text-anchor="middle"`)
  ).join('');
  const footerY = termsLayout.footerY;
  const safeTop = story ? 230 : margin + 150;
  const safeBottom = story ? h - 230 : h - margin - 120;
  const channelNotes = `${textElement(termsLayout.compact ? 'IMAGESTUDIOFOTOGRAFICO.COM' : 'IMAGE STUDIO  ·  STAMPE FOTOGRAFICHE', cx, footerY, 19, palette.ink, `${commonText} text-anchor="middle" letter-spacing="3" opacity=".76"`)}`;
  const overlays = `
    <g>${details}</g>
    <g>${channelNotes}</g>
    ${story && options.showGuides ? `<rect x="${margin}" y="${safeTop}" width="${w - margin * 2}" height="${safeBottom - safeTop}" fill="none" stroke="${palette.accent}" stroke-width="2" stroke-dasharray="9 11" opacity=".24"/>` : ''}
  `;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${art}${overlays}</svg>`;
}

export async function createCouponArtworkBlob(
  coupon: CouponArtworkData,
  templateId: CouponArtworkTemplateId,
  placement: CouponArtworkPlacement,
): Promise<Blob> {
  const svg = createCouponArtworkSvg(coupon, templateId, placement);
  const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const objectUrl = URL.createObjectURL(svgBlob);
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = objectUrl;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = placement.width;
    canvas.height = placement.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas non disponibile per esportare il coupon.');
    context.fillStyle = palettes[templateId].bg;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Esportazione JPEG non riuscita.')), 'image/jpeg', 0.9);
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
