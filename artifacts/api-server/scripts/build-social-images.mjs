// Small, bundled public JPEGs; no remote service or customer data required.
// Run: node artifacts/api-server/scripts/build-social-images.mjs
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const web = fileURLToPath(new URL('../../image-studio-web/', import.meta.url));
const output = path.join(web, 'public/images/social');
await mkdir(output, { recursive: true });
const cards = [
  ['blog', 'Storie e consigli', 'Il blog di Image Studio', 'public/images/image-experience/coppia-sceglie-fotografie-matrimonio-1536.webp'],
  ['portfolio', 'Portfolio', 'Fotografie da vivere', 'public/images/image-experience/image-experience-couple-walk-1536.webp'],
  ['fotografo-aversa', 'Fotografo Aversa', 'Gennaro Mazzacane', 'src/assets/DSCF7358_1_1763485862385.jpg'],
  ['storie', 'La nostra storia', 'Gennaro e Image Studio', 'src/assets/DSCF7392_1_1763485862385.jpg'],
  ['portfolio-famiglia', 'Famiglia', 'Ricordi da conservare insieme', 'public/images/print-service/family-vacation-beach.jpg'],
  ['portfolio-altro', 'Altri progetti', 'Uno sguardo, tante storie', 'public/images/image-experience/image-experience-guests-toast-1536.webp'],
  ['online-shop', 'Shop online', 'Regali con le tue fotografie', 'public/images/print-service/travel-polaroid-prints.jpg'],
  ['blog-articolo', 'Il blog', 'Guide, consigli e fotografia', 'public/images/image-experience/image-experience-bride-preparations-1536.webp'],
  ['real-wedding', 'Real Wedding', 'Storie di matrimonio', 'public/images/image-experience/image-experience-couple-reception-1536.webp'],
  ['prenotazione', 'Il tuo shooting', 'Prenota un ricordo speciale', 'public/images/couple-heart-balloon.png'],
  ['shop-categoria', 'Il catalogo', 'La tua foto diventa un regalo', 'public/images/print-service/printed-memories-table.jpg'],
];
const escape = value => value.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const overlay = (title, subtitle, background = '#263d37') => Buffer.from(`
  <svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
    <rect x="620" width="580" height="630" fill="${background}"/>
    <path d="M680 155h72" stroke="#d2b083" stroke-width="3"/>
    <text x="680" y="220" fill="#d2b083" font-size="22" font-family="sans-serif" letter-spacing="4">IMAGE STUDIO</text>
    <text x="680" y="315" fill="#fff7ed" font-size="43" font-family="serif">${escape(title)}</text>
    <text x="680" y="370" fill="#e8dfd3" font-size="23" font-family="sans-serif">${escape(subtitle)}</text>
    <text x="680" y="550" fill="#d2b083" font-size="18" font-family="sans-serif">Aversa · Fotografia e ricordi</text>
  </svg>`);
for (const [name, title, subtitle, photo] of cards) {
  const left = await sharp(path.join(web, photo)).resize(620, 630, { fit: 'cover' }).toBuffer();
  await sharp({ create: { width: 1200, height: 630, channels: 3, background: '#263d37' } })
    .composite([{ input: left, left: 0, top: 0 }, { input: overlay(title, subtitle), left: 0, top: 0 }])
    .jpeg({ quality: 86 }).toFile(path.join(output, `${name}.jpg`));
}

// Evergreen gift-card artwork, consistent with the seal/card shown on the landing.
for (const [name, title, subtitle, opened] of [
  ['regala', 'Regala un ricordo', 'Una dedica. Un regalo da scartare.', false],
  ['regala-come-funziona', 'Come funziona', 'Scegli · Personalizza · Consegna', true],
]) {
  const art = Buffer.from(`<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
    <rect width="1200" height="630" fill="#6c2735"/>
    <circle cx="280" cy="305" r="235" fill="#ffffff" opacity=".04"/>
    <rect x="72" y="${opened ? 115 : 155}" width="470" height="300" rx="14" fill="#f6ecdc" transform="rotate(-6 300 300)"/>
    <rect x="90" y="205" width="470" height="300" rx="14" fill="#a74652" stroke="#d4b57b" stroke-width="2"/>
    <path d="M90 205L325 375L560 205" fill="#853240" stroke="#d4b57b" stroke-width="2"/>
    ${opened ? '<text x="160" y="175" fill="#6c2735" font-size="27" font-family="serif">Un pensiero per te</text>' : ''}
    <circle cx="325" cy="365" r="49" fill="#d4b57b"/>
    <circle cx="325" cy="365" r="40" fill="none" stroke="#6c2735"/>
    <text x="310" y="378" fill="#6c2735" font-size="36" font-family="serif">I</text>
    <text x="170" y="554" fill="#eedfc7" font-size="22" font-family="sans-serif">${opened ? '1. Scegli  2. Dedica  3. Invia' : 'Un regalo fotografico, tutto da vivere'}</text>
  </svg>`);
  await sharp(art).composite([{ input: overlay(title, subtitle, '#52232e') }])
    .jpeg({ quality: 90 }).toFile(path.join(output, `${name}.jpg`));
}

for (const [name, title, subtitle] of [
  ['privacy', 'La tua privacy', 'Come trattiamo i dati personali'],
  ['cookie-policy', 'I cookie', 'Le tue preferenze di navigazione'],
  ['terms', 'Le condizioni', 'Vendita e utilizzo dei servizi'],
  ['gdpr', 'I tuoi dati', 'Accesso, esportazione e cancellazione'],
]) {
  const icon = Buffer.from(`<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
    <rect width="1200" height="630" fill="#eee6da"/>
    <path d="M310 120l150 55v140q0 130-150 200q-150-70-150-200V175z" fill="#526d60"/>
    <path d="M245 315l45 45l95-105" fill="none" stroke="#eee6da" stroke-width="18"/>
  </svg>`);
  await sharp(icon).composite([{ input: overlay(title, subtitle) }])
    .jpeg({ quality: 88 }).toFile(path.join(output, `${name}.jpg`));
}
