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
  lede: "Una gift card Image Studio si scarta come un vero regalo. Scegli l'idea, scrivi due righe e consegnala il giorno che vuoi.",
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
    question: 'Posso programmare la consegna del regalo?',
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

export const GIFT_HOW_PATH = '/regala/come-funziona';

export const GIFT_HOW_SEO = {
  title: 'Come funziona la gift card Image Studio | Idee regalo',
  description:
    "Come regalare e usare una gift card Image Studio: scegli l'idea, scrivi un messaggio, paga con PayPal. Chi riceve apre il regalo e sceglie come usarlo.",
  h1: 'Come funziona la gift card',
  lede: 'Regalarla richiede pochi minuti, e chi la riceve la apre come un vero regalo. Ecco tutti i passaggi.',
  breadcrumb: 'Come funziona',
  howToName: 'Come regalare una gift card Image Studio',
} as const;

export interface GiftHowSection {
  id: string;
  title: string;
  intro: string;
  steps: readonly { title: string; text: string }[];
}

export const GIFT_HOW_SECTIONS: readonly GiftHowSection[] = [
  {
    id: 'regalare',
    title: 'Se vuoi regalarla',
    intro: 'Dal telefono o dal computer, senza creare un account.',
    steps: [
      { title: "Scegli l'idea regalo", text: 'Ogni idea mostra cosa include, con foto e descrizione, e il prezzo.' },
      { title: 'Personalizza il regalo', text: 'Scrivi il nome di chi lo riceve e un messaggio: comparirà sulla card, scritto a mano. Vedi subito come appare.' },
      { title: 'Scegli quando arriva', text: "Subito dopo il pagamento, oppure in un giorno che decidi: il regalo parte per email alle 8:00. Se non hai l'email di chi lo riceve, il link arriva a te e lo inoltri tu." },
      { title: 'Paga con PayPal', text: 'Il pagamento è sicuro e non serve un account. Ricevi la ricevuta e il codice per email.' },
    ],
  },
  {
    id: 'ricevere',
    title: 'Se ricevi una gift card',
    intro: 'Non devi pagare nulla.',
    steps: [
      { title: 'Apri il regalo', text: "Dall'email o dal link, oppure scansionando il QR del cartoncino. Tocca il sigillo per aprirlo." },
      { title: 'Scopri cosa include', text: 'Vedi la card con il messaggio di chi te l\'ha regalata e i prodotti inclusi, con foto e dettagli.' },
      { title: 'Usalo', text: "Se il regalo prevede un appuntamento, scegli giorno e orario nel calendario dello studio. Altrimenti contatta lo studio dai recapiti che trovi nella pagina." },
    ],
  },
];

export const GIFT_HOW_NOTES: readonly { title: string; text: string }[] = [
  { title: 'Scadenza', text: 'È indicata su ogni card e la vedi prima di acquistare. Dopo la scadenza puoi contattare lo studio.' },
  { title: 'In studio', text: 'Puoi comprarla al banco: prepariamo un cartoncino da regalare in mano, con la card, il nome e un QR che apre il regalo.' },
  { title: 'Un dubbio?', text: 'Scrivici dai recapiti dello studio: ti aiutiamo a scegliere il regalo giusto.' },
];
