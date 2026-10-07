export interface PrintPriceRow {
  format: string;
  prices: string[];
}

export interface PrintPriceTable {
  id: string;
  title: string;
  description: string;
  quantityHeaders: string[];
  rows: PrintPriceRow[];
}

export interface PrintFaq {
  question: string;
  answer: string;
}

export interface PrintFormatSearchResult {
  tableId: string;
  tableTitle: string;
  quantityHeaders: string[];
  row: PrintPriceRow;
}

export const PRINT_SERVICE_PATH = '/stampa-foto-aversa';
export const PRINT_PRICE_UPDATED_AT = '30 agosto 2026';

export const PRINT_SERVICE_SEO = {
  title: 'Stampa Foto Online ad Aversa | Image Studio',
  description:
    'Ordina online stampe fotografiche ad Aversa: carica i JPG, scegli formato e carta, paga con PayPal e ritira in sede.',
  keywords:
    'stampa foto Aversa, stampe fotografiche Napoli, stampa foto Caserta, foto vacanza, prezzi stampa foto, ricordi fotografici',
} as const;

export const PRINT_WHATSAPP_MESSAGE =
  'Ciao, ho visto la pagina delle stampe fotografiche. Vorrei stampare i miei ricordi: mi aiutate a scegliere formato e quantità?';

export const PRINT_PRICE_TABLES: PrintPriceTable[] = [
  {
    id: 'classici',
    title: 'Formati piccoli e classici',
    description: 'Perfetti per album, scatole dei ricordi, cornici e fotografie da regalare.',
    quantityHeaders: ['1–10', '11–25', '26–50', '51–499', '500+'],
    rows: [
      { format: '10×15', prices: ['€0,70', '€0,60', '€0,50', '€0,45', '€0,40'] },
      { format: '15×20', prices: ['€1,80', '€1,50', '€1,30', '€1,20', '€1,00'] },
    ],
  },
  {
    id: 'medi',
    title: 'Formati medi',
    description: 'Per cornici importanti, composizioni fotografiche e piccoli ingrandimenti.',
    quantityHeaders: ['1–5', '6–25', '26–50', '51+'],
    rows: [
      { format: '20×30', prices: ['€5,00', '€3,50', '€2,50', '€2,00'] },
      { format: '30×40', prices: ['€7,00', '€4,50', '€3,50', '€2,90'] },
      { format: '30×45', prices: ['€8,00', '€5,00', '€3,90', '€3,20'] },
    ],
  },
  {
    id: 'grandi',
    title: 'Grandi formati e poster',
    description: 'Quando una fotografia merita di diventare parte della casa.',
    quantityHeaders: ['1–5', '6–25', '26+'],
    rows: [
      { format: '30×50', prices: ['€8,00', '€6,00', '€4,50'] },
      { format: '30×60', prices: ['€8,00', '€6,00', '€4,70'] },
      { format: '35×50', prices: ['€8,00', '€6,00', '€4,70'] },
      { format: '40×60', prices: ['€10,00', '€7,00', '€5,50'] },
      { format: '40×80', prices: ['€17,00', '€12,50', '€10,00'] },
      { format: '50×80', prices: ['€17,00', '€12,50', '€10,00'] },
    ],
  },
];

export const PRINT_FAQS: PrintFaq[] = [
  {
    question: 'Quanto costa stampare una foto 10×15?',
    answer:
      'Il prezzo parte da €0,70 per piccole quantità e scende fino a €0,40 a fotografia per ordini da 500 stampe in su.',
  },
  {
    question: 'Dove posso stampare le foto ad Aversa?',
    answer:
      'Puoi ordinare direttamente su Memorie Sospese: accedi con Google, carica i JPG, scegli le opzioni, paga con PayPal e ritira le stampe presso Image Studio ad Aversa.',
  },
  {
    question: 'È meglio la carta lucida o quella opaca?',
    answer:
      'La carta lucida esalta colori e contrasto; quella opaca riduce riflessi e impronte. La scelta dipende dal soggetto e da come utilizzerai la fotografia.',
  },
  {
    question: 'Posso inviare le fotografie direttamente dallo smartphone?',
    answer:
      'Sì. Apri lo shop dal telefono, accedi con Google e seleziona i file JPG. Il caricamento mostra il progresso e può essere riprovato in caso di interruzione.',
  },
  {
    question: 'Come pago e come ricevo le stampe?',
    answer:
      'Il pagamento è anticipato e avviene online tramite PayPal. Quando la produzione è conclusa riceverai l’indicazione per ritirare l’ordine presso lo studio.',
  },
];

export function countPrintFormats(): number {
  return PRINT_PRICE_TABLES.reduce((total, table) => total + table.rows.length, 0);
}

export function normalizePrintFormat(value: string): string {
  return value
    .toLocaleLowerCase('it-IT')
    .replace(/centimetri|centimetro|cm/g, '')
    .replace(/[×*]/g, 'x')
    .replace(/\s+/g, '')
    .trim();
}

export function searchPrintFormats(query: string): PrintFormatSearchResult[] {
  const normalizedQuery = normalizePrintFormat(query);
  if (!normalizedQuery) return [];

  return PRINT_PRICE_TABLES.flatMap((table) =>
    table.rows
      .filter((row) => normalizePrintFormat(row.format).includes(normalizedQuery))
      .map((row) => ({
        tableId: table.id,
        tableTitle: table.title,
        quantityHeaders: table.quantityHeaders,
        row,
      })),
  );
}
