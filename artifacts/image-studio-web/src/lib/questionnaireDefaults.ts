/**
 * Default FAQ Set per il sistema questionario
 * Contiene le 10 domande predefinite da caricare all'inizializzazione
 */

import { FaqSet, QuestionKey } from '@shared/schema';

export const DEFAULT_FAQ_SET: Omit<FaqSet, 'id' | 'createdAt' | 'updatedAt'> = {
  title: "Set Domande Standard v1",
  active: true,
  version: 1,
  questions: [
    {
      key: "q1" as QuestionKey,
      text: "Il Momento della Scintilla",
      type: "textarea"
    },
    {
      key: "q2" as QuestionKey,
      text: "Una Difficoltà Superata Insieme",
      type: "textarea"
    },
    {
      key: "q3" as QuestionKey,
      text: "Il Momento più Divertente o Folle",
      type: "textarea"
    },
    {
      key: "q4" as QuestionKey,
      text: "La Vostra Canzone del Cuore",
      type: "textarea"
    },
    {
      key: "q5" as QuestionKey,
      text: "La Promessa per il Futuro",
      type: "textarea"
    },
    {
      key: "q6" as QuestionKey,
      text: "Il Vostro Piccolo Rituale di Coppia",
      type: "textarea"
    },
    {
      key: "q7" as QuestionKey,
      text: "Il Colore o Tema del Matrimonio",
      type: "textarea"
    },
    {
      key: "q8" as QuestionKey,
      text: "Un Aggettivo per il Vostro Giorno Perfetto",
      type: "textarea"
    },
    {
      key: "q9" as QuestionKey,
      text: "Le Persone Importanti (famiglia/cerchia, ruoli speciali)",
      type: "textarea"
    },
    {
      key: "q10" as QuestionKey,
      text: "Spazio Libero (qualsiasi cosa vogliate aggiungere)",
      type: "textarea"
    }
  ]
};

/**
 * Funzione per inizializzare il set di domande di default
 */
export const initializeDefaultFaqSet = async (): Promise<void> => {
  try {
    const { QuestionnaireService } = await import('./questionnaire');
    
    // Verifica se esiste già un set attivo
    const existingActive = await QuestionnaireService.getActiveFaqSet();
    
    if (!existingActive) {
      // Crea il set predefinito
      const faqSetId = await QuestionnaireService.createFaqSet({
        ...DEFAULT_FAQ_SET,
        createdBy: 'system'
      });
      
      console.log('✅ Set domande predefinito creato:', faqSetId);
    } else {
      console.log('ℹ️ Set domande attivo già esistente:', existingActive.id);
    }
  } catch (error) {
    console.error('❌ Errore inizializzazione set domande:', error);
    throw error;
  }
};

/**
 * Template per export ChatGPT - STORIA COMPLETA ALBUM
 */
