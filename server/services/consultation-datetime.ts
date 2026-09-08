import { DateTime } from "luxon";

export const CONSULTATION_TIME_ZONE = "Europe/Rome";
const CONSULTATION_DATE_TIME_FORMAT = "yyyy-MM-dd HH:mm";

/**
 * Interpreta una data e un orario inseriti dall'amministratore come valori
 * locali Europe/Rome, indipendentemente dal timezone del processo Node.
 */
export function createConsultationDateTime(
  date: string,
  time: string,
): DateTime {
  return DateTime.fromFormat(
    `${date} ${time}`,
    CONSULTATION_DATE_TIME_FORMAT,
    { zone: CONSULTATION_TIME_ZONE },
  );
}

/**
 * Recupera la data locale della consulenza da un timestamp Firestore/JS.
 */
export function getConsultationLocalDate(date: Date): string {
  return DateTime.fromJSDate(date, {
    zone: CONSULTATION_TIME_ZONE,
  }).toFormat("yyyy-MM-dd");
}