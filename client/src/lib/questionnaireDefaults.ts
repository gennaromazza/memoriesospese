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
 * Template per export ChatGPT
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
Sei un senior wedding storyteller. Devi trasformare risposte di questionario in testi brevi e poetici da impaginare in un album di matrimonio fisico + digitale (Memorie Sospese).

OBIETTIVO
Genera:
1) 6–9 micro-testi (max 180–220 caratteri ciascuno) da inserire tra le pagine (preparativi, cerimonia, amici, primo ballo, promessa, futuro).
2) 1 testo di apertura (max 300 caratteri) e 1 di chiusura (max 300 caratteri).
3) 3 didascalie "emozionali" (max 120 caratteri) per pagine foto full-bleed.
4) 1 sezione "Promessa sigillata" (solo per gli sposi, tono intimo, max 250 caratteri).

TONO & STILE
- Intimo, elegante, concreto; niente cliché vuoti.
- Scrivi in italiano naturale, frasi brevi, immagini evocative.
- Usa le loro parole quando possibile (parafrasa se serve).
- Evita nomi di terzi non citati nelle risposte.

CONTESTO COPPIA
- Sposi: ${brideName} & ${groomName}
- Data matrimonio: ${weddingDate}

DOMANDE & RISPOSTE\n`;

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
VINCOLI
- Non superare i limiti di caratteri indicati.
- Non inventare fatti non presenti.
- Se una risposta manca, ignora la domanda e non forzare contenuti.

OUTPUT RICHIESTO (JSON)
Restituisci ESCLUSIVAMENTE questo JSON valido:
{
  "apertura": "string, <=300 char",
  "microtesti": ["string<=220", "string<=220", "string<=220", "string<=220", "string<=220", "string<=220"],
  "didascalie": ["string<=120", "string<=120", "string<=120"],
  "promessa_sigillata": "string<=250",
  "chiusura": "string<=300",
  "note_impaginazione": [
    "Suggerisci in 3-5 righe come distribuire i microtesti tra le sezioni dell'album, es. Pag. preparativi: microtesto #1; cerimonia: #2; amici: #3; primo ballo: #4; promessa: #5; futuro: #6."
  ]
}`;

  return prompt;
};