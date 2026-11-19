export interface VademecumSection {
  emoji: string;
  title: string;
  paragraphs: string[];
  /** Elenco puntato dopo i paragrafi. */
  bullets?: string[];
  /** Paragrafi dopo l'elenco. */
  after?: string[];
  example?: { intro: string; items: string[] };
}

export interface VademecumContent {
  title: string;
  subtitle: string;
  intro: string[];
  sections: VademecumSection[];
  closing: string[];
  signature: string;
}

/** Testo ufficiale del vademecum di Natale 2026 (approvato dallo studio). */
export const VADEMECUM_NATALE_2026_CONTENT: VademecumContent = {
  title: '🎄 Il nostro piccolo vademecum di Natale',
  subtitle: 'Image Studio Fotografico – Natale 2026',
  intro: [
    'Non vediamo l’ora di accogliervi nel nostro mondo natalizio! ❤️',
    'Abbiamo preparato ogni dettaglio per regalarvi un’esperienza divertente e soprattutto tanti bei ricordi da portare a casa.',
    'Prima di incontrarci, vi chiediamo solo di dare un’occhiata a queste piccole indicazioni. Non sono tante regole, ma qualche accorgimento per far sì che tutto fili liscio e che ogni famiglia possa godersi il proprio momento speciale!',
  ],
  sections: [
    {
      emoji: '👨‍👩‍👧‍👦',
      title: 'Quanti possiamo essere?',
      paragraphs: [
        'I nostri set sono pensati per accogliere comodamente fino a 5 persone.',
        'In alcuni casi possiamo arrivare anche a 6, ma vi chiediamo di concordarlo prima con noi. Dobbiamo considerare lo spazio a disposizione e i tempi dello shooting, per fare in modo che tutti possano vivere al meglio l’esperienza.',
      ],
    },
    {
      emoji: '🐾',
      title: 'Anche i nostri amici a quattro zampe!',
      paragraphs: [
        'Assolutamente sì! I vostri animali domestici sono i benvenuti. Anche loro fanno parte della famiglia e meritano di essere presenti nei vostri ricordi!',
        'Vi chiediamo soltanto di avvisarci al momento della prenotazione.',
      ],
    },
    {
      emoji: '👗',
      title: 'Possiamo cambiare abito?',
      paragraphs: [
        'Certo! Durante lo shooting è previsto un cambio d’abito.',
        'Il nostro consiglio è di scegliere in anticipo entrambi gli outfit e arrivare già pronti con tutto l’occorrente. Così avremo più tempo da dedicare alle fotografie e meno alle preparazioni!',
      ],
    },
    {
      emoji: '📅',
      title: 'E se non possiamo più venire?',
      paragraphs: [
        'Può capitare un imprevisto, lo sappiamo bene!',
        'Se avete bisogno di spostare il vostro appuntamento, nessun problema: cercheremo di trovare insieme una nuova data.',
        'L’importante è avvisarci per tempo:',
      ],
      bullets: [
        'Almeno 4 giorni prima dello shooting: la quota versata per la prenotazione resta valida e potrete utilizzarla per fissare un nuovo appuntamento, in base alle disponibilità.',
        'Nei 4 giorni precedenti allo shooting: purtroppo non sarà possibile recuperare la quota versata.',
      ],
      after: [
        'Questo perché ogni appuntamento viene riservato esclusivamente per voi e, soprattutto nel periodo natalizio, è molto difficile riuscire a riassegnare uno spazio libero all’ultimo momento.',
      ],
    },
    {
      emoji: '⏰',
      title: 'Puntualità: un piccolo favore reciproco!',
      paragraphs: [
        'Sappiamo che preparare tutta la famiglia per uscire può trasformarsi in una piccola avventura! 😄',
        'Per questo vi consigliamo di arrivare 10 minuti prima dell’orario prenotato, così avremo modo di accogliervi con calma e iniziare puntuali.',
        'Ogni shooting dura circa 45 minuti e abbiamo organizzato gli appuntamenti proprio per dedicare a ciascuna famiglia il giusto tempo.',
        'Se doveste arrivare in ritardo, non preoccupatevi: vi accoglieremo comunque! Dovremo però recuperare il tempo perso riducendo proporzionalmente la durata della sessione.',
      ],
      example: {
        intro: 'Per esempio:',
        items: [
          '10 minuti di ritardo = 35 minuti di shooting.',
          '15 minuti di ritardo = 30 minuti di shooting.',
          '20 minuti di ritardo = 25 minuti di shooting.',
        ],
      },
      after: [
        'È un piccolo accorgimento necessario per non far attendere le famiglie che hanno il loro appuntamento dopo di voi. ❤️',
      ],
    },
    {
      emoji: '🎅',
      title: 'E con i bambini come funziona?',
      paragraphs: [
        'Niente paura! Non pretendiamo che i bambini arrivino già pronti a sorridere davanti all’obiettivo.',
        'Anzi, vogliamo che si divertano, giochino e vivano il set come un momento speciale.',
        'Se hanno bisogno di qualche minuto per prendere confidenza con l’ambiente, ci penseremo noi! Il nostro consiglio è semplicemente quello di farli arrivare riposati e senza troppa fretta.',
      ],
    },
    {
      emoji: '🎄',
      title: 'Trattiamo bene il nostro piccolo mondo natalizio!',
      paragraphs: [
        'Abbiamo lavorato tanto per realizzare il set e renderlo speciale per tutti voi.',
        'Vi chiediamo soltanto di aiutarci a mantenerlo bello e in ordine, prestando attenzione agli allestimenti e agli oggetti presenti.',
        'I bambini potranno divertirsi, naturalmente, sempre con la supervisione di mamma e papà.',
      ],
    },
    {
      emoji: '❤️',
      title: 'Un ultimo piccolo pensiero...',
      paragraphs: [
        'Ogni appuntamento è organizzato per regalarvi un’esperienza speciale. Per questo cerchiamo di rispettare gli orari e i tempi di tutte le famiglie.',
      ],
    },
  ],
  closing: [
    'Non vediamo l’ora di accogliervi, giocare con i vostri bambini e creare insieme qualche nuovo ricordo di Natale!',
    'Grazie per aver scelto Image Studio.',
  ],
  signature: 'È tutta questione di IMAGE.',
};
