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
Sei un master wedding storyteller specializzato nella creazione di storie complete per album di matrimonio. Devi trasformare le risposte del questionario in una narrazione coinvolgente e poetica che accompagni 35+ pagine dell'album fotografico "Memorie Sospese".

OBIETTIVO - STORIA COMPLETA DA 35+ PAGINE
Crea una storia strutturata in capitoli che accompagni tutto l'album:

1) APERTURA DELL'ALBUM (400-500 caratteri)
   - Introduce la coppia e la loro storia d'amore
   - Tono: elegante, emozionale, accogliente

2) STORIA DEI PREPARATIVI (6 testi da 300-400 caratteri ciascuno)
   - L'attesa, l'emozione, gli ultimi momenti prima del "sì"
   - Gli abiti, i profumi, i dettagli preziosi
   - Le emozioni dei genitori e degli amici più cari

3) LA CERIMONIA - CAPITOLO CENTRALE (8 testi da 250-350 caratteri)
   - L'arrivo, lo sguardo che si incrocia
   - Le promesse, i voti, il momento del "sì"
   - L'emozione degli ospiti, le lacrime di gioia
   - Il primo bacio da marito e moglie

4) FESTA E CELEBRAZIONE (8 testi da 200-300 caratteri)
   - L'aperitivo, gli abbracci, le congratulazioni
   - Il ricevimento, i brindisi, i discorsi
   - Il primo ballo, la musica, le risate
   - I momenti spontanei e divertenti

5) PROMESSE SIGILLATE (2 testi da 400-500 caratteri)
   - Sezione intima e personale per la coppia
   - I loro segreti, le promesse private
   - I sogni per il futuro insieme

6) CHIUSURA DELL'ALBUM (300-400 caratteri)
   - Riflessione sul giorno perfetto
   - Apertura verso il futuro insieme
   - Tono: speranzoso, poetico, eterno

7) DIDASCALIE EMOZIONALI (12 testi da 80-150 caratteri)
   - Per le foto più significative
   - Catturano l'essenza di ogni momento

TONO & STILE NARRATIVO
- Narrativa fluida e cinematografica, come un romanzo d'amore
- Italiano elegante ma naturale, evita artifici e cliché vuoti
- Usa dettagli sensoriali: colori, profumi, suoni, emozioni
- Incorpora le loro parole autentiche dalle risposte
- Crea collegamenti tra i vari momenti per una storia coerente
- Personalizza ogni testo con elementi unici della loro storia

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

OUTPUT RICHIESTO - STORIA COMPLETA (JSON)
Restituisci ESCLUSIVAMENTE questo JSON valido con la storia strutturata:

{
  "apertura_album": {
    "testo": "string 400-500 caratteri",
    "posizione": "Prima pagina dell'album"
  },
  "capitolo_preparativi": [
    {"testo": "string 300-400 char", "tema": "L'attesa e l'emozione"},
    {"testo": "string 300-400 char", "tema": "Gli abiti e i dettagli"},
    {"testo": "string 300-400 char", "tema": "Le emozioni di famiglia"},
    {"testo": "string 300-400 char", "tema": "I momenti privati"},
    {"testo": "string 300-400 char", "tema": "L'ultimo momento da fidanzati"},
    {"testo": "string 300-400 char", "tema": "Verso la cerimonia"}
  ],
  "capitolo_cerimonia": [
    {"testo": "string 250-350 char", "tema": "L'arrivo e l'attesa"},
    {"testo": "string 250-350 char", "tema": "Lo sguardo che si incrocia"},
    {"testo": "string 250-350 char", "tema": "Le promesse e i voti"},
    {"testo": "string 250-350 char", "tema": "Il momento del sì"},
    {"testo": "string 250-350 char", "tema": "L'emozione degli ospiti"},
    {"testo": "string 250-350 char", "tema": "Il primo bacio da sposi"},
    {"testo": "string 250-350 char", "tema": "L'uscita dalla chiesa/location"},
    {"testo": "string 250-350 char", "tema": "Le congratulazioni"}
  ],
  "capitolo_festa": [
    {"testo": "string 200-300 char", "tema": "L'aperitivo e gli abbracci"},
    {"testo": "string 200-300 char", "tema": "Le foto di gruppo"},
    {"testo": "string 200-300 char", "tema": "Il ricevimento inizia"},
    {"testo": "string 200-300 char", "tema": "I brindisi e i discorsi"},
    {"testo": "string 200-300 char", "tema": "Il primo ballo"},
    {"testo": "string 200-300 char", "tema": "La festa in pieno"},
    {"testo": "string 200-300 char", "tema": "I momenti divertenti"},
    {"testo": "string 200-300 char", "tema": "La serata che continua"}
  ],
  "promesse_sigillate": [
    {"testo": "string 400-500 char", "tema": "Le promesse private della coppia"},
    {"testo": "string 400-500 char", "tema": "I sogni e il futuro insieme"}
  ],
  "chiusura_album": {
    "testo": "string 300-400 caratteri",
    "posizione": "Ultima pagina dell'album"
  },
  "didascalie_emozionali": [
    {"testo": "string 80-150 char", "uso": "Per foto ritratto sposi"},
    {"testo": "string 80-150 char", "uso": "Per foto famiglia"},
    {"testo": "string 80-150 char", "uso": "Per foto cerimonia"},
    {"testo": "string 80-150 char", "uso": "Per foto primo bacio"},
    {"testo": "string 80-150 char", "uso": "Per foto festa"},
    {"testo": "string 80-150 char", "uso": "Per foto primo ballo"},
    {"testo": "string 80-150 char", "uso": "Per foto spontanea"},
    {"testo": "string 80-150 char", "uso": "Per foto tramonto"},
    {"testo": "string 80-150 char", "uso": "Per foto dettagli"},
    {"testo": "string 80-150 char", "uso": "Per foto gruppo amici"},
    {"testo": "string 80-150 char", "uso": "Per foto momento intimo"},
    {"testo": "string 80-150 char", "uso": "Per foto finale"}
  ],
  "guida_impaginazione": [
    "Pagine 1-3: Apertura + primi 2 preparativi",
    "Pagine 4-9: Completare preparativi (4 testi rimanenti)",
    "Pagine 10-19: Cerimonia completa (8 testi + didascalie)",
    "Pagine 20-29: Festa e celebrazione (8 testi + didascalie)",
    "Pagine 30-32: Promesse sigillate (sezione speciale)",
    "Pagine 33-35: Chiusura + didascalie finali",
    "Distribuzione didascalie: 1-2 per ogni sezione dell'album",
    "Totale: 35+ pagine con testi coinvolgenti e poetici"
  ]
}`;

  return prompt;
};