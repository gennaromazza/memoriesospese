import { describe, expect, it } from 'vitest';
import {
  getJobListSection,
  sortJobsForDisplay,
  type JobListSortItem,
} from './jobs-list-ordering';

function job(
  id: string,
  status: string,
  eventDate?: Date,
  createdAt?: Date,
  startTime?: string,
): JobListSortItem {
  return { id, nomeEvento: id, status, eventDate, createdAt, startTime };
}

describe('jobs list ordering', () => {
  const today = new Date(2026, 9, 18, 10, 0);

  it('separates unsigned requests and orders today, future, undated, then past', () => {
    const jobs = [
      job('past-old', 'consegnato', new Date(2025, 11, 20)),
      job('today', 'confermato', new Date(2026, 9, 18, 12, 0), undefined, '12:00'),
      job('lead-old-event', 'lead', new Date(2025, 11, 20), new Date(2026, 9, 17)),
      job('later', 'confermato', new Date(2026, 10, 7)),
      job('lead-newest', 'preventivo_inviato', undefined, new Date(2026, 9, 18)),
      job('past-recent', 'consegnato', new Date(2026, 9, 17)),
      job('signed-undated', 'confermato'),
      job('tomorrow', 'confermato', new Date(2026, 9, 19)),
      job('signed-by-quote', 'lead', new Date(2026, 9, 21)),
    ];
    const quoteStatuses = { 'signed-by-quote': { isSigned: true } };

    const result = sortJobsForDisplay(jobs, quoteStatuses, 'all', today);

    expect(result.map(({ id }) => id)).toEqual([
      'lead-newest',
      'lead-old-event',
      'today',
      'tomorrow',
      'signed-by-quote',
      'later',
      'signed-undated',
      'past-recent',
      'past-old',
    ]);
  });

  it('keeps today before later events in the upcoming view', () => {
    const jobs = [
      job('next-week', 'confermato', new Date(2026, 9, 25)),
      job('today', 'confermato', new Date(2026, 9, 18, 13, 0)),
      job('lead', 'lead', new Date(2025, 0, 1), new Date(2026, 9, 16)),
      job('tomorrow', 'confermato', new Date(2026, 9, 19)),
    ];

    const result = sortJobsForDisplay(jobs, {}, 'upcoming', today);

    expect(result.map(({ id }) => id)).toEqual(['lead', 'today', 'tomorrow', 'next-week']);
  });

  it('sorts past events newest first while retaining the separate lead queue', () => {
    const jobs = [
      job('past-old', 'consegnato', new Date(2025, 5, 1)),
      job('lead', 'lead', undefined, new Date(2026, 9, 16)),
      job('past-recent', 'consegnato', new Date(2026, 9, 17)),
    ];

    const result = sortJobsForDisplay(jobs, {}, 'past', today);

    expect(result.map(({ id }) => id)).toEqual(['lead', 'past-recent', 'past-old']);
    expect(getJobListSection(jobs[1], undefined, today)).toBe('leads');
  });
});
