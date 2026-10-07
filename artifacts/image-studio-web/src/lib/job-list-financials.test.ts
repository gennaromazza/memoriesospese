import { describe, expect, it } from 'vitest';
import { getJobListFinancials } from './job-list-financials';

describe('getJobListFinancials', () => {
  it('prefers payment schedule aggregates over stale job snapshots', () => {
    expect(getJobListFinancials(
      { totalePagato: 750, saldoResiduo: 250 },
      { totalePreventivato: 1000, totalePagato: 0, saldoResiduo: 1000 },
    )).toEqual({ totalePreventivato: 1000, totalePagato: 750, saldoResiduo: 250 });
  });

  it('uses legacy job financials when the server has no aggregate', () => {
    expect(getJobListFinancials(
      undefined,
      { totalePreventivato: 1200, totalePagato: 400, saldoResiduo: 800 },
    )).toEqual({ totalePreventivato: 1200, totalePagato: 400, saldoResiduo: 800 });
  });

  it('derives missing legacy balance and handles an absent snapshot', () => {
    expect(getJobListFinancials(undefined, { totalePreventivato: 500, totalePagato: 125 }))
      .toEqual({ totalePreventivato: 500, totalePagato: 125, saldoResiduo: 375 });
    expect(getJobListFinancials(undefined, undefined))
      .toEqual({ totalePreventivato: 0, totalePagato: 0, saldoResiduo: 0 });
  });
});