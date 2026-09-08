import { describe, expect, it } from "vitest";
import {
  CONSULTATION_TIME_ZONE,
  createConsultationDateTime,
  NONEXISTENT_LOCAL_TIME_REASON,
} from "./consultation-datetime";

describe("createConsultationDateTime", () => {
  it("interprets ordinary consultation times in Europe/Rome", () => {
    expect(
      createConsultationDateTime("2027-07-15", "10:00").toJSDate().toISOString(),
    ).toBe("2027-07-15T08:00:00.000Z");
  });

  it("rejects a nonexistent spring-transition time", () => {
    const result = createConsultationDateTime("2027-03-28", "02:30");

    expect(result.isValid).toBe(false);
    expect(result.invalidReason).toBe(NONEXISTENT_LOCAL_TIME_REASON);
  });

  it("uses the second occurrence during the autumn transition", () => {
    expect(
      createConsultationDateTime("2027-10-31", "02:30").toJSDate().toISOString(),
    ).toBe("2027-10-31T01:30:00.000Z");
  });
});