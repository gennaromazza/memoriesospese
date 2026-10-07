import { describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import {
  createLabDpaFields,
  hasValidLabDpa,
  LabDpaValidationError,
  updateLabDpaFields,
} from './lab-dpa.js';

describe('laboratory DPA invariants', () => {
  const now = Timestamp.fromMillis(Date.UTC(2026, 7, 31));

  it('requires a bounded reference and records signedAt server-side', () => {
    expect(() => createLabDpaFields({
      dataProcessingAgreementStatus: 'signed',
      dataProcessingAgreementReference: '   ',
    }, now)).toThrow(LabDpaValidationError);

    expect(createLabDpaFields({
      dataProcessingAgreementStatus: 'signed',
      dataProcessingAgreementReference: '  DPA-2026-04  ',
    }, now)).toEqual({
      dataProcessingAgreementStatus: 'signed',
      dataProcessingAgreementSignedAt: now,
      dataProcessingAgreementReference: 'DPA-2026-04',
    });

    expect(() => createLabDpaFields({
      dataProcessingAgreementStatus: 'signed',
      dataProcessingAgreementReference: 'x'.repeat(201),
    }, now)).toThrow(/troppo lungo/i);
  });

  it('does not persist apparent signature metadata for a pending lab', () => {
    expect(createLabDpaFields({
      dataProcessingAgreementStatus: 'pending',
      dataProcessingAgreementReference: 'non deve restare',
    }, now)).toEqual({ dataProcessingAgreementStatus: 'pending' });

    expect(() => createLabDpaFields({
      dataProcessingAgreementStatus: null,
    }, now)).toThrow(/stato.*non valido/i);
  });

  it('clears signature metadata when returning to pending', () => {
    const deleted = Symbol('delete');
    expect(updateLabDpaFields({
      dataProcessingAgreementStatus: 'signed',
      dataProcessingAgreementSignedAt: now,
      dataProcessingAgreementReference: 'DPA-OLD',
    }, {
      dataProcessingAgreementStatus: 'pending',
      dataProcessingAgreementReference: '',
    }, now, deleted)).toEqual({
      dataProcessingAgreementStatus: 'pending',
      dataProcessingAgreementSignedAt: deleted,
      dataProcessingAgreementReference: deleted,
    });
  });

  it('cannot clear the reference while the lab remains signed', () => {
    expect(() => updateLabDpaFields({
      dataProcessingAgreementStatus: 'signed',
      dataProcessingAgreementSignedAt: now,
      dataProcessingAgreementReference: 'DPA-OLD',
    }, {
      dataProcessingAgreementReference: '',
    }, now, Symbol('delete'))).toThrow(LabDpaValidationError);
  });

  it('lets the shop through only with status, signedAt and reference together', () => {
    const complete = {
      dataProcessingAgreementStatus: 'signed',
      dataProcessingAgreementSignedAt: now,
      dataProcessingAgreementReference: 'DPA-2026-04',
    };
    expect(hasValidLabDpa(complete)).toBe(true);
    expect(hasValidLabDpa({ ...complete, dataProcessingAgreementSignedAt: undefined })).toBe(false);
    expect(hasValidLabDpa({ ...complete, dataProcessingAgreementReference: ' ' })).toBe(false);
    expect(hasValidLabDpa({ ...complete, dataProcessingAgreementStatus: 'pending' })).toBe(false);
  });
});