export const generateChatGPTPrompt = (data: {
  galleryId: string;
  brideName: string;
  groomName: string;
  weddingDate: string;
  questions: { key: QuestionKey; text: string }[];
  brideAnswers: Record<QuestionKey, string>;
  groomAnswers: Record<QuestionKey, string>;
}): string => {
  const { galleryId, brideName, groomName, weddingDate, questions, brideAnswers, groomAnswers } = data;
  
  let prompt = `RUOLO
Sei un romanziere specializzato in storie d'amore. Devi scrivere un VERO RACCONTO NARRATIVO che racconti la storia di questo matrimonio come se fosse un romanzo breve. La storia deve scorrere fluida da inizio a fine, con personaggi, dialoghi interiori, e una narrazione continua che accompagni 35+ pagine dell'album fotografico.

OBIETTIVO - RACCONTO NARRATIVO COMPLETO DA 35+ PAGINE
Scrivi una STORIA VERA che scorre come un romanzo, divisa in capitoli narrativi:

1) PROLOGO - L'INIZIO DELLA STORIA (500-600 caratteri)
   - Racconta COME si sono conosciuti i protagonisti
   - Narrativa: "C'era una volta..." / "La loro storia iniziò quando..."
   
2) CAPITOLO 1: L'ATTESA (6 paragrafi da 400-500 caratteri)
   - Racconta la mattina del matrimonio come un capitolo di romanzo
   - Dialoghi interiori: "Lucrezia pensava che..." / "Giuseppe sentiva che..."
   - Descrizioni narrative: azioni, emozioni, scenari
   
3) CAPITOLO 2: L'INCONTRO (8 paragrafi da 350-450 caratteri)  
   - La cerimonia raccontata come scena cinematografica
   - Narrativa continua: "Quando lei apparve..." / "I loro occhi si incontrarono..."
   - Descrizioni dettagliate di gesti, parole, emozioni
   
4) CAPITOLO 3: LA CELEBRAZIONE (8 paragrafi da 300-400 caratteri)
   - La festa narrata come sequenza di scene collegate
   - Continua la storia: "Poi arrivò il momento..." / "La serata proseguì con..."
   - Collegamenti fluidi tra i vari momenti

5) CAPITOLO 4: I SEGRETI DEL CUORE (2 paragrafi da 500-600 caratteri)
   - Momento intimo e privato narrato in terza persona
   - Pensieri profondi dei protagonisti
   - "Nel silenzio dei loro cuori..." / "Quello che solo loro sapevano..."

6) EPILOGO - IL FUTURO CHE LI ASPETTA (400-500 caratteri)
   - Chiusura narrativa che apre al futuro
   - "E così la loro storia continuò..." / "Da quel giorno in poi..."
   
7) CITAZIONI POETICHE (12 frasi da 100-200 caratteri)
   - Estratti più belli dalla storia principale
   - Da inserire come citazioni sparse nell'album

STILE NARRATIVO - COME SCRIVERE UN ROMANZO
- Scrivi in TERZA PERSONA: "Lucrezia sentiva..." / "Giuseppe pensava..."
- USA VERBI AL PASSATO: "arrivò", "disse", "pensò", "guardò"
- CREA SUSPENSE: "Non sapeva ancora che..." / "Stava per accadere..."
- DIALOGHI INTERIORI: "Si chiese se..." / "Pensò che forse..."
- DETTAGLI SENSORIALI: profumi, colori, suoni, texture
- COLLEGAMENTI FLUIDI: "Mentre questo accadeva..." / "Poco dopo..."
- INCORPORA LE LORO PAROLE: trasforma le risposte in narrazione
- RACCONTA, NON DESCRIVERE: azioni, sequenze, momenti che si susseguono

CONTESTO COPPIA
- Sposi: ${brideName} & ${groomName}
- Data matrimonio: ${weddingDate}

DOMANDE & RISPOSTE DA UTILIZZARE\n`;

  // Aggiungi domande e risposte
  questions.forEach(question => {
    const brideAnswer = brideAnswers[question.key] || "—";
    const groomAnswer = groomAnswers[question.key] || "—";
    
    prompt += `- ${question.text}
  • Risposta SPOSA: ${brideAnswer}
  • Risposta SPOSO: ${groomAnswer}
`;
  });

  prompt += `

VINCOLI CREATIVI
- Rispetta rigorosamente i limiti di caratteri per ogni sezione
- Usa SOLO informazioni presenti nelle risposte dei questionari
- Se una risposta manca, sostituisci con elementi generici ma poetici
- Mantieni coerenza narrativa tra tutti i testi
- Ogni testo deve essere autonomo ma parte della storia completa

OUTPUT RICHIESTO - VERO RACCONTO NARRATIVO (JSON)
Restituisci ESCLUSIVAMENTE questo JSON con una STORIA CHE SCORRE come un romanzo:

{
  "prologo": {
    "testo": "RACCONTA come si sono conosciuti (500-600 caratteri). ESEMPIO: 'La storia di Lucrezia e Giuseppe iniziò su un motorino, con una birra e un muretto. Lei non sapeva ancora che quel ragazzo...'",
    "posizione": "Prima pagina dell'album"
  },
  "capitolo_1_lattesa": [
    {"testo": "PARAGRAFO 1 del racconto (400-500 char). ESEMPIO: 'La mattina del 12 settembre, Lucrezia si svegliò con una sensazione diversa. Il rosa pesco che aveva scelto...'"},
    {"testo": "PARAGRAFO 2 che CONTINUA la storia (400-500 char). ESEMPIO: 'Mentre lei si preparava, Giuseppe dall'altra parte della città...'"},
    {"testo": "PARAGRAFO 3 che PROSEGUE (400-500 char). ESEMPIO: 'Le sei sorelle la circondavano come fate protettive. Ognuna...'"},
    {"testo": "PARAGRAFO 4 della narrazione (400-500 char). ESEMPIO: 'In quel momento, Giuseppe stringeva tra le mani...'"},
    {"testo": "PARAGRAFO 5 che continua (400-500 char). ESEMPIO: 'L'ultimo sguardo allo specchio rivelò a Lucrezia...'"},
    {"testo": "PARAGRAFO 6 - transizione al capitolo successivo (400-500 char). ESEMPIO: 'Era arrivato il momento di dirigersi verso...'"}
  ],
  "capitolo_2_incontro": [
    {"testo": "PARAGRAFO 7 - inizio cerimonia (350-450 char). ESEMPIO: 'Quando Lucrezia apparve, Giuseppe sentì il mondo fermarsi. Era la stessa sensazione di quella sera al muretto...'"},
    {"testo": "PARAGRAFO 8 - continua la scena (350-450 char). ESEMPIO: 'I loro occhi si incontrarono e in quell'istante...'"},
    {"testo": "PARAGRAFO 9 - promesse (350-450 char). ESEMPIO: 'Giuseppe prese le sue mani e pronunciò le parole che aveva pensato...'"},
    {"testo": "PARAGRAFO 10 - il sì (350-450 char). ESEMPIO: 'Quando arrivò il momento del sì, entrambi...'"},
    {"testo": "PARAGRAFO 11 - emozioni ospiti (350-450 char). ESEMPIO: 'Intorno a loro, gli invitati...'"},
    {"testo": "PARAGRAFO 12 - primo bacio (350-450 char). ESEMPIO: 'Il primo bacio da sposi fu...'"},
    {"testo": "PARAGRAFO 13 - uscita (350-450 char). ESEMPIO: 'Uscirono mano nella mano mentre...'"},
    {"testo": "PARAGRAFO 14 - transizione festa (350-450 char). ESEMPIO: 'Le congratulazioni si trasformarono in...'"}
  ],
  "capitolo_3_festa": [
    {"testo": "PARAGRAFO 15 - inizio festa (300-400 char). ESEMPIO: 'L'aperitivo iniziò con...'"},
    {"testo": "PARAGRAFO 16 - foto (300-400 char). ESEMPIO: 'Durante le foto di gruppo...'"},
    {"testo": "PARAGRAFO 17 - ricevimento (300-400 char). ESEMPIO: 'Il ricevimento prese vita quando...'"},
    {"testo": "PARAGRAFO 18 - brindisi (300-400 char). ESEMPIO: 'I brindisi si susseguirono...'"},
    {"testo": "PARAGRAFO 19 - primo ballo (300-400 char). ESEMPIO: 'Quando iniziò la loro canzone...'"},
    {"testo": "PARAGRAFO 20 - festa piena (300-400 char). ESEMPIO: 'La festa esplose con...'"},
    {"testo": "PARAGRAFO 21 - momenti divertenti (300-400 char). ESEMPIO: 'Tra una risata e l'altra...'"},
    {"testo": "PARAGRAFO 22 - serata continua (300-400 char). ESEMPIO: 'Anche quando le stelle...'"}
  ],
  "capitolo_4_segreti": [
    {"testo": "PARAGRAFO 23 - momento intimo (500-600 char). ESEMPIO: 'In un momento di silenzio, lontani da tutti, Lucrezia e Giuseppe si ritrovarono soli. Lei pensò a tutte le volte che lui...'"},
    {"testo": "PARAGRAFO 24 - futuro insieme (500-600 char). ESEMPIO: 'Giuseppe la guardò e vide il loro futuro. Sapeva che qualunque strada avessero percorso...'"}
  ],
  "epilogo": {
    "testo": "FINALE della storia (400-500 caratteri). ESEMPIO: 'E così, quella che era iniziata come una storia su un motorino, si trasformò in un romanzo eterno. Il 12 settembre non era la fine, ma l'inizio di...'",
    "posizione": "Ultima pagina dell'album"
  },
  "citazioni_poetiche": [
    {"testo": "Frase poetica estratta dal racconto (100-200 char)", "uso": "Per foto ritratto sposi"},
    {"testo": "Altra citazione dal racconto (100-200 char)", "uso": "Per foto famiglia"},
    {"testo": "Citazione emozionale (100-200 char)", "uso": "Per foto cerimonia"},
    {"testo": "Frase sul primo bacio (100-200 char)", "uso": "Per foto primo bacio"},
    {"testo": "Citazione sulla festa (100-200 char)", "uso": "Per foto festa"},
    {"testo": "Frase sul primo ballo (100-200 char)", "uso": "Per foto primo ballo"},
    {"testo": "Citazione spontanea (100-200 char)", "uso": "Per foto spontanea"},
    {"testo": "Frase sul tramonto (100-200 char)", "uso": "Per foto tramonto"},
    {"testo": "Citazione sui dettagli (100-200 char)", "uso": "Per foto dettagli"},
    {"testo": "Frase sugli amici (100-200 char)", "uso": "Per foto gruppo amici"},
    {"testo": "Citazione intima (100-200 char)", "uso": "Per foto momento intimo"},
    {"testo": "Frase finale (100-200 char)", "uso": "Per foto finale"}
  ],
  "guida_impaginazione": [
    "Pagine 1-3: Prologo + inizio Capitolo 1 (paragrafi 1-2)",
    "Pagine 4-9: Completare Capitolo 1 - L'attesa (paragrafi 3-6)",
    "Pagine 10-19: Capitolo 2 - L'incontro (paragrafi 7-14 + citazioni)",
    "Pagine 20-29: Capitolo 3 - La festa (paragrafi 15-22 + citazioni)",
    "Pagine 30-32: Capitolo 4 - I segreti (paragrafi 23-24)",
    "Pagine 33-35: Epilogo + citazioni finali",
    "IMPORTANTE: Ogni paragrafo deve CONTINUARE la storia del precedente",
    "Totale: 35+ pagine con un VERO RACCONTO che scorre dall'inizio alla fine"
  ]
}`;

  return prompt;
};