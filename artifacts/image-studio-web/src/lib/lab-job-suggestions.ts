import type { Job } from "@shared/jobs-types";
import type { RecentLabShipment } from "@workspace/api-client-react";

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Built only when the Job data changes, not on each keystroke. */
export function buildLabJobSearchIndex(jobs: Job[]) {
  return new Map(jobs.map(job => [job.id, normalize(
    `${job.nomeEvento || ""} ${job.clientNames?.join(" ") || ""} ${job.jobType || ""} ${job.id}`,
  )]));
}

export function filterLabJobs(jobs: Job[], search: string, index: Map<string, string>) {
  const words = normalize(search).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return jobs;
  return jobs.filter(job => {
    const text = index.get(job.id) || "";
    return words.every(word => text.includes(word));
  });
}

export function matchesLabJobSearch(job: Job, search: string) {
  return filterLabJobs([job], search, buildLabJobSearchIndex([job])).length > 0;
}

export function suggestedLabJobs(
  shipments: RecentLabShipment[], jobs: Job[], labId: string,
  selectedIds: string[], search = "", limit = 6,
) {
  const available = new Map(jobs.map(job => [job.id, job]));
  const seen = new Set(selectedIds);
  return [...shipments].sort((a, b) => b.sentAt.localeCompare(a.sentAt)).flatMap(shipment => {
    if (shipment.labId !== labId || !shipment.jobId || seen.has(shipment.jobId)) return [];
    const job = available.get(shipment.jobId);
    if (!job || !matchesLabJobSearch(job, search)) return [];
    seen.add(job.id);
    return [{ job, shipment }];
  }).slice(0, limit);
}
