// FILE: server/services/UnifiedSlotEngine.ts
import { DateTime } from "luxon";
import { db, Timestamp } from "../firebase-admin.js";
import type { WorkingHours } from "../google-calendar.js";

export interface BusyPeriod {
  start: Date;
  end: Date;
  source: "gcal" | "consultation" | "booking" | "job";
}

export interface UnifiedSlot {
  start: Date;
  end: Date;
  available: boolean;
  reason?: BusyPeriod[];
}

export async function UnifiedSlotEngine({
  date,
  template,
  durataMinuti,
  googleBusy,
}: {
  date: Date;
  template: any;
  durataMinuti: number;
  googleBusy: Array<{ start: string; end: string }>;
}): Promise<UnifiedSlot[]> {
  // 1. Normalize date to Europe/Rome
  const dateRome = DateTime.fromJSDate(date).setZone("Europe/Rome");
  const dayStart = dateRome.startOf("day").toJSDate();
  const dayEnd = dateRome.endOf("day").toJSDate();

  // 2. Working hours from template, fallback to default
  const wh: WorkingHours = template.customWorkingHours || {
    apertura: "09:00",
    pausaInizio: "13:00",
    pausaFine: "14:30",
    chiusura: "19:00",
  };

  function makeDate(time: string): Date {
    return DateTime.fromFormat(
      `${dateRome.toFormat("yyyy-MM-dd")} ${time}`,
      "yyyy-MM-dd HH:mm",
      { zone: "Europe/Rome" },
    ).toJSDate();
  }

  // 3. Create raw slots
  const workingPeriods = [
    { start: makeDate(wh.apertura), end: makeDate(wh.pausaInizio) },
    { start: makeDate(wh.pausaFine), end: makeDate(wh.chiusura) },
  ];

  const rawSlots: UnifiedSlot[] = [];

  for (const p of workingPeriods) {
    let current = new Date(p.start);
    while (current.getTime() + durataMinuti * 60000 <= p.end.getTime()) {
      const end = new Date(current.getTime() + durataMinuti * 60000);
      rawSlots.push({
        start: new Date(current),
        end: new Date(end),
        available: true,
      });
      current = new Date(current.getTime() + 30 * 60000);
    }
  }

  // 4. Busy from Google Calendar
  const busy: BusyPeriod[] = googleBusy.map((b) => ({
    start: new Date(b.start),
    end: new Date(b.end),
    source: "gcal",
  }));

  // 5. Busy from Consultations
  const consultSnap = await db
    .collection("consultations")
    .where("dataConsulenza", ">=", Timestamp.fromDate(dayStart))
    .where("dataConsulenza", "<=", Timestamp.fromDate(dayEnd))
    .get();

  consultSnap.forEach((doc) => {
    const d = doc.data();
    const s = makeDate(d.orarioInizio);
    const e = makeDate(d.orarioFine);
    busy.push({ start: s, end: e, source: "consultation" });
  });

  // 6. Busy from Bookings
  const bookingSnap = await db
    .collection("bookings")
    .where("dataShootingInizio", ">=", Timestamp.fromDate(dayStart))
    .where("dataShootingInizio", "<=", Timestamp.fromDate(dayEnd))
    .get();

  bookingSnap.forEach((doc) => {
    const d = doc.data();
    busy.push({
      start: d.dataShootingInizio.toDate(),
      end: d.dataShootingFine.toDate(),
      source: "booking",
    });
  });

  // 7. Busy from Jobs
  const jobSnap = await db
    .collection("jobs")
    .where("eventDate", ">=", Timestamp.fromDate(dayStart))
    .where("eventDate", "<=", Timestamp.fromDate(dayEnd))
    .get();

  jobSnap.forEach((doc) => {
    const d = doc.data();
    if (d.allDay) {
      busy.push({ start: dayStart, end: dayEnd, source: "job" });
    } else {
      busy.push({
        start: makeDate(d.startTime),
        end: makeDate(d.endTime),
        source: "job",
      });
    }
  });

  // 8. Overlap check
  function overlaps(a: Date, b: Date, x: Date, y: Date) {
    return a < y && b > x;
  }

  rawSlots.forEach((slot) => {
    const conflicts = busy.filter((b) =>
      overlaps(slot.start, slot.end, b.start, b.end),
    );
    if (conflicts.length > 0) {
      slot.available = false;
      slot.reason = conflicts;
    }
  });

  return rawSlots;
}
