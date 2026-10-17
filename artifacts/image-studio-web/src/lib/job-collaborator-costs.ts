export interface CollaboratorCostAssignment {
  status: string;
  compenso: number;
  pagamenti?: Array<{ importo: number }>;
}

export interface ExistingJobCost {
  tipo: string;
  importo: number;
  labStatementId?: string;
}

export interface CollaboratorCostSummary {
  /** Agreed costs for accepted assignments, independent of payment status. */
  total: number;
  /** Payments already registered on those assignments. */
  paid: number;
  remaining: number;
  count: number;
  /** Amount added to job costs automatically after duplicate matching. */
  autoIncluded: number;
  /** Amount already present as a manual Collaboratore cost, not counted twice. */
  matchedManual: number;
}

const toCents = (amount: number) => Math.round(amount * 100);
const fromCents = (amount: number) => amount / 100;

export function summarizeCollaboratorCosts(
  assignments: CollaboratorCostAssignment[] = [],
  existingCosts: ExistingJobCost[] = [],
): CollaboratorCostSummary {
  const accepted = assignments.filter(
    assignment =>
      assignment.status === 'accepted' &&
      Number.isFinite(assignment.compenso) &&
      assignment.compenso > 0,
  );

  const manualCollaboratorCosts = existingCosts
    .filter(cost =>
      cost.tipo === 'collaboratore' &&
      !cost.labStatementId &&
      Number.isFinite(cost.importo) &&
      cost.importo > 0,
    )
    .map(cost => toCents(cost.importo));

  let totalCents = 0;
  let paidCents = 0;
  let autoIncludedCents = 0;
  let matchedManualCents = 0;

  for (const assignment of accepted) {
    const amountCents = toCents(assignment.compenso);
    const paidForAssignmentCents = (assignment.pagamenti || []).reduce(
      (sum, payment) =>
        Number.isFinite(payment.importo) && payment.importo > 0
          ? sum + toCents(payment.importo)
          : sum,
      0,
    );

    totalCents += amountCents;
    paidCents += paidForAssignmentCents;

    // Older manually entered collaborator costs have no assignment link.
    // Match an equal amount one-to-one so the same agreed cost is not doubled.
    const matchingManualIndex = manualCollaboratorCosts.findIndex(
      manualCostCents => manualCostCents === amountCents,
    );
    if (matchingManualIndex >= 0) {
      matchedManualCents += amountCents;
      manualCollaboratorCosts.splice(matchingManualIndex, 1);
    } else {
      autoIncludedCents += amountCents;
    }
  }

  return {
    total: fromCents(totalCents),
    paid: fromCents(paidCents),
    remaining: fromCents(Math.max(0, totalCents - paidCents)),
    count: accepted.length,
    autoIncluded: fromCents(autoIncludedCents),
    matchedManual: fromCents(matchedManualCents),
  };
}
