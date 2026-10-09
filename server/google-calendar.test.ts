import { describe, it, expect } from "vitest";
import { classifyCalendarEvent, toGoogleTimedBoundary } from "./google-calendar";

// ---------------------------------------------------------------------------
// Regression guard for Task #70: Google all-day events default to
// transparency:'transparent'. A blanket "Libero" filter silently dropped them,
// so full-day blocks never blocked slots. These tests pin the rule:
//   - KEEP all-day transparent events
//   - DROP timed transparent events
// See .agents/memory/google-allday-transparency.md
// ---------------------------------------------------------------------------

describe("classifyCalendarEvent (busy-event filter)", () => {
  it("KEEPS an all-day transparent event (the Task #70 regression)", () => {
    const event = {
      status: "confirmed",
      transparency: "transparent", // Google all-day default
      start: { date: "2026-06-25" }, // all-day → .date, not .dateTime
    };
    const result = classifyCalendarEvent(event);
    expect(result.include).toBe(true);
    expect(result.isAllDay).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it("KEEPS a multi-day all-day transparent event", () => {
    const event = {
      status: "confirmed",
      transparency: "transparent",
      start: { date: "2026-06-25" },
    };
    const result = classifyCalendarEvent(event);
    expect(result.include).toBe(true);
    expect(result.isAllDay).toBe(true);
  });

  it("DROPS a timed transparent event ('Libero' busy=free)", () => {
    const event = {
      status: "confirmed",
      transparency: "transparent",
      start: { dateTime: "2026-06-25T10:00:00+02:00" }, // timed → .dateTime
    };
    const result = classifyCalendarEvent(event);
    expect(result.include).toBe(false);
    expect(result.reason).toBe("transparent");
    expect(result.isAllDay).toBe(false);
  });

  it("KEEPS a timed opaque (busy) event", () => {
    const event = {
      status: "confirmed",
      transparency: "opaque",
      start: { dateTime: "2026-06-25T10:00:00+02:00" },
    };
    const result = classifyCalendarEvent(event);
    expect(result.include).toBe(true);
    expect(result.isAllDay).toBe(false);
  });

  it("KEEPS a timed event with missing transparency (defaults to opaque)", () => {
    const event = {
      status: "confirmed",
      start: { dateTime: "2026-06-25T10:00:00+02:00" },
    };
    const result = classifyCalendarEvent(event);
    expect(result.include).toBe(true);
  });

  it("DROPS a cancelled event regardless of all-day/transparency", () => {
    const event = {
      status: "cancelled",
      transparency: "opaque",
      start: { date: "2026-06-25" },
    };
    const result = classifyCalendarEvent(event);
    expect(result.include).toBe(false);
    expect(result.reason).toBe("cancelled");
  });

  it("KEEPS an all-day opaque event", () => {
    const event = {
      status: "confirmed",
      transparency: "opaque",
      start: { date: "2026-06-25" },
    };
    const result = classifyCalendarEvent(event);
    expect(result.include).toBe(true);
    expect(result.isAllDay).toBe(true);
  });
});

describe("Google timed boundaries retain the selected instant", () => {
  it.each([
    ["2026-01-14T23:15:00Z", "2026-01-15T00:15:00+01:00"],
    ["2026-07-14T22:15:00Z", "2026-07-15T00:15:00+02:00"],
    ["2026-03-29T00:45:00Z", "2026-03-29T01:45:00+01:00"],
    ["2026-03-29T01:15:00Z", "2026-03-29T03:15:00+02:00"],
    ["2026-10-25T00:30:00Z", "2026-10-25T02:30:00+02:00"],
    ["2026-10-25T01:30:00Z", "2026-10-25T02:30:00+01:00"],
  ])("serializes %s as RFC3339 %s, without ambiguous floating times", (iso, expected) => {
    const start = new Date(iso);
    const boundary = toGoogleTimedBoundary(start);
    expect(boundary).toEqual({ dateTime: expected, timeZone: "Europe/Rome" });
    expect(new Date(boundary.dateTime)).toEqual(start);
  });
});
