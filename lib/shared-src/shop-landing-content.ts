/**
 * Testi della vetrina Natale (/shop-natale). Li usano sia la pagina sia il
 * server che la prepara per Google, così domande frequenti e dati strutturati
 * coincidono sempre.
 */

export const SHOP_PATH = '/shop-natale';

export const SHOP_SEO = {
  title: 'Regali di Natale con le tue foto: stampe e prodotti | Image Studio',
  description:
    'Shopping di Natale Image Studio ad Aversa: prodotti personalizzati con le tue foto, spediti in tutta Italia o da ritirare in studio. Ordina online, paghi con PayPal.',
  h1: 'Shopping di Natale',
  script: 'regali che nascono da una tua foto',
  lede: 'Scegli il prodotto, carica la foto e la trasformiamo in un regalo vero. Lo ritiri in studio o lo ricevi a casa, in tutta Italia.',
  breadcrumb: 'Shopping di Natale',
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
    question: 'Voglio regalare un servizio, non un prodotto: come faccio?',
    answer:
      'Per servizi fotografici e sconti usa le idee regalo: chi le riceve sceglie come usarle in studio.',
  },
];

export const SHOP_STEPS: readonly { title: string; text: string }[] = [
  { title: 'Scegli il prodotto', text: 'Ogni prodotto mostra il prezzo e quante foto servono.' },
  { title: 'Carica la foto', text: 'Dal telefono o dal computer, anche dopo aver pagato.' },
  { title: 'Ritira o ricevi', text: 'In studio, oppure a casa con spedizione tracciata.' },
];
