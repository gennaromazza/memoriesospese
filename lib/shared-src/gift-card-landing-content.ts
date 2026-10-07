/**
 * Testi della pagina regalo (/regala). Sono usati sia dalla pagina sia dal
 * server che la prepara per Google, così le domande frequenti visibili e quelle
 * dichiarate nei dati strutturati coincidono sempre.
 */

export const GIFT_SHOP_PATH = '/regala';

export const GIFT_SHOP_SEO = {
  title: 'Idee regalo di Natale: gift card foto e tela | Image Studio',
  description:
    "Regala un ricordo che resta: gift card Image Studio ad Aversa per foto di Natale, stampe e tele. Scegli l'idea, scrivi due righe e consegnala quando vuoi.",
  h1: 'Idee regalo di Natale',
  script: 'regala un ricordo che resta',
  lede: "Una gift card Image Studio si scarta come un vero regalo. Scegli l'idea, scrivi due righe e consegnala il giorno che vuoi, anche la mattina di Natale.",
  breadcrumb: 'Idee regalo di Natale',
} as const;

export interface GiftShopFaq {
  question: string;
  answer: string;
}

export const GIFT_SHOP_FAQS: readonly GiftShopFaq[] = [
  {
    question: 'Come si usa la gift card?',
    answer:
      "Chi la riceve apre il link e vede cosa include il regalo. Se serve un appuntamento sceglie giorno e orario nel calendario dello studio, altrimenti ci contatta per ritirarlo. Non deve pagare nulla.",
  },
  {
    question: 'Posso programmare la consegna per Natale?',
    answer:
      "Sì. Scegli il giorno e il regalo arriva per email alle 8:00 a chi lo riceve, con il tuo messaggio. Se preferisci, ricevi tu il link e lo inoltri quando vuoi.",
  },
  {
    question: 'Si può avere anche stampata?',
    answer:
      "In studio prepariamo un cartoncino da regalare in mano, con la card incollata, il nome di chi riceve, il tuo messaggio e un QR che apre il regalo.",
  },
  {
    question: 'Quando scade?',
    answer:
      "La scadenza è indicata su ogni card. Per le idee di Natale vale fino alla fine della campagna, e puoi vederla prima di acquistare.",
  },
];

export const GIFT_SHOP_STEPS: readonly { title: string; text: string }[] = [
  { title: "Scegli l'idea", text: 'Ogni regalo mostra cosa include, con foto e descrizione.' },
  { title: 'Scrivi il messaggio', text: 'Il tuo biglietto compare sulla card, scritto a mano.' },
  { title: 'Paga e scegli quando', text: 'Il regalo parte subito o il giorno che decidi, alle 8:00.' },
];
