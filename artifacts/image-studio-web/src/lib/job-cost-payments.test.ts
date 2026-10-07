import { describe, expect, it } from 'vitest';
import type { CashMovementFE } from '@shared/cash-types';
import type { CostoLavoro, Job } from '@shared/jobs-types';
import {
  getCashMovementJobCostLinks,
  hasJobCostPaymentFinancialChanges,
  isJobCostCoveredByCashMovement,
  isSameVerifiedPaymentCandidate,
} from './job-cost-payments';

const cost = {
  id: 'cost-1',
  importo: 600,
  data: new Date('2025-12-01T14:00:00.000Z'),
} as CostoLavoro;

const expense = {
  id: 'cash-1',
  tipo: 'uscita',
  importo: 600,
  data: new Date('2025-12-01T08:30:00.000Z'),
} as CashMovementFE;

describe('job cost payment matching', () => {
  it('accepts only an outgoing payment with the same amount and Rome calendar date', () => {
    expect(isSameVerifiedPaymentCandidate(cost, expense)).toBe(true);
    expect(isSameVerifiedPaymentCandidate(cost, { ...expense, tipo: 'entrata' })).toBe(false);
    expect(isSameVerifiedPaymentCandidate(cost, { ...expense, importo: 599.99 })).toBe(false);
    expect(isSameVerifiedPaymentCandidate(cost, {
      ...expense,
      data: new Date('2025-12-02T08:30:00.000Z'),
    })).toBe(false);
  });

  it('does not treat a payment without a valid date as a candidate', () => {
    expect(isSameVerifiedPaymentCandidate(cost, {
      ...expense,
      data: new Date(Number.NaN),
    })).toBe(false);
  });

  it('recognizes a cash movement already represented by the linked job cost', () => {
    expect(isJobCostCoveredByCashMovement('job-1', {
      id: cost.id,
      cashMovementId: expense.id,
    }, [expense])).toBe(true);
    expect(isJobCostCoveredByCashMovement('job-1', {
      id: cost.id,
    }, [{
      ...expense,
      jobCostAssociation: { jobId: 'job-1', jobCostId: cost.id },
    } as CashMovementFE])).toBe(true);
    expect(isJobCostCoveredByCashMovement('job-2', {
      id: cost.id,
    }, [{
      ...expense,
      jobCostAssociation: { jobId: 'job-1', jobCostId: cost.id },
    } as CashMovementFE])).toBe(false);
  });

  it('recognizes verified and legacy links stored on either the movement or the Job cost', () => {
    const job = {
      id: 'job-1',
      nomeEvento: 'Album matrimonio',
      costi: [{
        ...cost,
        descrizione: 'Stampa album',
        cashMovementId: expense.id,
        pagamentoVerificato: { jobId: 'job-1', jobCostId: cost.id },
      }],
    } as unknown as Job;

    expect(getCashMovementJobCostLinks(expense, [job])).toEqual([{
      jobId: 'job-1',
      jobName: 'Album matrimonio',
      jobCostId: cost.id,
      jobCostDescription: 'Stampa album',
      verified: true,
    }]);
    expect(getCashMovementJobCostLinks({
      ...expense,
      jobId: 'job-1',
      jobCostId: cost.id,
    } as CashMovementFE, [{
      ...job,
      costi: [{ ...cost, descrizione: 'Costo storico' }],
    }])).toMatchObject([{
      jobId: 'job-1',
      jobCostId: cost.id,
      jobCostDescription: 'Costo storico',
      verified: false,
    }]);
  });

  it('does not classify an ordinary Job reference as a linked Job cost', () => {
    expect(getCashMovementJobCostLinks({
      ...expense,
      jobId: 'job-1',
    } as CashMovementFE, [{
      id: 'job-1',
      nomeEvento: 'Album matrimonio',
      costi: [cost],
    } as unknown as Job])).toEqual([]);
  });

  it('identifies changes to verified financial facts, not same-value edits', () => {
    expect(hasJobCostPaymentFinancialChanges(expense, {
      tipo: 'uscita',
      importo: 600,
      data: new Date(expense.data),
    })).toBe(false);
    expect(hasJobCostPaymentFinancialChanges(expense, {
      tipo: 'uscita',
      importo: 600.01,
      data: expense.data,
    })).toBe(true);
    expect(hasJobCostPaymentFinancialChanges(expense, {
      tipo: 'uscita',
      importo: 600,
      data: new Date(expense.data.getTime() + 24 * 60 * 60 * 1000),
    })).toBe(true);
    expect(hasJobCostPaymentFinancialChanges(expense, {
      tipo: 'entrata',
      importo: 600,
      data: expense.data,
    })).toBe(true);
  });
});