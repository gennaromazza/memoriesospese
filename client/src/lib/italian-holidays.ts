import { isSameDay } from 'date-fns';

/**
 * Festività italiane fisse
 */
const FIXED_HOLIDAYS = [
  { month: 0, day: 1 },   // Capodanno
  { month: 0, day: 6 },   // Epifania
  { month: 3, day: 25 },  // Festa della Liberazione
  { month: 4, day: 1 },   // Festa dei Lavoratori
  { month: 5, day: 2 },   // Festa della Repubblica
  { month: 7, day: 15 },  // Ferragosto
  { month: 10, day: 1 },  // Ognissanti
  { month: 11, day: 8 },  // Immacolata Concezione
  { month: 11, day: 25 }, // Natale
  { month: 11, day: 26 }, // Santo Stefano
];

/**
 * Calcola la data di Pasqua per un dato anno usando l'algoritmo di Gauss
 */
function getEasterDate(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  
  return new Date(year, month, day);
}

/**
 * Verifica se una data è domenica
 */
export function isSunday(date: Date): boolean {
  return date.getDay() === 0;
}

/**
 * Verifica se una data è una festività italiana
 */
export function isItalianHoliday(date: Date): boolean {
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();
  
  // Controlla festività fisse
  const isFixedHoliday = FIXED_HOLIDAYS.some(
    holiday => holiday.month === month && holiday.day === day
  );
  
  if (isFixedHoliday) return true;
  
  // Calcola Pasqua e Pasquetta (giorno dopo Pasqua)
  const easter = getEasterDate(year);
  const easterMonday = new Date(easter);
  easterMonday.setDate(easter.getDate() + 1);
  
  return isSameDay(date, easter) || isSameDay(date, easterMonday);
}

/**
 * Verifica se una data è domenica o festività italiana
 */
export function isSundayOrHoliday(date: Date): boolean {
  return isSunday(date) || isItalianHoliday(date);
}
