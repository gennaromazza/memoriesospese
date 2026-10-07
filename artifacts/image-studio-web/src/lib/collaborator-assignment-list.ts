export type CollaboratorAssignmentTimeFilter = 'all' | 'upcoming' | 'past';
export type CollaboratorAssignmentStatusFilter = 'all' | 'pending' | 'accepted' | 'declined';

export interface CollaboratorAssignmentListState {
  timeFilter: CollaboratorAssignmentTimeFilter;
  statusFilter: CollaboratorAssignmentStatusFilter;
  currentPage: number;
}

export type CollaboratorAssignmentListAction =
  | { type: 'set-time-filter'; value: CollaboratorAssignmentTimeFilter }
  | { type: 'set-status-filter'; value: CollaboratorAssignmentStatusFilter }
  | { type: 'set-page'; value: number };

export const INITIAL_COLLABORATOR_ASSIGNMENT_LIST_STATE: CollaboratorAssignmentListState = {
  timeFilter: 'upcoming',
  statusFilter: 'all',
  currentPage: 1,
};

export function collaboratorAssignmentListReducer(
  state: CollaboratorAssignmentListState,
  action: CollaboratorAssignmentListAction,
): CollaboratorAssignmentListState {
  switch (action.type) {
    case 'set-time-filter':
      return { ...state, timeFilter: action.value, currentPage: 1 };
    case 'set-status-filter':
      return { ...state, statusFilter: action.value, currentPage: 1 };
    case 'set-page':
      return { ...state, currentPage: Math.max(1, action.value) };
  }
}

type AssignmentWithStatus = { status: string };

function getValidDate(date: Date | null): Date | null {
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function localDayStart(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function getCollaboratorAssignmentCounts<T extends AssignmentWithStatus>(
  assignments: T[],
  getEventDate: (assignment: T) => Date | null,
  today: Date = new Date(),
): Record<CollaboratorAssignmentTimeFilter, number> {
  const todayStart = localDayStart(today);
  let upcoming = 0;
  let past = 0;

  for (const assignment of assignments) {
    const date = getValidDate(getEventDate(assignment));
    if (!date) continue;

    if (localDayStart(date) < todayStart) past += 1;
    else upcoming += 1;
  }

  return { all: assignments.length, upcoming, past };
}

export function filterAndSortCollaboratorAssignments<T extends AssignmentWithStatus>(
  assignments: T[],
  filters: {
    timeFilter: CollaboratorAssignmentTimeFilter;
    statusFilter: CollaboratorAssignmentStatusFilter;
    getEventDate: (assignment: T) => Date | null;
    today?: Date;
  },
): T[] {
  const todayStart = localDayStart(filters.today ?? new Date());
  const selectedAssignments = assignments.filter((assignment) => {
    if (filters.statusFilter !== 'all' && assignment.status !== filters.statusFilter) return false;

    const date = getValidDate(filters.getEventDate(assignment));
    if (filters.timeFilter === 'all') return true;
    if (!date) return false;

    const isPast = localDayStart(date) < todayStart;
    return filters.timeFilter === 'past' ? isPast : !isPast;
  });

  return selectedAssignments.sort((a, b) => {
    const dateA = getValidDate(filters.getEventDate(a));
    const dateB = getValidDate(filters.getEventDate(b));
    if (!dateA && !dateB) return 0;
    if (!dateA) return 1;
    if (!dateB) return -1;

    const order = dateA.getTime() - dateB.getTime();
    return filters.timeFilter === 'past' ? -order : order;
  });
}