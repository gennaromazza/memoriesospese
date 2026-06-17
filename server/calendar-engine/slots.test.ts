import { describe, it, expect } from "vitest";
import { DateTime } from "luxon";
import { computeEarliestBookableDate } from "./slots";

// Helper: format a DateTime result to yyyy-MM-dd for readable assertions.
const fmt = (dt: DateTime) => dt.toFormat("yyyy-MM-dd");

describe("computeEarliestBookableDate", () => {
  describe("lead disabled (leadWorkingDays <= 0)", () => {
    it("returns 'today' (start of day, Rome) when lead is 0", () => {
      const now = "2026-06-17"; // Wednesday
      const result = computeEarliestBookableDate(now, 0, new Set());
      expect(fmt(result)).toBe("2026-06-17");
      // It is start-of-day in Europe/Rome
      expect(result.zoneName).toBe("Europe/Rome");
      expect(result.hour).toBe(0);
      expect(result.minute).toBe(0);
    });

    it("returns 'today' when lead is negative", () => {
      const result = computeEarliestBookableDate("2026-06-17", -3, new Set());
      expect(fmt(result)).toBe("2026-06-17");
    });

    it("returns 'today' when lead is NaN/falsy", () => {
      // @ts-expect-error simulate a missing config value coming from Firestore
      const result = computeEarliestBookableDate("2026-06-17", undefined, new Set());
      expect(fmt(result)).toBe("2026-06-17");
    });
  });

  describe("counting working days", () => {
    it("counts from the day AFTER now and returns the day after the last working day", () => {
      // now = Monday 2026-06-15, lead = 2 (no Sundays/all-day in window)
      // +1 Tue 16 (count 1), +1 Wed 17 (count 2) -> earliest = Thu 18
      const result = computeEarliestBookableDate("2026-06-15", 2, new Set());
      expect(fmt(result)).toBe("2026-06-18");
    });

    it("skips Sundays while counting", () => {
      // now = Friday 2026-06-19, lead = 2
      // +1 Sat 20 (count 1), +1 Sun 21 (SKIP), +1 Mon 22 (count 2) -> earliest = Tue 23
      const result = computeEarliestBookableDate("2026-06-19", 2, new Set());
      expect(fmt(result)).toBe("2026-06-23");
    });

    it("skips all-day-event days while counting", () => {
      // now = Monday 2026-06-15, lead = 2, all-day on Wed 2026-06-17
      // +1 Tue 16 (count 1), +1 Wed 17 (all-day SKIP), +1 Thu 18 (count 2) -> earliest = Fri 19
      const allDay = new Set(["2026-06-17"]);
      const result = computeEarliestBookableDate("2026-06-15", 2, allDay);
      expect(fmt(result)).toBe("2026-06-19");
    });

    it("skips both Sundays and all-day days in the same window", () => {
      // now = Friday 2026-06-19, lead = 2, all-day on Mon 2026-06-22
      // +1 Sat 20 (count 1), +1 Sun 21 (SKIP), +1 Mon 22 (all-day SKIP),
      // +1 Tue 23 (count 2) -> earliest = Wed 24
      const allDay = new Set(["2026-06-22"]);
      const result = computeEarliestBookableDate("2026-06-19", 2, allDay);
      expect(fmt(result)).toBe("2026-06-24");
    });

    it("accepts a JS Date as 'now' and normalizes to start of day", () => {
      const now = DateTime.fromISO("2026-06-15T15:30:00", { zone: "Europe/Rome" }).toJSDate();
      const result = computeEarliestBookableDate(now, 1, new Set());
      // +1 Tue 16 (count 1) -> earliest = Wed 17
      expect(fmt(result)).toBe("2026-06-17");
      expect(result.hour).toBe(0);
    });
  });
});
