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

// Omocodia: nelle posizioni numeriche i numeri possono diventare lettere
const OMOCODIA: Record<string, string> = {
  L: '0', M: '1', N: '2', P: '3', Q: '4', R: '5', S: '6', T: '7', U: '8', V: '9',
};

function digitAt(cf: string, i: number): number | null {
  const c = cf[i];
  if (/\d/.test(c)) return Number(c);
  if (OMOCODIA[c]) return Number(OMOCODIA[c]);
  return null;
}

/**
 * Decodifica data di nascita e sesso direttamente dal codice fiscale
 * (gestisce anche l'omocodia). Il secolo è dedotto: anni ≤ anno corrente → 20xx, altrimenti 19xx.
 */
export function decodeCodiceFiscale(cfRaw: string): { dataNascita?: string; sesso?: 'M' | 'F' } {
  const cf = normalizeFiscalString(cfRaw);
  if (cf.length !== 16) return {};
  const y1 = digitAt(cf, 6);
  const y2 = digitAt(cf, 7);
  const monthIdx = MONTH_LETTERS.indexOf(cf[8]);
  const d1 = digitAt(cf, 9);
  const d2 = digitAt(cf, 10);
  if (y1 === null || y2 === null || monthIdx < 0 || d1 === null || d2 === null) return {};

  let day = d1 * 10 + d2;
  const sesso: 'M' | 'F' = day > 40 ? 'F' : 'M';
  if (day > 40) day -= 40;
  if (day < 1 || day > 31) return {};

  const yy = y1 * 10 + y2;
  const currentYY = new Date().getFullYear() % 100;
  const year = yy <= currentYY ? 2000 + yy : 1900 + yy;

  const mm = String(monthIdx + 1).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return { dataNascita: `${year}-${mm}-${dd}`, sesso };
}

