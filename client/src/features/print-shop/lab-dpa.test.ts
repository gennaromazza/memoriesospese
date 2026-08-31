import { describe, expect, it } from 'vitest';
import { eligiblePrintShopLabs, isLabDpaSigned } from './lab-dpa';
import type { Lab } from '@shared/lab-types';

describe('laboratory DPA eligibility', () => {
  it('treats legacy and pending labs as ineligible', () => {
    expect(isLabDpaSigned({})).toBe(false);
    expect(isLabDpaSigned({ dataProcessingAgreementStatus: 'pending' })).toBe(false);
    expect(isLabDpaSigned({
      dataProcessingAgreementStatus: 'signed',
      dataProcessingAgreementReference: 'DPA-1',
    })).toBe(false);
    expect(isLabDpaSigned({
      dataProcessingAgreementStatus: 'signed',
      dataProcessingAgreementSignedAt: { _seconds: 1_787_875_200 } as any,
    })).toBe(false);
  });

  it('allows only active labs explicitly marked signed', () => {
    const labs = [
      { id: 'legacy', attivo: true },
      { id: 'pending', attivo: true, dataProcessingAgreementStatus: 'pending' },
      {
        id: 'signed',
        attivo: true,
        dataProcessingAgreementStatus: 'signed',
        dataProcessingAgreementSignedAt: { _seconds: 1_787_875_200 },
        dataProcessingAgreementReference: 'DPA-2026-04',
      },
      {
        id: 'incomplete-signed',
        attivo: true,
        dataProcessingAgreementStatus: 'signed',
        dataProcessingAgreementReference: 'DPA-MISSING-DATE',
      },
      {
        id: 'inactive',
        attivo: false,
        dataProcessingAgreementStatus: 'signed',
        dataProcessingAgreementSignedAt: { _seconds: 1_787_875_200 },
        dataProcessingAgreementReference: 'DPA-INACTIVE',
      },
    ] as Lab[];
    expect(eligiblePrintShopLabs(labs).map((lab) => lab.id)).toEqual(['signed']);
  });
});
