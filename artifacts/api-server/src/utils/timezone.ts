import { DateTime } from "luxon";

const ROME_ZONE = "Europe/Rome";

export function nowRome(): DateTime {
  return DateTime.now().setZone(ROME_ZONE);
}

export function nowRomeDate(): Date {
  return nowRome().toJSDate();
}

export function todayRomeStart(): Date {
  return nowRome().startOf("day").toJSDate();
}

export function todayRomeEnd(): Date {
  return nowRome().endOf("day").toJSDate();
}

export function toRomeDateTime(date: Date | string | number): DateTime {
  if (typeof date === "string") {
    return DateTime.fromISO(date, { zone: ROME_ZONE });
  }
  if (typeof date === "number") {
    return DateTime.fromMillis(date, { zone: ROME_ZONE });
  }
  return DateTime.fromJSDate(date).setZone(ROME_ZONE);
}

export function daysAgoRome(days: number): Date {
  return nowRome().minus({ days }).toJSDate();
}

export function daysFromNowRome(days: number): Date {
  return nowRome().plus({ days }).toJSDate();
}

export function formatRomeDate(
  date: Date | string,
  format: string = "dd/MM/yyyy"
): string {
  const dt =
    typeof date === "string"
      ? DateTime.fromISO(date, { zone: ROME_ZONE })
      : DateTime.fromJSDate(date).setZone(ROME_ZONE);
  return dt.toFormat(format);
}

export function formatRomeDateLocale(
  date: Date | string,
  options: Intl.DateTimeFormatOptions = {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }
): string {
  const dt =
    typeof date === "string"
      ? DateTime.fromISO(date, { zone: ROME_ZONE })
      : DateTime.fromJSDate(date).setZone(ROME_ZONE);
  return dt.toJSDate().toLocaleDateString("it-IT", {
    ...options,
    timeZone: ROME_ZONE,
  });
}

export function romeStartOfDay(date: Date): Date {
  return DateTime.fromJSDate(date).setZone(ROME_ZONE).startOf("day").toJSDate();
}

export function romeEndOfDay(date: Date): Date {
  return DateTime.fromJSDate(date).setZone(ROME_ZONE).endOf("day").toJSDate();
}

export function isBeforeRome(a: Date, b: Date): boolean {
  return toRomeDateTime(a).toMillis() < toRomeDateTime(b).toMillis();
}

export function isSameRomeDay(a: Date, b: Date): boolean {
  const dtA = toRomeDateTime(a);
  const dtB = toRomeDateTime(b);
  return (
    dtA.year === dtB.year && dtA.month === dtB.month && dtA.day === dtB.day
  );
}

export function romeYear(): number {
  return nowRome().year;
}

export function romeToISODate(): string {
  return nowRome().toISODate()!;
}
