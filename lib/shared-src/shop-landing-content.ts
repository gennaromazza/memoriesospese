/**
 * Testi della vetrina dello shop online (/online-shop). Li usano sia la pagina sia il
 * server che la prepara per Google, così domande frequenti e dati strutturati
 * coincidono sempre.
 */

export const SHOP_PATH = '/online-shop';

export const SHOP_SEO = {
  title: 'Shop online con le tue foto, Aversa | Image Studio',
  description:
    'Shop online Image Studio ad Aversa: regali personalizzati con le tue foto. Ritiro gratuito in studio o spedizione in tutta Italia, paghi con PayPal.',
  h1: 'Shop online',
  script: 'regali che nascono da una tua foto',
  lede: 'Scegli il prodotto, carica la foto e la trasformiamo in un regalo vero. Lo ritiri in studio o lo ricevi a casa, in tutta Italia.',
  breadcrumb: 'Shop online',
} as const;

export interface ShopFaq {
  question: string;
  answer: string;
}

export const SHOP_FAQS: readonly ShopFaq[] = [
  {
    question: 'Come ordino un prodotto?',
    answer:
      'Scegli il prodotto, accedi o crea il tuo account, carica la foto richiesta, indica se preferisci il ritiro in studio o la spedizione e paga con PayPal. Ricevi subito la conferma per email.',
  },
  {
    question: 'Posso caricare la foto dopo aver pagato?',
    answer:
      'Sì. Se ti manca la foto in questo momento, puoi completare l\'ordine e caricarla in seguito dalla pagina "I miei ordini". Ti ricordiamo noi via email di inviarla.',
  },
  {
    question: 'Quando ricevo il mio regalo?',
    answer:
      'Iniziamo a lavorare il prodotto quando abbiamo pagamento e foto. I tempi di realizzazione e spedizione sono indicati prima di pagare.',
  },
  {
    question: 'Si può ritirare in studio?',
    answer:
      'Sì, il ritiro in studio è sempre disponibile e gratuito. Ti scriviamo quando il prodotto è pronto.',
  },
  {
    question: 'Che foto posso caricare?',
    answer:
      'File JPG, fino a 30 MB ciascuno. Se una foto è troppo piccola per venire nitida ti avvisiamo, e se non è adatta ti chiediamo di inviarne un\'altra.',
  },
  {
    question: 'Quanto costa la spedizione?',
    answer:
      'La spedizione in Italia è indicata prima di pagare e può dipendere dal peso dell\'ordine. Il ritiro in studio ad Aversa è gratuito.',
  },
  {
    question: 'Voglio regalare un servizio, non un prodotto: come faccio?',
    answer:
      'Per servizi fotografici, stampe e sconti da usare in studio scegli una gift card: chi la riceve decide come usarla.',
  },
];

export const SHOP_STEPS: readonly { title: string; text: string }[] = [
  { title: 'Scegli il prodotto', text: 'Ogni prodotto mostra il prezzo e quante foto servono.' },
  { title: 'Carica la foto', text: 'Dal telefono o dal computer, anche dopo aver pagato.' },
  { title: 'Ritira o ricevi', text: 'In studio, oppure a casa con spedizione tracciata.' },
];

// ---------------------------------------------------------------------------
// Pagine per categoria: /online-shop/categoria/<valore>
// ---------------------------------------------------------------------------

export const SHOP_CATEGORY_PATH = '/online-shop/categoria';

/** Forma ammessa per il valore tecnico di una categoria (la stessa delle impostazioni dello shop). */
export const SHOP_CATEGORY_VALUE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;

/** Indirizzo della pagina di una categoria. */
export function shopCategoryPath(value: string): string {
  return `${SHOP_CATEGORY_PATH}/${encodeURIComponent(value)}`;
}

/** Valore della categoria da un indirizzo del tipo /online-shop/categoria/<valore>, o null se non lo è. */
export function shopCategoryValueFromPath(pathname: string): string | null {
  const match = /^\/online-shop\/categoria\/([^/]+)\/?$/.exec(pathname);
  if (!match) return null;
  try {
    const value = decodeURIComponent(match[1]);
    return SHOP_CATEGORY_VALUE_PATTERN.test(value) ? value : null;
  } catch {
    return null;
  }
}

/** Accorcia senza spezzare le parole, con i puntini se serve. */
function fit(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.5 ? cut.slice(0, space) : cut).replace(/[\s,.;:–-]+$/, '')}…`;
}

/** Titolo, descrizione e testi di una categoria, nei limiti che Google mostra (titolo 60, descrizione 160). */
export function shopCategorySeo(name: string) {
  const nome = name.trim().replace(/\s+/g, ' ') || 'Prodotti';
  const suffix = ' | Regali Image Studio Aversa';
  return {
    title: `${fit(nome, 60 - suffix.length)}${suffix}`,
    // Si accorcia il nome, non il resto: dove si trova lo studio e come si ritira devono restare sempre.
    description: `${fit(nome, 50)}: regali con le tue foto, shop online Image Studio ad Aversa. Ritiro in studio o spedizione in Italia.`,
    h1: nome,
    script: SHOP_SEO.script,
    lede: `Scegli un prodotto della categoria ${nome}, carica la foto e la trasformiamo in un regalo vero. Lo ritiri in studio o lo ricevi a casa, in tutta Italia.`,
    breadcrumb: nome,
  } as const;
}
