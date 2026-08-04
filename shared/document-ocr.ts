/**
 * Tipi e verifica incrociata per l'OCR dei documenti d'identità
 * (tessera sanitaria / carta d'identità elettronica).
 *
 * La verifica incrociata confronta il codice fiscale estratto con i dati
 * anagrafici estratti (cognome, nome, data di nascita, sesso) secondo le
 * regole ufficiali di composizione del CF. Il luogo di nascita non viene
 * verificato (richiederebbe la tabella dei codici Belfiore).
 */
import { isValidCodiceFiscale, normalizeFiscalString } from './fiscal-validation';

export interface ExtractedDocumentData {
  tipoDocumento: 'tessera_sanitaria' | 'cie' | 'sconosciuto';
  codiceFiscale?: string;
  nome?: string;
  cognome?: string;
  sesso?: 'M' | 'F';
  dataNascita?: string; // YYYY-MM-DD
  luogoNascita?: string;
  numeroDocumento?: string; // solo CIE
  scadenza?: string; // YYYY-MM-DD, solo CIE
}

export interface DocumentCrossCheck {
  cfChecksumValid: boolean;
  warnings: string[];
}

const VOWELS = 'AEIOU';

function lettersOnly(s: string): string {
  // Traslittera i caratteri accentati e tiene solo A-Z
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '');
}

function consonantsOf(s: string): string {
  return [...s].filter((c) => !VOWELS.includes(c)).join('');
}

function vowelsOf(s: string): string {
  return [...s].filter((c) => VOWELS.includes(c)).join('');
}

/** Codice a 3 lettere del cognome secondo le regole CF. */
export function cfSurnameCode(cognome: string): string {
  const s = lettersOnly(cognome);
  return (consonantsOf(s) + vowelsOf(s) + 'XXX').slice(0, 3);
}

/** Codice a 3 lettere del nome secondo le regole CF (regola delle 4 consonanti). */
export function cfNameCode(nome: string): string {
  const s = lettersOnly(nome);
  const cons = consonantsOf(s);
  const base = cons.length >= 4 ? cons[0] + cons[2] + cons[3] : cons;
  return (base + vowelsOf(s) + 'XXX').slice(0, 3);
}

const MONTH_LETTERS = 'ABCDEHLMPRST'; // gennaio=A ... dicembre=T

/**
 * Verifica incrociata CF ↔ dati anagrafici estratti.
 * Ogni discordanza produce un warning; nessun controllo è bloccante.
 */
export function crossCheckDocument(data: ExtractedDocumentData): DocumentCrossCheck {
  const warnings: string[] = [];
  const cf = data.codiceFiscale ? normalizeFiscalString(data.codiceFiscale) : '';

  if (!cf) {
    return { cfChecksumValid: false, warnings: ['Codice fiscale non trovato nel documento'] };
  }

  const cfChecksumValid = isValidCodiceFiscale(cf);
  if (!cfChecksumValid) {
    warnings.push('Il codice fiscale letto non supera il controllo del carattere finale: verifica che sia stato letto bene');
  }

  if (cf.length === 16) {
    if (data.cognome) {
      const expected = cfSurnameCode(data.cognome);
      if (cf.slice(0, 3) !== expected) {
        warnings.push(`Il cognome "${data.cognome}" non combacia con il codice fiscale (atteso ${expected}, trovato ${cf.slice(0, 3)})`);
      }
    }
    if (data.nome) {
      const expected = cfNameCode(data.nome);
      if (cf.slice(3, 6) !== expected) {
        warnings.push(`Il nome "${data.nome}" non combacia con il codice fiscale (atteso ${expected}, trovato ${cf.slice(3, 6)})`);
      }
    }
    if (data.dataNascita && /^\d{4}-\d{2}-\d{2}$/.test(data.dataNascita)) {
      const [year, month, day] = data.dataNascita.split('-').map(Number);
      // Nota: nei CF con omocodia i numeri possono diventare lettere; in quel
      // caso il confronto numerico diretto può fallire — segnaliamo comunque.
      const cfYear = cf.slice(6, 8);
      const cfMonth = cf[8];
      const cfDayRaw = cf.slice(9, 11);
      const expectedYear = String(year % 100).padStart(2, '0');
      const expectedMonth = MONTH_LETTERS[month - 1];
      if (/^\d{2}$/.test(cfYear) && cfYear !== expectedYear) {
        warnings.push(`L'anno di nascita non combacia con il codice fiscale`);
      }
      if (cfMonth !== expectedMonth) {
        warnings.push(`Il mese di nascita non combacia con il codice fiscale`);
      }
      if (/^\d{2}$/.test(cfDayRaw)) {
        const cfDay = Number(cfDayRaw);
        const matchesM = cfDay === day;
        const matchesF = cfDay === day + 40;
        if (!matchesM && !matchesF) {
          warnings.push(`Il giorno di nascita non combacia con il codice fiscale`);
        } else if (data.sesso === 'M' && !matchesM) {
          warnings.push(`Il codice fiscale indica sesso femminile ma il documento riporta M`);
        } else if (data.sesso === 'F' && !matchesF) {
          warnings.push(`Il codice fiscale indica sesso maschile ma il documento riporta F`);
        }
      }
    }
  }

  return { cfChecksumValid, warnings };
}
