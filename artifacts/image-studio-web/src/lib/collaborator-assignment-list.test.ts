import { describe, expect, it } from 'vitest';
import {
  collaboratorAssignmentListReducer,
  filterAndSortCollaboratorAssignments,
  getCollaboratorAssignmentCounts,
  INITIAL_COLLABORATOR_ASSIGNMENT_LIST_STATE,
} from './collaborator-assignment-list';

interface Assignment {
  id: string;
  status: 'pending' | 'accepted' | 'declined';
  eventDate: Date | null;
}

const today = new Date(2026, 8, 29, 12);
const assignment = (
  id: string,
  eventDate: Date | null,
  status: Assignment['status'] = 'pending',
): Assignment => ({ id, eventDate, status });
const getEventDate = (item: Assignment) => item.eventDate;

describe('collaborator assignment date views', () => {
  it('starts with upcoming assignments selected', () => {
    expect(INITIAL_COLLABORATOR_ASSIGNMENT_LIST_STATE.timeFilter).toBe('upcoming');
  });

  it('includes today as upcoming and classifies yesterday as past by local calendar day', () => {
    const items = [
      assignment('yesterday-late', new Date(2026, 8, 28, 23, 59)),
      assignment('today-early', new Date(2026, 8, 29, 0, 1)),
      assignment('today-late', new Date(2026, 8, 29, 23, 59)),
    ];

    expect(getCollaboratorAssignmentCounts(items, getEventDate, today))
      .toEqual({ all: 3, upcoming: 2, past: 1 });
    expect(filterAndSortCollaboratorAssignments(items, {
      timeFilter: 'upcoming',
      statusFilter: 'all',
      getEventDate,
      today,
    }).map(({ id }) => id)).toEqual(['today-early', 'today-late']);
    expect(filterAndSortCollaboratorAssignments(items, {
      timeFilter: 'past',
      statusFilter: 'all',
      getEventDate,
      today,
    }).map(({ id }) => id)).toEqual(['yesterday-late']);
  });

  it('keeps assignments without dates only in the all-work view', () => {
    const items = [assignment('undated', null), assignment('future', new Date(2026, 9, 1))];

    expect(getCollaboratorAssignmentCounts(items, getEventDate, today))
      .toEqual({ all: 2, upcoming: 1, past: 0 });
    expect(filterAndSortCollaboratorAssignments(items, {
      timeFilter: 'all',
      statusFilter: 'all',
      getEventDate,
      today,
    }).map(({ id }) => id)).toEqual(['future', 'undated']);
    expect(filterAndSortCollaboratorAssignments(items, {
      timeFilter: 'upcoming',
      statusFilter: 'all',
      getEventDate,
      today,
    }).map(({ id }) => id)).toEqual(['future']);
  });

  it('sorts upcoming from nearest to farthest and past from newest to oldest', () => {
    const items = [
      assignment('far-future', new Date(2026, 11, 1)),
      assignment('near-future', new Date(2026, 9, 1)),
      assignment('old-past', new Date(2026, 7, 1)),
      assignment('recent-past', new Date(2026, 8, 28)),
    ];

    expect(filterAndSortCollaboratorAssignments(items, {
      timeFilter: 'upcoming',
      statusFilter: 'all',
      getEventDate,
      today,
    }).map(({ id }) => id)).toEqual(['near-future', 'far-future']);
    expect(filterAndSortCollaboratorAssignments(items, {
      timeFilter: 'past',
      statusFilter: 'all',
      getEventDate,
      today,
    }).map(({ id }) => id)).toEqual(['recent-past', 'old-past']);
  });

  it('composes status and time filters while keeping view counts independent of status', () => {
    const items = [
      assignment('pending-future', new Date(2026, 9, 1), 'pending'),
      assignment('accepted-future', new Date(2026, 9, 2), 'accepted'),
      assignment('declined-past', new Date(2026, 8, 28), 'declined'),
    ];

    expect(getCollaboratorAssignmentCounts(items, getEventDate, today))
      .toEqual({ all: 3, upcoming: 2, past: 1 });
    expect(filterAndSortCollaboratorAssignments(items, {
      timeFilter: 'upcoming',
      statusFilter: 'accepted',
      getEventDate,
      today,
    }).map(({ id }) => id)).toEqual(['accepted-future']);
  });
});

describe('collaborator assignment list pagination state', () => {
  it('resets to the first page when either filter changes', () => {
    const pageThree = { ...INITIAL_COLLABORATOR_ASSIGNMENT_LIST_STATE, currentPage: 3 };

    expect(collaboratorAssignmentListReducer(pageThree, {
      type: 'set-time-filter',
      value: 'past',
    })).toEqual({ timeFilter: 'past', statusFilter: 'all', currentPage: 1 });
    expect(collaboratorAssignmentListReducer(pageThree, {
      type: 'set-status-filter',
      value: 'accepted',
    })).toEqual({ timeFilter: 'upcoming', statusFilter: 'accepted', currentPage: 1 });
  });
});