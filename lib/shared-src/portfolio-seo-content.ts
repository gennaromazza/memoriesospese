/**
 * Contenuto SEO strutturato per le pagine /portfolio/:categoria.
 * Fonte condivisa tra il prerender server-side (seo-prerender.ts)
 * e la pagina React (PortfolioCategoryPage.tsx), così il contenuto
 * visibile agli utenti e quello indexato dai bot sono identici.
 */

export interface PortfolioInline {
  text: string;
  /** URL relativo (es. "/consulenze"). Assente = testo semplice. */
  href?: string;
}

/** Un paragrafo è una sequenza di inline (testo + eventuali link). */
export type PortfolioParagraph = PortfolioInline[];

export interface PortfolioSection {
  heading: string;
  paragraphs: PortfolioParagraph[];
}

export interface PortfolioFaq {
  question: string;
  answer: PortfolioParagraph;
}

export interface PortfolioCategoryContent {
  sections: PortfolioSection[];
  faqs?: PortfolioFaq[];
  /** Link testuali mostrati in fondo alla sezione (es. pagine correlate). */
  relatedLinks?: { text: string; href: string }[];
}

export const portfolioCategoryContent: Record<string, PortfolioCategoryContent> = {
  matrimonio: {
    sections: [
      {
        heading: 'Il Nostro Approccio alla Fotografia di Matrimonio',
        paragraphs: [
          [
            {
              text: 'Reportage documentaristico ed emozionale: raccontiamo la giornata così com\'è, dai preparativi al taglio della torta, senza pose forzate. La filosofia "Lasciati Trasportare" di Gennaro Mazzacane privilegia i momenti autentici e le emozioni spontanee. Oltre 500 matrimoni documentati in più di 10 anni di attività.',
            },
          ],
        ],
      },
      {
        heading: 'Dove Lavoriamo',
        paragraphs: [
          [
            {
              text: 'Fotografo di matrimonio ad Aversa e in tutta la Campania: Napoli, Caserta, Salerno e Costiera Amalfitana. Nessun costo di trasferta nell\'agro aversano.',
            },
          ],
        ],
      },
      {
        heading: 'Come Funziona',
        paragraphs: [
          [
            { text: 'Si parte da una ' },
            { text: 'consulenza gratuita', href: '/consulenze' },
            {
              text: ' (di persona ad Aversa o in videocall) per conoscerci e definire il pacchetto. Dopo il matrimonio ricevi la galleria digitale privata "Memorie Sospese" per rivedere e selezionare le foto online.',
            },
          ],
        ],
      },
      {
        heading: 'Il Percorso del Vostro Matrimonio',
        paragraphs: [
          [
            {
              text: 'Dalla consulenza gratuita alla consegna, il percorso è costruito intorno alla vostra giornata: definiamo insieme le esigenze, raccontiamo il matrimonio dai preparativi alla festa e consegniamo le immagini nella galleria digitale privata "Memorie Sospese".',
            },
          ],
        ],
      },
    ],
    faqs: [
      {
        question: 'Quanto costa un servizio fotografico di matrimonio?',
        answer: [
          {
            text: 'I pacchetti partono indicativamente da €2.000 fino a €3.500, con album fotografico e galleria digitale inclusi. ',
          },
          { text: 'Richiedi un preventivo gratuito', href: '/consulenze' },
          { text: '.' },
        ],
      },
      {
        question: 'In quanto tempo vengono consegnate le foto?',
        answer: [
          {
            text: 'La consegna avviene entro circa 12 settimane dal matrimonio, tramite galleria digitale privata e album.',
          },
        ],
      },
      {
        question: 'Fate anche il video del matrimonio?',
        answer: [
          { text: 'Sì, con ' },
          { text: 'iMaGe Vision', href: '/vision' },
          {
            text: ' realizziamo video matrimoniali cinematografici, abbinabili al servizio fotografico.',
          },
        ],
      },
    ],
    relatedLinks: [
      { text: 'Fotografo ad Aversa', href: '/fotografo-aversa' },
      { text: 'Consigli e guide sul blog', href: '/blog' },
    ],
  },

  battesimo: {
    sections: [
      {
        heading: 'Fotografia di Battesimo senza Pose Forzate',
        paragraphs: [
          [
            {
              text: 'Documentiamo la cerimonia e il ricevimento con discrezione: l\'emozione dei genitori, i nonni, i dettagli della chiesa e della festa. Servizio disponibile ad Aversa, Napoli, Caserta e in tutta la Campania, senza costi di trasferta nell\'agro aversano.',
            },
          ],
          [
            {
              text: 'Le foto vengono consegnate nella galleria digitale privata "Memorie Sospese", da cui la famiglia può selezionare le preferite. ',
            },
            { text: 'Richiedi informazioni', href: '/consulenze' },
          ],
        ],
      },
    ],
    relatedLinks: [{ text: 'Fotografo ad Aversa', href: '/fotografo-aversa' }],
  },

  comunione: {
    sections: [
      {
        heading: 'Prime Comunioni in Campania',
        paragraphs: [
          [
            {
              text: 'Reportage della cerimonia e del ricevimento, ritratti del festeggiato con la famiglia e attenzione ai dettagli. Operiamo ad Aversa e nei comuni dell\'agro aversano, Napoli e Caserta. Consegna tramite galleria digitale privata. ',
            },
            { text: 'Richiedi informazioni', href: '/consulenze' },
          ],
        ],
      },
    ],
  },

  cresima: {
    sections: [
      {
        heading: 'Fotografia per Cresime',
        paragraphs: [
          [
            {
              text: 'Documentiamo la celebrazione e i momenti in famiglia con uno stile naturale e discreto. Servizio attivo ad Aversa, Caserta, Napoli e provincia. Consegna tramite galleria digitale privata "Memorie Sospese". ',
            },
            { text: 'Richiedi informazioni', href: '/consulenze' },
          ],
        ],
      },
    ],
  },

  evento: {
    sections: [
      {
        heading: 'Eventi Aziendali e Privati',
        paragraphs: [
          [
            {
              text: 'Copertura fotografica di eventi, feste private e ricorrenze a Napoli, Caserta e in Campania: momenti chiave, ospiti e atmosfera, con consegna in galleria digitale. ',
            },
            { text: 'Parliamo del tuo evento', href: '/consulenze' },
          ],
        ],
      },
    ],
  },

  ritratto: {
    sections: [
      {
        heading: 'Ritratti e Book Fotografici',
        paragraphs: [
          [
            {
              text: 'Sessioni di ritratto individuali, di coppia e familiari, in studio ad Aversa o in esterna. Stile naturale, guida alla posa per chi non si sente fotogenico. ',
            },
            { text: 'Prenota una sessione', href: '/consulenze' },
          ],
        ],
      },
    ],
  },

  famiglia: {
    sections: [
      {
        heading: 'Fotografia di Famiglia',
        paragraphs: [
          [
            {
              text: 'Sessioni fotografiche di famiglia spontanee, in studio ad Aversa o nei luoghi a cui siete legati. Le foto restano disponibili nella galleria digitale privata. ',
            },
            { text: 'Richiedi informazioni', href: '/consulenze' },
          ],
        ],
      },
    ],
  },

  altro: {
    sections: [
      {
        heading: 'Altri Servizi Fotografici',
        paragraphs: [
          [
            {
              text: 'Lauree, anniversari, feste e progetti speciali ad Aversa, Napoli e Caserta. ',
            },
            { text: 'Raccontaci la tua idea', href: '/consulenze' },
          ],
        ],
      },
    ],
  },
};
