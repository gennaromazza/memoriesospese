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

export const PRINT_SERVICE_PATH = '/stampa-foto-aversa';
export const PRINT_PRICE_UPDATED_AT = '30 agosto 2026';

export const PRINT_SERVICE_SEO = {
  title: 'Stampa Foto Aversa: Vacanze e Polaroid | Image Studio',
  description:
    'Stampa foto di vacanze, ricordi e formato Polaroid ad Aversa, vicino Napoli e Caserta. Scopri formati, prezzi e carta lucida o opaca.',
  keywords:
    'stampa foto Aversa, stampe fotografiche Napoli, stampa foto Caserta, foto vacanza, stampa Polaroid, prezzi stampa foto, ricordi fotografici',
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
      { format: '8×10', prices: ['€0,50', '€0,45', '€0,35', '€0,25', '€0,20'] },
      { format: '9×13', prices: ['€0,50', '€0,45', '€0,35', '€0,25', '€0,20'] },
      { format: '10×10', prices: ['€0,50', '€0,45', '€0,35', '€0,25', '€0,20'] },
      { format: '10×13', prices: ['€0,50', '€0,45', '€0,35', '€0,25', '€0,20'] },
      { format: '10×15', prices: ['€0,50', '€0,45', '€0,35', '€0,25', '€0,20'] },
      { format: '13×13', prices: ['€0,80', '€0,55', '€0,40', '€0,25', '€0,20'] },
      { format: '13×18', prices: ['€0,80', '€0,55', '€0,40', '€0,30', '€0,25'] },
      { format: '13×19', prices: ['€0,80', '€0,55', '€0,40', '€0,30', '€0,25'] },
      { format: '13×20', prices: ['€1,80', '€1,20', '€0,90', '€0,70', '€0,70'] },
      { format: '15×20', prices: ['€1,80', '€1,20', '€0,90', '€0,70', '€0,70'] },
    ],
  },
  {
    id: 'medi',
    title: 'Formati medi',
    description: 'Per cornici importanti, composizioni fotografiche e piccoli ingrandimenti.',
    quantityHeaders: ['1–5', '6–25', '26–50', '51+'],
    rows: [
      { format: '15×22', prices: ['€1,80', '€1,20', '€0,90', '€0,70'] },
      { format: '18×24', prices: ['€4,00', '€3,00', '€2,00', '€1,80'] },
      { format: '20×25', prices: ['€4,00', '€3,00', '€2,00', '€1,80'] },
      { format: '20×27', prices: ['€5,00', '€3,50', '€2,50', '€2,00'] },
      { format: '20×30', prices: ['€5,00', '€3,50', '€2,50', '€2,00'] },
      { format: '24×30', prices: ['€6,00', '€3,90', '€2,60', '€2,20'] },
      { format: '24×36', prices: ['€6,00', '€3,90', '€2,60', '€2,20'] },
      { format: '30×30', prices: ['€6,00', '€3,90', '€2,60', '€2,20'] },
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
      { format: '35×35', prices: ['€7,00', '€5,50', '€4,30'] },
      { format: '35×50', prices: ['€8,00', '€6,00', '€4,70'] },
      { format: '40×40', prices: ['€7,50', '€6,00', '€4,50'] },
      { format: '40×50', prices: ['€8,00', '€6,50', '€4,80'] },
      { format: '40×60', prices: ['€10,00', '€7,00', '€5,00'] },
      { format: '40×80', prices: ['€15,00', '€10,00', '€7,50'] },
      { format: '50×50', prices: ['€13,00', '€10,00', '€7,00'] },
      { format: '50×60', prices: ['€14,00', '€10,00', '€7,00'] },
      { format: '50×70', prices: ['€15,00', '€10,00', '€7,50'] },
      { format: '50×75', prices: ['€16,00', '€11,00', '€8,00'] },
      { format: '50×80', prices: ['€17,00', '€11,00', '€8,00'] },
    ],
  },
];

export const PRINT_FAQS: PrintFaq[] = [
  {
    question: 'Quanto costa stampare una foto 10×15?',
    answer:
      'Il prezzo parte da €0,50 per piccole quantità e scende fino a €0,20 a fotografia per ordini da 500 stampe in su.',
  },
  {
    question: 'Dove posso stampare le foto ad Aversa?',
    answer:
      'Puoi contattare Image Studio attraverso Memorie Sospese. Ti daremo le indicazioni per inviare i file e confermeremo disponibilità, tempi e modalità di ritiro o consegna.',
  },
  {
    question: 'Posso stampare fotografie in stile Polaroid?',
    answer:
      'Sì. Il formato Polaroid Wide 10×9 cm è ideale per pareti, regali, scrapbooking e ricordi di viaggio. La confezione promozionale da 50 fotografie costa €9,90, salvo disponibilità.',
  },
  {
    question: 'È meglio la carta lucida o quella opaca?',
    answer:
      'La carta lucida esalta colori e contrasto; quella opaca riduce riflessi e impronte. La scelta dipende dal soggetto e da come utilizzerai la fotografia.',
  },
  {
    question: 'Posso inviare le fotografie direttamente dallo smartphone?',
    answer:
      'Sì. Scrivici su WhatsApp e riceverai le indicazioni più semplici per selezionare e inviare i file mantenendo la migliore qualità possibile.',
  },
];

export function countPrintFormats(): number {
  return PRINT_PRICE_TABLES.reduce((total, table) => total + table.rows.length, 0);
}
