import { describe, expect, it } from 'vitest';
import { findDuplicateCampaignCodes } from './booking-campaign-duplicates.js';

describe('duplicate booking campaign codes', () => {
  it('lists every campaign with the same code and keeps booking counts attached to document IDs', () => {
    const report = findDuplicateCampaignCodes([
      { id: 'legacy-a', data: { code: 'NATALE26', nome: 'Natale storico', attiva: false, dataInizio: '2026-11-01T00:00:00.000Z' } },
      { id: 'legacy-b', data: { code: 'NATALE26', nome: 'Natale attuale', attiva: true, dataFine: new Date('2026-12-31T23:59:59.000Z') } },
      { id: 'UNICO01', data: { code: 'UNICO01', nome: 'Campagna singola', attiva: true } },
    ], new Map([['legacy-a', 8], ['legacy-b', 2]]));

    expect(report).toHaveLength(1);
    expect(report[0]).toMatchObject({ code: 'NATALE26' });
    expect(report[0].campaigns).toEqual([
      expect.objectContaining({ id: 'legacy-a', nome: 'Natale storico', attiva: false, prenotazioni: 8 }),
      expect.objectContaining({ id: 'legacy-b', nome: 'Natale attuale', attiva: true, prenotazioni: 2 }),
    ]);
    expect(report[0].campaigns[0].dataInizio).toBe('2026-11-01T00:00:00.000Z');
    expect(report[0].campaigns[1].dataFine).toBe('2026-12-31T23:59:59.000Z');
  });

  it('uses a short campaign document ID when a legacy record has no code field', () => {
    const report = findDuplicateCampaignCodes([
      { id: 'ABC123', data: { nome: 'Nuova campagna' } },
      { id: 'legacy', data: { code: 'ABC123', nome: 'Vecchia campagna' } },
      { id: 'XYZ789', data: { code: '', nome: 'Codice storico vuoto' } },
      { id: 'legacy-xyz', data: { code: 'XYZ789', nome: 'Campagna storica' } },
    ], new Map());
    expect(report.map(group => group.code)).toEqual(['ABC123', 'XYZ789']);
    expect(report[0].campaigns.map(campaign => campaign.id)).toEqual(['ABC123', 'legacy']);
  });

  it('ignores empty, invalid, and unique codes and does not normalize case into false conflicts', () => {
    const report = findDuplicateCampaignCodes([
      { id: 'missing', data: { nome: 'Senza codice' } },
      { id: 'too-long-document-id', data: { nome: 'ID tecnico' } },
      { id: 'invalid', data: { code: 'NATALE 26' } },
      { id: 'lower', data: { code: 'natale26' } },
      { id: 'upper', data: { code: 'NATALE26' } },
    ], new Map());
    expect(report).toEqual([]);
  });
});
