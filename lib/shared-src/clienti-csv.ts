/**
 * Validazione e mapping righe CSV import clienti (logica pura, testabile).
 * Usata dal client (ImportClientiDialog via lib/clienti).
 */
import type { ImportCSVRow, ImportValidationResult, InsertCliente } from './clienti-types';
import {
  isValidCodiceFiscale,
  isValidPartitaIva,
  isValidCodiceSdi,
  isValidPec,
  normalizeFiscalString,
} from './fiscal-validation';

function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

/**
 * Converte una data CSV (dd/mm/yyyy o yyyy-mm-dd) in formato ISO YYYY-MM-DD.
 * Ritorna undefined se non riconosciuta.
 */
export function parseCsvDate(raw?: string): string | undefined {
  const v = raw?.trim();
  if (!v) return undefined;
  let year: number, month: number, day: number;
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const ita = v.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
  if (iso) {
    year = Number(iso[1]); month = Number(iso[2]); day = Number(iso[3]);
  } else if (ita) {
    day = Number(ita[1]); month = Number(ita[2]); year = Number(ita[3]);
  } else {
    return undefined;
  }
  // Verifica che sia una data di calendario reale (es. rifiuta 31/02, 29/02 non bisestile)
  const d = new Date(Date.UTC(year, month - 1, day));
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    return undefined;
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Valida una riga CSV e produce i dati mappati per l'inserimento.
 * I dati fiscali non validi NON bloccano l'import: generano solo warning
 * (il valore viene comunque importato per non perdere informazioni).
 */
export function validateImportRow(
  row: ImportCSVRow,
  existingEmails: Set<string>
): ImportValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validazione campi obbligatori
  if (!row.Nome?.trim()) {
    errors.push('Nome mancante');
  }
  if (!row.Cognome?.trim()) {
    errors.push('Cognome mancante');
  }

  // Validazione email
  const isPlaceholderEmail = row.Email?.toLowerCase().includes('nomail@');
  if (!row.Email?.trim()) {
    errors.push('Email mancante');
  } else if (isPlaceholderEmail) {
    warnings.push('Email placeholder (nomail@) - verrà importato senza email');
  } else {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(row.Email)) {
      errors.push('Email non valida');
    }
  }

  // Dati fiscali: warning non bloccanti se il formato è errato
  const rawCf = row['Codice Fiscale']?.trim();
  if (rawCf && !isValidCodiceFiscale(rawCf)) {
    warnings.push('Codice fiscale non valido (checksum) - verrà importato comunque');
  }
  const rawPiva = row['Partita IVA']?.trim();
  if (rawPiva && !isValidPartitaIva(rawPiva)) {
    warnings.push('Partita IVA non valida - verrà importata comunque');
  }
  const rawSdi = row['Codice SDI']?.trim();
  if (rawSdi && !isValidCodiceSdi(rawSdi)) {
    warnings.push('Codice SDI non valido (7 caratteri) - verrà importato comunque');
  }
  const rawPec = row.PEC?.trim();
  if (rawPec && !isValidPec(rawPec)) {
    warnings.push('PEC non valida - verrà importata comunque');
  }
  const rawDataNascita = row['Data di Nascita']?.trim();
  const dataNascita = parseCsvDate(rawDataNascita);
  if (rawDataNascita && !dataNascita) {
    warnings.push('Data di nascita non riconosciuta (usa GG/MM/AAAA) - verrà ignorata');
  }

  // Check duplicati
  const normalizedEmail = normalizeEmail(row.Email || '');
  if (!isPlaceholderEmail && existingEmails.has(normalizedEmail)) {
    warnings.push('Email già esistente - verrà aggiornato');
  }

  // Mapping dati
  let mappedData: InsertCliente | undefined;
  if (errors.length === 0) {
    mappedData = {
      nome: row.Nome.trim(),
      cognome: row.Cognome.trim(),
      email: isPlaceholderEmail ? `${row.Nome}.${row.Cognome}@noemail.local`.toLowerCase().replace(/\s+/g, '') : normalizeEmail(row.Email),
      cellulare1: row.Phone?.trim() || undefined,
      citta: row.Città?.trim() || undefined,
      cap: row['C.A.P']?.trim() || undefined,
      provincia: row.Provincia?.trim() || undefined,
      codiceFiscale: rawCf ? normalizeFiscalString(rawCf) : undefined,
      partitaIva: rawPiva ? normalizeFiscalString(rawPiva).replace(/^IT/, '') : undefined,
      codiceSdi: rawSdi ? normalizeFiscalString(rawSdi) : undefined,
      pec: rawPec ? rawPec.toLowerCase() : undefined,
      dataNascita,
      luogoNascita: row['Luogo di Nascita']?.trim() || undefined,
      ragioneSociale: row['Nome Azienda']?.trim() || undefined,
      tipoSoggetto: (row['Nome Azienda']?.trim() || rawPiva) ? 'azienda' : undefined,
      note: row['Note Cliente']?.trim() || undefined,
      tags: isPlaceholderEmail ? ['import_csv', 'no_email'] : ['import_csv'],
      status: 'lead',
    };
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    mappedData,
  };
}
