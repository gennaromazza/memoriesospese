import { DateTime } from "luxon";

export const CONSULTATION_TIME_ZONE = "Europe/Rome";
const CONSULTATION_DATE_TIME_FORMAT = "yyyy-MM-dd HH:mm";
export const NONEXISTENT_LOCAL_TIME_REASON = "nonexistent local time";

/**
 * Interpreta una data e un orario inseriti dall'amministratore come valori
 * locali Europe/Rome, indipendentemente dal timezone del processo Node.
 *
 * Policy per i cambi d'ora:
 * - un orario nel salto primaverile che non esiste viene restituito come
 *   DateTime non valido, invece di lasciarlo normalizzare silenziosamente;
 * - un orario ripetuto nel ritorno all'ora solare usa la seconda occorrenza,
 *   cioè quella con l'offset minore (CET, UTC+1), così una consulenza
 *   02:30–03:30 mantiene la durata locale configurata.
 */
export function createConsultationDateTime(
  date: string,
  time: string,
): DateTime {
  const dateTime = DateTime.fromFormat(
    `${date} ${time}`,
    CONSULTATION_DATE_TIME_FORMAT,
    { zone: CONSULTATION_TIME_ZONE },
  );

  if (!dateTime.isValid) {
    return dateTime;
  }

  // Luxon shifts a nonexistent local time forward during the spring
  // transition. A round-trip check lets us reject that shift explicitly.
  if (dateTime.toFormat(CONSULTATION_DATE_TIME_FORMAT) !== `${date} ${time}`) {
    return DateTime.invalid(
      NONEXISTENT_LOCAL_TIME_REASON,
      `${date} ${time} does not exist in ${CONSULTATION_TIME_ZONE} because of the daylight-saving transition`,
    );
  }

  // During the autumn transition Luxon exposes both possible offsets. Choose
  // the second wall-clock occurrence explicitly (standard time), rather than
  // relying on the library's default disambiguation. This keeps normal
  // consultation durations aligned with the displayed local end time.
  const possibleOffsets = dateTime.getPossibleOffsets();
  if (possibleOffsets.length > 1) {
    return possibleOffsets.reduce((firstOccurrence, candidate) =>
      candidate.offset < firstOccurrence.offset ? candidate : firstOccurrence,
    );
  }

  return dateTime;
}

/**
 * Recupera la data locale della consulenza da un timestamp Firestore/JS.
 */
export function getConsultationLocalDate(date: Date): string {
  return DateTime.fromJSDate(date, {
    zone: CONSULTATION_TIME_ZONE,
  }).toFormat("yyyy-MM-dd");
}