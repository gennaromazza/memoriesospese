import { describe, expect, it } from 'vitest';
import {
  clientLabel, clientMatchesSearch, galleryClientIds, jobClientIds, jobLabel, jobMatchesSearch, jobClientNames,
  clientsAfterRemovingJob, jobTypeAfterSelection, mergeJobClientIds, suggestedJobs,
} from './gallery-associations';

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

  it('unions canonical, legacy-array, and scalar gallery client links', () => {
    expect(galleryClientIds({
      clientIds: [],
      clientiIds: ['client-array', 'client-both'],
      clienteId: 'client-scalar',
    })).toEqual(['client-array', 'client-both', 'client-scalar']);
  });

  it('adds a selected Job’s clients without dropping existing gallery clients', () => {
    expect(mergeJobClientIds(['client-1', 'client-old'], {
      id: 'job-1', clientiIds: ['client-2', ' client-1 '], clienteId: 'client-3',
    })).toEqual(['client-1', 'client-old', 'client-2', 'client-3']);
  });

  it('finds a Job by either its title or the name of one of its clients', () => {
    const clients = [
      { id: 'client-1', nome: 'Giulia', cognome: 'Rossi', email: 'giulia@example.com' },
      { id: 'client-2', nome: 'Marco', cognome: 'Bianchi' },
    ];
    const job = { id: 'job-1', nomeEvento: 'Matrimonio in Toscana', clientiIds: ['client-1', 'client-2'] };

    expect(jobMatchesSearch(job, clients, 'toscana')).toBe(true);
    expect(jobMatchesSearch(job, clients, 'giulia rossi')).toBe(true);
    expect(jobMatchesSearch(job, clients, 'marco')).toBe(true);
    expect(jobMatchesSearch(job, clients, 'giulia@example.com')).toBe(true);
    expect(jobMatchesSearch(job, clients, 'nessuno')).toBe(false);
    expect(jobMatchesSearch(job, clients, '')).toBe(false);
  });

  it('keeps server-provided Job client names available when client records are not loaded', () => {
    const job = {
      id: 'job-1',
      clientiIds: ['client-1'],
      clientNames: ['Nome cliente dal Job'],
    };

    expect(jobClientNames(job, [])).toEqual(['Nome cliente dal Job']);
    expect(jobMatchesSearch(job, [], 'nome cliente dal job')).toBe(true);
  });

  it('suggests Jobs for selected clients before a search is entered', () => {
    const clients = [{ id: 'client-1', nome: 'Giulia', email: 'giulia@example.com' }];
    const jobs = [
      { id: 'job-1', nomeEvento: 'Matrimonio', clientiIds: ['client-1'] },
      { id: 'job-2', nomeEvento: 'Ritratto', clienteId: 'client-2' },
    ];

    expect(suggestedJobs(jobs, clients, '', ['client-1']).map(job => job.id)).toEqual(['job-1']);
    expect(suggestedJobs(jobs, clients, 'giulia@example.com', []).map(job => job.id)).toEqual(['job-1']);
    expect(clientMatchesSearch(clients[0], 'GIULIA@EXAMPLE.COM')).toBe(true);
  });

  it('keeps a manually selected category when choosing or changing a Job', () => {
    expect(jobTypeAfterSelection('', 'matrimonio', false, false))
      .toEqual({ value: 'matrimonio', automaticallySet: true });
    expect(jobTypeAfterSelection('matrimonio', 'ritratto', false, true))
      .toEqual({ value: 'ritratto', automaticallySet: true });
    expect(jobTypeAfterSelection('matrimonio', undefined, false, true))
      .toEqual({ value: '', automaticallySet: false });
    expect(jobTypeAfterSelection('', 'ritratto', true, false))
      .toEqual({ value: '', automaticallySet: false });
    expect(jobTypeAfterSelection('ritratto', 'matrimonio', true, false))
      .toEqual({ value: 'ritratto', automaticallySet: false });
  });

  it('removes only Job-added clients on creation and preserves them while editing', () => {
    expect(clientsAfterRemovingJob(['client-manual', 'client-job'], ['client-job'], true))
      .toEqual(['client-manual']);
    expect(clientsAfterRemovingJob(['client-manual', 'client-job'], ['client-job'], false))
      .toEqual(['client-manual', 'client-job']);
  });
});