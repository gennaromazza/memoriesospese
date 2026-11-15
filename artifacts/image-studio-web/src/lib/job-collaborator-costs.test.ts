import { describe, expect, it } from 'vitest';
import { summarizeCollaboratorCosts } from './job-collaborator-costs';

describe('summarizeCollaboratorCosts', () => {
  it('counts each recorded advance and final payment as a cost', () => {
    expect(summarizeCollaboratorCosts([
      {
        id: 'assignment-1',
        collaboratoreId: 'collaborator-1',
        status: 'accepted',
        compenso: 500,
        pagamenti: [
          { id: 'payment-1', tipo: 'acconto', importo: 150 },
          { id: 'payment-2', tipo: 'saldo', importo: 50 },
        ],
      },
    ])).toEqual({
      agreedTotal: 500,
      paidTotal: 200,
      remaining: 300,
      assignmentCount: 1,
      paymentCount: 2,
      autoIncluded: 200,
      matchedManual: 0,
      paymentLines: [
        {
          id: 'payment-1',
          tipo: 'acconto',
          importo: 150,
          assignmentId: 'assignment-1',
          collaboratoreId: 'collaborator-1',
        },
        {
          id: 'payment-2',
          tipo: 'saldo',
          importo: 50,
          assignmentId: 'assignment-1',
          collaboratoreId: 'collaborator-1',
        },
      ],
    });
  });

  it('includes payments regardless of acceptance status, but not unpaid compensation', () => {
    expect(summarizeCollaboratorCosts([
      {
        id: 'pending-assignment',
        status: 'pending',
        compenso: 300,
        pagamenti: [{ id: 'advance', tipo: 'acconto', importo: 50 }],
      },
      {
        id: 'declined-assignment',
        status: 'declined',
        compenso: 200,
        pagamenti: [],
      },
    ])).toMatchObject({
      agreedTotal: 0,
      paidTotal: 50,
      remaining: 0,
      assignmentCount: 1,
      paymentCount: 1,
      autoIncluded: 50,
      matchedManual: 0,
    });
  });

  it('includes payments when the agreed compensation has not been defined yet', () => {
    expect(summarizeCollaboratorCosts([
      {
        id: 'assignment-without-compensation',
        collaboratoreId: 'collaborator-1',
        status: 'accepted',
        compenso: 0,
        pagamenti: [
          { id: 'advance-1', tipo: 'acconto', importo: 400 },
          { id: 'advance-2', tipo: 'acconto', importo: 250 },
        ],
      },
    ])).toMatchObject({
      agreedTotal: 0,
      paidTotal: 650,
      remaining: 0,
      assignmentCount: 1,
      paymentCount: 2,
      autoIncluded: 650,
      matchedManual: 0,
    });
  });

  it('does not add a payment twice when a manual cost is linked to its cash movement', () => {
    expect(summarizeCollaboratorCosts(
      [{
        id: 'assignment-1',
        status: 'accepted',
        compenso: 570,
        pagamenti: [{
          id: 'payment-1',
          importo: 200,
          data: '2026-10-15',
          cashMovementId: 'cash-1',
        }],
      }],
      [{
        tipo: 'collaboratore',
        importo: 200,
        data: '2026-10-15',
        cashMovementId: 'cash-1',
      }],
    )).toMatchObject({
      agreedTotal: 570,
      paidTotal: 200,
      remaining: 370,
      autoIncluded: 0,
      matchedManual: 200,
      paymentLines: [],
    });
  });

  it('matches older unlinked costs one-to-one only when amount and date both agree', () => {
    const result = summarizeCollaboratorCosts(
      [{
        status: 'accepted',
        compenso: 500,
        pagamenti: [
          { id: 'payment-1', importo: 100, data: '2026-10-15' },
          { id: 'payment-2', importo: 100, data: '2026-10-16' },
        ],
      }],
      [{
        tipo: 'collaboratore',
        importo: 100,
        data: '2026-10-15',
      }],
    );

    expect(result.paidTotal).toBe(200);
    expect(result.autoIncluded).toBe(100);
    expect(result.matchedManual).toBe(100);
    expect(result.paymentLines.map(line => line.id)).toEqual(['payment-2']);
  });

  it('does not match a laboratory cost or a collaborator cost on another date', () => {
    expect(summarizeCollaboratorCosts(
      [{
        status: 'accepted',
        compenso: 500,
        pagamenti: [{ id: 'payment-1', importo: 100, data: '2026-10-15' }],
      }],
      [
        { tipo: 'fornitore', importo: 100, data: '2026-10-15', labStatementId: 'lab-1' },
        { tipo: 'collaboratore', importo: 100, data: '2026-10-16' },
      ],
    )).toMatchObject({
      agreedTotal: 500,
      paidTotal: 100,
      remaining: 400,
      autoIncluded: 100,
      matchedManual: 0,
      paymentLines: [{ id: 'payment-1', importo: 100 }],
    });
  });
});
