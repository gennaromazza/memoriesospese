import { describe, expect, it } from "vitest";
import type { Job } from "@shared/jobs-types";
import type { RecentLabShipment } from "@workspace/api-client-react";
import { buildLabJobSearchIndex, filterLabJobs, matchesLabJobSearch, suggestedLabJobs } from "./lab-job-suggestions";

const jobs = [
  { id: "j1", nomeEvento: "Matrimonio José e Anna", jobType: "matrimonio" },
  { id: "j2", nomeEvento: "Album Luca", jobType: "battesimo", clientNames: ["Giulia D'Ambrósio", "Marco Rossi"] },
] as Job[];
const sent = (id: string, jobId: string, date: string, labId = "lab-a"): RecentLabShipment => ({
  id, jobId, labId, sourceType: "photobook", sentAt: date, descrizione: "Album",
});

describe("laboratory Job search and suggestions", () => {
  it("searches linked client names, including multiple clients and accented surnames", () => {
    expect(matchesLabJobSearch(jobs[1], "GIULIA D'AMBROSIO")).toBe(true);
    expect(matchesLabJobSearch(jobs[1], "marco rossi")).toBe(true);
    expect(matchesLabJobSearch(jobs[1], "giulia album")).toBe(true);
    const index = buildLabJobSearchIndex(jobs);
    expect(filterLabJobs(jobs, "rossi", index).map(job => job.id)).toEqual(["j2"]);
    expect(filterLabJobs(jobs, "", index)).toBe(jobs);
    expect(suggestedLabJobs([sent("book", "j2", "2026-10-01T10:00:00Z")], jobs, "lab-a", [], "rossi")).toHaveLength(1);
  });

  it("searches the full data set, even when the picker displays only a bounded result list", () => {
    const manyJobs = Array.from({ length: 5000 }, (_, i) => ({
      id: `job-${i}`, nomeEvento: `Album ${i}`, clientNames: [`Cliente ${i}`], jobType: "album",
    } as Job));
    const index = buildLabJobSearchIndex(manyJobs);
    expect(filterLabJobs(manyJobs, "Cliente 4999", index).map(job => job.id)).toEqual(["job-4999"]);
    expect(filterLabJobs(manyJobs, "Cliente inesistente", index)).toHaveLength(0);
  });
  it("matches multiple words, accents, case, type and ID", () => {
    expect(matchesLabJobSearch(jobs[0], "ANNA jose")).toBe(true);
    expect(matchesLabJobSearch(jobs[1], "battesimo")).toBe(true);
    expect(matchesLabJobSearch(jobs[1], "j2")).toBe(true);
    expect(matchesLabJobSearch(jobs[0], "Luca")).toBe(false);
  });

  it("deduplicates, excludes selected or missing jobs and keeps the latest send first", () => {
    const shipments = [
      sent("old", "j1", "2026-09-01T10:00:00Z"),
      sent("j2", "j2", "2026-10-01T10:00:00Z"),
      sent("latest", "j1", "2026-10-02T10:00:00Z"),
      sent("deleted", "missing-job", "2026-10-03T10:00:00Z"),
    ];
    expect(suggestedLabJobs(shipments, jobs, "lab-a", []).map(row => row.shipment.id)).toEqual(["latest", "j2"]);
    expect(suggestedLabJobs(shipments, jobs, "lab-a", ["j1"]).map(row => row.job.id)).toEqual(["j2"]);
  });

  it("does not suggest another laboratory's jobs or invent a job for unassigned print expenses", () => {
    const shipments = [
      sent("other", "j1", "2026-10-02T10:00:00Z", "lab-b"),
      { ...sent("prints", "", "2026-10-01T10:00:00Z"), sourceType: "print_shop" as const },
    ];
    expect(suggestedLabJobs(shipments, jobs, "lab-a", [])).toEqual([]);
  });

  it("applies the same text search to suggestions", () => {
    const shipments = [sent("album", "j1", "2026-10-01T10:00:00Z")];
    expect(suggestedLabJobs(shipments, jobs, "lab-a", [], "José")).toHaveLength(1);
    expect(suggestedLabJobs(shipments, jobs, "lab-a", [], "Luca")).toEqual([]);
  });
});
