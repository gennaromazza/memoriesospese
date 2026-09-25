import { describe, expect, it } from 'vitest';
import { clientLabel, jobClientIds, jobLabel, jobMatchesSearch, mergeJobClientIds } from './gallery-associations';

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

  it('finds a Job by either its title or the name of one of its clients', () => {
    const clients = [
      { id: 'client-1', nome: 'Giulia', cognome: 'Rossi' },
      { id: 'client-2', nome: 'Marco', cognome: 'Bianchi' },
    ];
    const job = { id: 'job-1', nomeEvento: 'Matrimonio in Toscana', clientiIds: ['client-1', 'client-2'] };

    expect(jobMatchesSearch(job, clients, 'toscana')).toBe(true);
    expect(jobMatchesSearch(job, clients, 'giulia rossi')).toBe(true);
    expect(jobMatchesSearch(job, clients, 'marco')).toBe(true);
    expect(jobMatchesSearch(job, clients, 'nessuno')).toBe(false);
    expect(jobMatchesSearch(job, clients, '')).toBe(false);
  });
});