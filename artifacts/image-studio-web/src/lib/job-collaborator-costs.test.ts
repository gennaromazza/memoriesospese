import { describe, expect, it } from 'vitest';
import { summarizeCollaboratorCosts } from './job-collaborator-costs';

describe('summarizeCollaboratorCosts', () => {
  it('counts the full accepted compensation and shows advances separately', () => {
    expect(summarizeCollaboratorCosts([
      {
        status: 'accepted',
        compenso: 500,
        pagamenti: [{ importo: 150 }, { importo: 50 }],
      },
    ])).toEqual({
      total: 500,
      paid: 200,
      remaining: 300,
      count: 1,
      autoIncluded: 500,
      matchedManual: 0,
    });
  });

  it('does not count pending or declined assignments as costs', () => {
    expect(summarizeCollaboratorCosts([
      { status: 'pending', compenso: 300 },
      { status: 'declined', compenso: 200 },
    ])).toEqual({
      total: 0,
      paid: 0,
      remaining: 0,
      count: 0,
      autoIncluded: 0,
      matchedManual: 0,
    });
  });

  it('does not add an equal manual collaborator cost a second time', () => {
    expect(summarizeCollaboratorCosts(
      [{ status: 'accepted', compenso: 570 }],
      [{ tipo: 'collaboratore', importo: 570 }],
    )).toEqual({
      total: 570,
      paid: 0,
      remaining: 570,
      count: 1,
      autoIncluded: 0,
      matchedManual: 570,
    });
  });

  it('does not match laboratory costs or costs with a different amount', () => {
    expect(summarizeCollaboratorCosts(
      [{ status: 'accepted', compenso: 500 }],
      [
        { tipo: 'fornitore', importo: 500, labStatementId: 'lab-statement-1' },
        { tipo: 'collaboratore', importo: 100 },
      ],
    )).toMatchObject({
      total: 500,
      autoIncluded: 500,
      matchedManual: 0,
    });
  });

  it('matches repeated amounts one-to-one and keeps payments from being added as costs', () => {
    expect(summarizeCollaboratorCosts(
      [
        { status: 'accepted', compenso: 250, pagamenti: [{ importo: 100 }] },
        { status: 'accepted', compenso: 250, pagamenti: [{ importo: 50 }] },
      ],
      [{ tipo: 'collaboratore', importo: 250 }],
    )).toEqual({
      total: 500,
      paid: 150,
      remaining: 350,
      count: 2,
      autoIncluded: 250,
      matchedManual: 250,
    });
  });
});
