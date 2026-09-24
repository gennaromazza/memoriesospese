import { describe, expect, it } from 'vitest';
import { clientLabel, jobClientIds, jobLabel, mergeJobClientIds } from './gallery-associations';

describe('gallery associations', () => {
  it('shows descriptive client and Job names instead of raw identifiers', () => {
    expect(clientLabel({ id: 'client-1', nome: 'Giulia', cognome: 'Rossi', email: 'giulia@example.com' })).toBe('Giulia Rossi');
    expect(jobLabel({ id: 'job-1', nomeEvento: 'Matrimonio di Giulia' })).toBe('Matrimonio di Giulia');
  });

  it('includes both current and legacy clients from a Job without duplicates', () => {
    expect(jobClientIds({ id: 'job-1', clientiIds: ['client-2', 'client-1'], clienteId: 'client-1' }))
      .toEqual(['client-2', 'client-1']);
    expect(jobClientIds({ id: 'job-2', clienteId: 'client-3' })).toEqual(['client-3']);
  });

  it('adds a selected Job’s clients without dropping existing gallery clients', () => {
    expect(mergeJobClientIds(['client-1', 'client-old'], {
      id: 'job-1', clientiIds: ['client-2', ' client-1 '], clienteId: 'client-3',
    })).toEqual(['client-1', 'client-old', 'client-2', 'client-3']);
  });
});