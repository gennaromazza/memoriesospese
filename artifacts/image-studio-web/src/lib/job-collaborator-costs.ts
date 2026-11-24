export interface CollaboratorCostPayment {
  id?: string;
  tipo?: string;
  importo: number;
  data?: unknown;
  metodo?: string;
  note?: string;
  cashMovementId?: string;
}

export interface CollaboratorCostAssignment {
  id?: string;
  collaboratoreId?: string;
  ruoloInJob?: string;
  status: string;
  compenso: number;
  pagamenti?: CollaboratorCostPayment[];
}

export interface ExistingJobCost {
  tipo: string;
  importo: number;
  data?: unknown;
  cashMovementId?: string;
  labStatementId?: string;
}

export interface CollaboratorCostPaymentLine extends CollaboratorCostPayment {
  id: string;
  assignmentId: string;
  collaboratoreId?: string;
  ruoloInJob?: string;
}

export interface CollaboratorCostSummary {
  /** Agreed compensation for accepted assignments; informational, not added to costs. */
  agreedTotal: number;
  /** All registered collaborator payments, regardless of acceptance status. */
  paidTotal: number;
  /** Unpaid balance for accepted assignments; informational, not added to costs. */
  remaining: number;
  assignmentCount: number;
  paymentCount: number;
  /** Registered payments not already represented by a manual job cost. */
  autoIncluded: number;
  /** Payment amounts already represented by an existing job cost. */
  matchedManual: number;
  /** Payment rows to show as computed costs in the Job cost table. */
  paymentLines: CollaboratorCostPaymentLine[];
}

const toCents = (amount: number) => Math.round(amount * 100);
const fromCents = (amount: number) => amount / 100;

function dateKey(value: unknown): string | null {
  if (!value) return null;

  let date: Date;
  if (value instanceof Date) {
    date = value;
  } else if (typeof value === 'object') {
    const timestamp = value as {
      toDate?: () => Date;
      seconds?: number;
      _seconds?: number;
    };
    if (typeof timestamp.toDate === 'function') {
      date = timestamp.toDate();
    } else if (Number.isFinite(timestamp._seconds)) {
      date = new Date(timestamp._seconds! * 1000);
    } else if (Number.isFinite(timestamp.seconds)) {
      date = new Date(timestamp.seconds! * 1000);
    } else {
      return null;
    }
  } else if (typeof value === 'string' || typeof value === 'number') {
    date = new Date(value);
  } else {
    return null;
  }

  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function matchesManualPayment(
  cost: ExistingJobCost,
  payment: CollaboratorCostPayment,
): boolean {
  if (cost.labStatementId) return false;

  if (payment.cashMovementId && cost.cashMovementId) {
    return payment.cashMovementId === cost.cashMovementId;
  }

  // Older manually-entered collaborator costs may not have the movement ID.
  // Match those only when both the amount and calendar date agree.
  return cost.tipo === 'collaboratore'
    && toCents(cost.importo) === toCents(payment.importo)
    && dateKey(cost.data) !== null
    && dateKey(cost.data) === dateKey(payment.data);
}

export function summarizeCollaboratorCosts(
  assignments: CollaboratorCostAssignment[] = [],
  existingCosts: ExistingJobCost[] = [],
): CollaboratorCostSummary {
  const manualCosts = existingCosts
    .filter(cost => cost.tipo === 'collaboratore' || !!cost.cashMovementId)
    .map(cost => ({ cost, matched: false }));

  let agreedTotalCents = 0;
  let paidTotalCents = 0;
  let remainingCents = 0;
  let autoIncludedCents = 0;
  let matchedManualCents = 0;
  let paymentCount = 0;
  let assignmentCount = 0;
  const paymentLines: CollaboratorCostPaymentLine[] = [];

  assignments.forEach((assignment, assignmentIndex) => {
    const agreedCents = Number.isFinite(assignment.compenso) && assignment.compenso > 0
      ? toCents(assignment.compenso)
      : 0;
    const accepted = assignment.status === 'accepted' && agreedCents > 0;
    if (accepted) {
      agreedTotalCents += agreedCents;
    }

    let assignmentPaidCents = 0;
    (assignment.pagamenti || []).forEach((payment, paymentIndex) => {
      if (!Number.isFinite(payment.importo) || payment.importo <= 0) return;

      const amountCents = toCents(payment.importo);
      paidTotalCents += amountCents;
      assignmentPaidCents += amountCents;
      paymentCount += 1;

      const matchedCost = manualCosts.find(candidate =>
        !candidate.matched && matchesManualPayment(candidate.cost, payment),
      );
      if (matchedCost) {
        matchedCost.matched = true;
        matchedManualCents += amountCents;
        return;
      }

      autoIncludedCents += amountCents;
      paymentLines.push({
        ...payment,
        id: payment.id || `${assignment.id || assignmentIndex}-payment-${paymentIndex}`,
        assignmentId: assignment.id || `assignment-${assignmentIndex}`,
        collaboratoreId: assignment.collaboratoreId,
        ...(assignment.ruoloInJob ? { ruoloInJob: assignment.ruoloInJob } : {}),
      });
    });

    if (accepted) {
      remainingCents += Math.max(0, agreedCents - assignmentPaidCents);
    }

    if (accepted || assignmentPaidCents > 0) {
      assignmentCount += 1;
    }
  });

  return {
    agreedTotal: fromCents(agreedTotalCents),
    paidTotal: fromCents(paidTotalCents),
    remaining: fromCents(remainingCents),
    assignmentCount,
    paymentCount,
    autoIncluded: fromCents(autoIncludedCents),
    matchedManual: fromCents(matchedManualCents),
    paymentLines,
  };
}
