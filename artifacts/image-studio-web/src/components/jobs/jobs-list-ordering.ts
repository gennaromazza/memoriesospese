import { convertFirestoreTimestamp } from '@/lib/firebase';
import { getQuickQuoteDisplayDate } from '@shared/job-display';

export type JobListPeriod = 'all' | 'upcoming' | 'past';
export type JobListSection = 'leads' | 'today' | 'upcoming' | 'undated' | 'past';

export type JobListSortItem = {
  id: string;
  nomeEvento?: string;
  status: string;
  eventDate?: unknown;
  createdAt?: unknown;
  quickQuoteCompiledAt?: unknown;
  updatedAt?: unknown;
  startTime?: string;
};

export type JobQuoteListStatus = {
  isSigned?: boolean;
} | null | undefined;

const SIGNED_JOB_STATUSES = new Set([
  'confermato',
  'shooting_fatto',
  'selezione_pending',
  'produzione',
  'consegnato',
]);

function validDate(value: unknown): Date | null {
  if (!value) return null;
  const date = convertFirestoreTimestamp(value);
  return date && Number.isFinite(date.getTime()) ? date : null;
}

function isSignedJob(job: JobListSortItem, quoteStatus?: JobQuoteListStatus): boolean {
  return Boolean(quoteStatus?.isSigned || SIGNED_JOB_STATUSES.has(job.status));
}

function getEventDate(job: JobListSortItem): Date | null {
  return validDate(job.eventDate);
}

function getLeadActivityDate(job: JobListSortItem): Date | null {
  return getQuickQuoteDisplayDate(job) ?? validDate(job.updatedAt);
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function getJobListSection(
  job: JobListSortItem,
  quoteStatus: JobQuoteListStatus,
  referenceDate = new Date(),
): JobListSection {
  if (!isSignedJob(job, quoteStatus)) return 'leads';

  const eventDate = getEventDate(job);
  if (!eventDate) return 'undated';

  const today = startOfDay(referenceDate);
  if (eventDate < today) return 'past';
  if (eventDate < new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)) return 'today';

  return 'upcoming';
}

function sectionRank(section: JobListSection, period: JobListPeriod): number {
  if (period === 'past') {
    return { leads: 0, past: 1, undated: 2, today: 3, upcoming: 4 }[section];
  }

  return { leads: 0, today: 1, upcoming: 2, undated: 3, past: 4 }[section];
}

function compareMissingLast(a: number | null, b: number | null, descending: boolean): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return descending ? b - a : a - b;
}

function startTimeMinutes(value?: string): number | null {
  const match = value?.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function sortJobsForDisplay<T extends JobListSortItem>(
  jobs: readonly T[],
  quoteStatuses: Readonly<Record<string, JobQuoteListStatus>>,
  period: JobListPeriod,
  referenceDate = new Date(),
): T[] {
  const sections = new Map(
    jobs.map((job) => [
      job.id,
      getJobListSection(job, quoteStatuses[job.id], referenceDate),
    ]),
  );

  return [...jobs].sort((a, b) => {
    const sectionA = sections.get(a.id)!;
    const sectionB = sections.get(b.id)!;
    const rankDiff = sectionRank(sectionA, period) - sectionRank(sectionB, period);
    if (rankDiff !== 0) return rankDiff;

    if (sectionA === 'leads' || sectionA === 'undated') {
      const activityA = getLeadActivityDate(a)?.getTime() ?? null;
      const activityB = getLeadActivityDate(b)?.getTime() ?? null;
      const activityDiff = compareMissingLast(activityA, activityB, true);
      if (activityDiff !== 0) return activityDiff;
    } else {
      const eventA = getEventDate(a)?.getTime() ?? null;
      const eventB = getEventDate(b)?.getTime() ?? null;
      const dateDiff = compareMissingLast(eventA, eventB, sectionA === 'past');
      if (dateDiff !== 0) return dateDiff;

      const timeDiff = compareMissingLast(
        startTimeMinutes(a.startTime),
        startTimeMinutes(b.startTime),
        sectionA === 'past',
      );
      if (timeDiff !== 0) return timeDiff;
    }

    return (a.nomeEvento || a.id).localeCompare(b.nomeEvento || b.id, 'it');
  });
}
