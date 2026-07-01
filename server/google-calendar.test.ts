import { describe, it, expect } from "vitest";
import { classifyCalendarEvent } from "./google-calendar";

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