// Pattern CF (con omocodia) su testo OCR normalizzato senza spazi
const CF_PATTERN = /^[A-Z]{6}[0-9LMNPQRSTUV]{2}[ABCDEHLMPRST][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$/;

// Confusioni tipiche dell'OCR: lettera letta al posto di una cifra e viceversa
const TO_DIGIT: Record<string, string> = { O: '0', I: '1', L: '1', Z: '2', S: '5', B: '8', G: '6' };
const TO_LETTER: Record<string, string> = { '0': 'O', '1': 'I', '5': 'S', '8': 'B', '2': 'Z', '6': 'G' };
const LETTER_POS = [0, 1, 2, 3, 4, 5, 8, 11, 15];
const DIGIT_POS = [6, 7, 9, 10, 12, 13, 14];

/** Corregge le confusioni OCR posizione per posizione (cifre attese vs lettere attese). */
function coerceCfWindow(win: string): string {
  const chars = win.split('');
  for (const i of LETTER_POS) if (TO_LETTER[chars[i]]) chars[i] = TO_LETTER[chars[i]];
  for (const i of DIGIT_POS) if (TO_DIGIT[chars[i]] && !/\d/.test(chars[i])) chars[i] = TO_DIGIT[chars[i]];
  return chars.join('');
}

/**
 * Cerca il CF nel testo compattato provando TUTTE le finestre di 16 caratteri:
 * preferisce quella col checksum valido (l'OCR può incollare etichette al codice
 * o confondere O/0, I/1 ecc.). In seconda battuta prova anche a rimuovere un
 * carattere spurio inserito dall'OCR.
 */
export function findCodiceFiscale(compact: string): string | undefined {
  let fallback: string | undefined;
  const tryWindow = (win: string): string | undefined => {
    if (isValidCodiceFiscale(win)) return win;
    const fixed = coerceCfWindow(win);
    if (isValidCodiceFiscale(fixed)) return fixed;
    if (!fallback && CF_PATTERN.test(win)) fallback = win;
    return undefined;
  };
  for (let i = 0; i + 16 <= compact.length; i++) {
    const hit = tryWindow(compact.slice(i, i + 16));
    if (hit) return hit;
  }
  // Un carattere in più inserito dall'OCR: prova le finestre di 17 senza un carattere
  for (let i = 0; i + 17 <= compact.length; i++) {
    const win17 = compact.slice(i, i + 17);
    for (let j = 6; j < 16; j++) {
      const win = win17.slice(0, j) + win17.slice(j + 1);
      if (isValidCodiceFiscale(win)) return win;
      const fixed = coerceCfWindow(win);
      if (isValidCodiceFiscale(fixed)) return fixed;
    }
  }
  return fallback;
}

/** Estrae il valore sulla stessa riga dopo l'etichetta, o sulla riga successiva. */
function valueAfterLabel(lines: string[], labelRe: RegExp): string | undefined {
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(labelRe);
    if (!m) continue;
    const sameLine = lines[i].slice((m.index || 0) + m[0].length).replace(/[/:\\.]/g, ' ').trim();
    if (sameLine && /[A-ZÀ-Ù]/.test(sameLine)) return sameLine;
    for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
      const next = lines[j].trim();
      if (next && /^[A-ZÀ-Ù' ]{2,}(\s*\([A-Z]{2}\))?$/.test(next)) return next;
    }
  }
  return undefined;
}

/**
 * MRZ (Machine Readable Zone) — le 3 righe in basso sul retro della CIE
 * (formato TD1, ICAO 9303): riga 1 = tipo+paese+numero documento (+CF),
 * riga 2 = data nascita, sesso, scadenza; riga 3 = COGNOME<<NOME.
 * È la fonte più affidabile perché stampata in font OCR-B apposta per la lettura.
 */
interface MrzData {
  cognome?: string;
  nome?: string;
  dataNascita?: string;
  sesso?: 'M' | 'F';
  scadenza?: string;
  numeroDocumento?: string;
}

function mrzDate(s: string, kind: 'birth' | 'expiry'): string | undefined {
  const fixed = s.split('').map((c) => (/\d/.test(c) ? c : TO_DIGIT[c] || c)).join('');
  if (!/^\d{6}$/.test(fixed)) return undefined;
  const yy = Number(fixed.slice(0, 2));
  const mm = Number(fixed.slice(2, 4));
  const dd = Number(fixed.slice(4, 6));
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return undefined;
  const currentYY = new Date().getFullYear() % 100;
  // Nascita: nel passato; scadenza: tipicamente nel futuro (2000+)
  const year = kind === 'birth' ? (yy <= currentYY ? 2000 + yy : 1900 + yy) : 2000 + yy;
  return `${year}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

export function parseMrz(rawText: string): MrzData {
  // Righe candidate MRZ: lunghe, solo A-Z 0-9 e "<" (dopo pulizia spazi)
  const lines = rawText
    .toUpperCase()
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ''))
    .filter((l) => l.length >= 20 && /^[A-Z0-9<]+$/.test(l) && l.includes('<'));
  if (lines.length === 0) return {};

  const out: MrzData = {};

  // Riga 1: inizia con C<ITA o CA/CI + ITA — numero documento nei 9 char successivi
  const l1 = lines.find((l) => /^[CI][A-Z<]ITA/.test(l));
  if (l1) {
    const num = l1.slice(5, 14).replace(/</g, '');
    if (/^[A-Z0-9]{7,9}$/.test(num)) out.numeroDocumento = num;
  }

  // Riga 2: AAMMGG + check + sesso + AAMMGG (scadenza) + check + ITA
  const l2 = lines.find((l) => /^[0-9OIL]{6}[0-9OIL][MF<][0-9OIL]{6}/.test(l));
  if (l2) {
    out.dataNascita = mrzDate(l2.slice(0, 6), 'birth');
    const sex = l2[7];
    if (sex === 'M' || sex === 'F') out.sesso = sex;
    out.scadenza = mrzDate(l2.slice(8, 14), 'expiry');
  }

  // Riga 3: COGNOME<<NOME (i "<" singoli separano le parole)
  const l3 = lines.find((l) => l.includes('<<') && /^[A-Z<]+$/.test(l) && !/^[CI][A-Z<]ITA/.test(l));
  if (l3) {
    const [sur, given] = l3.split('<<');
    const clean = (s?: string) => s?.replace(/</g, ' ').trim().replace(/\s+/g, ' ') || undefined;
    out.cognome = clean(sur);
    out.nome = clean(given);
  }

  return out;
}

/**
 * Interpreta il testo OCR di tessera sanitaria / CIE ed estrae i dati.
 * Data di nascita e sesso vengono decodificati dal codice fiscale stesso
 * (più affidabile della lettura OCR delle date).
 */
export function parseOcrText(rawText: string): ExtractedDocumentData {
  const upper = rawText.toUpperCase();
  const lines = upper.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const tipoDocumento: ExtractedDocumentData['tipoDocumento'] = /TESSERA\s+SANITARIA/.test(upper)
    ? 'tessera_sanitaria'
    : /CARTA\s+D.?\s?IDENTIT|REPUBBLICA\s+ITALIANA[\s\S]*IDENTIT/.test(upper)
      ? 'cie'
      : 'sconosciuto';

  // CF: cerca sul testo senza spazi (l'OCR a volte spezza il codice o vi incolla etichette)
  const compact = upper.replace(/[^A-Z0-9]/g, '');
  const codiceFiscale = findCodiceFiscale(compact);

  // MRZ (retro CIE): fonte più affidabile per nome, cognome, date e numero documento
  const mrz = parseMrz(rawText);

  // Nome/cognome: 1) MRZ, 2) riconoscimento tramite CF, 3) etichette
  const fromCf = codiceFiscale ? matchNamesFromCf(upper, codiceFiscale) : {};
  const cognome = mrz.cognome || fromCf.cognome || valueAfterLabel(lines, /COGNOME\b(\s*\/\s*SURNAME)?/);
  const nome = mrz.nome || fromCf.nome || valueAfterLabel(lines, /\bNOME\b(\s*\/\s*NAME)?/);
  // Luogo di nascita: etichetta dedicata, altrimenti pattern "CITTÀ (PR)" nel testo
  const luogoNascita =
    valueAfterLabel(lines, /LUOGO\s+(E\s+DATA\s+)?DI\s+NASCITA|PLACE\s+OF\s+BIRTH/) ||
    upper.match(/([A-ZÀ-Ù][A-ZÀ-Ù' ]+\([A-Z]{2}\))/)?.[1]?.trim();

  // CIE: numero documento (es. CA12345AA) e scadenza
  const numeroDocumento = tipoDocumento === 'cie'
    ? compact.match(/[A-Z]{2}\d{5}[A-Z]{2}/)?.[0]
    : undefined;
  let scadenza: string | undefined;
  if (tipoDocumento === 'cie') {
    const sc = upper.match(/SCADENZA[^\d]*(\d{2})[./-](\d{2})[./-](\d{4})/);
    if (sc) scadenza = `${sc[3]}-${sc[2]}-${sc[1]}`;
  }

  const decoded = codiceFiscale ? decodeCodiceFiscale(codiceFiscale) : {};

  const hasMrz = Boolean(mrz.dataNascita || mrz.numeroDocumento || mrz.cognome);
  return {
    // Se c'è la MRZ è sicuramente una CIE (retro)
    tipoDocumento: tipoDocumento === 'sconosciuto' && hasMrz ? 'cie' : tipoDocumento,
    codiceFiscale,
    nome: cleanName(nome),
    cognome: cleanName(cognome),
    sesso: decoded.sesso || mrz.sesso,
    dataNascita: decoded.dataNascita || mrz.dataNascita,
    luogoNascita: cleanName(luogoNascita),
    numeroDocumento: mrz.numeroDocumento || numeroDocumento,
    scadenza: mrz.scadenza || scadenza,
  };
}

// Parole che non sono mai nomi/cognomi (etichette dei documenti)
const LABEL_WORDS = new Set([
  'COGNOME', 'NOME', 'SURNAME', 'NAME', 'SESSO', 'SEX', 'NASCITA', 'LUOGO', 'DATA',
  'CODICE', 'FISCALE', 'TESSERA', 'SANITARIA', 'CARTA', 'NAZIONALE', 'SERVIZI',
  'IDENTITA', 'REPUBBLICA', 'ITALIANA', 'SCADENZA', 'EXPIRY', 'COMUNE', 'PROVINCIA',
  'BIRTH', 'PLACE', 'CITTADINANZA', 'NATIONALITY', 'EMISSIONE', 'FIRMA', 'VALIDA',
]);

/**
 * Riconosce cognome e nome tra le parole del testo OCR usando il CF come
 * chiave: le prime 3 lettere codificano il cognome, le successive 3 il nome.
 * Prova parole singole e coppie di parole adiacenti (nomi/cognomi composti).
 */
function matchNamesFromCf(upperText: string, cf: string): { cognome?: string; nome?: string } {
  const surnameCode = cf.slice(0, 3);
  const nameCode = cf.slice(3, 6);
  const words = (upperText.match(/[A-ZÀ-Ù']{2,}/g) || []).filter(
    (w) => !LABEL_WORDS.has(w) && !cf.includes(w) // esclude pezzi del CF stesso
  );
  const candidates: string[] = [...words];
  for (let i = 0; i + 1 < words.length; i++) candidates.push(`${words[i]} ${words[i + 1]}`);

  let cognome: string | undefined;
  let nome: string | undefined;
  for (const c of candidates) {
    if (!cognome && cfSurnameCode(c) === surnameCode) cognome = c;
    if (!nome && cfNameCode(c) === nameCode) nome = c;
  }
  // Evita di assegnare la stessa parola a entrambi (es. codici uguali per caso)
  if (cognome && nome && cognome === nome) nome = undefined;
  return { cognome, nome };
}

function cleanName(v?: string): string | undefined {
  if (!v) return undefined;
  // Rimuove eventuali code di etichette bilingue e parentesi (es. "ROMA (RM)" resta)
  const t = v.replace(/\b(SURNAME|NAME|PLACE OF BIRTH)\b/g, '').replace(/\s{2,}/g, ' ').trim();
  return t || undefined;
}

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
