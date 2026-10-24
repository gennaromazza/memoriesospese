import { describe, expect, it } from 'vitest';
import type { Cliente } from '@shared/clienti-types';
import type { Job } from '@shared/jobs-types';
import { buildClientSearchIndex, searchJobs } from './jobs-list-search';
import { getJobListSection } from './jobs-list-ordering';

const clients = buildClientSearchIndex([
  {
    id: 'client-a', nome: 'Èlena', cognome: 'Rossi',
    email: 'elena@example.test', cellulare1: '+39 333 123 4567',
    cellulare2: '081-555-6677', whatsapp: '+39 340 987 6543',
    pec: 'elena@pec.example.test', ragioneSociale: 'Studio Aurora',
    instagram: 'elena.foto',
  },
  { id: 'client-b', nome: 'Luca', cognome: 'Verdi', email: 'luca@example.test' },
] as Cliente[]);
const jobs = [
  { id: 'signed', status: 'confermato', jobType: 'matrimonio', clientiIds: ['client-a'], nomeEvento: 'Festa sul mare' },
  { id: 'lead', status: 'lead', jobType: 'comunione', clienteId: 'client-a', nomeEvento: 'Comunione' },
  { id: 'other', status: 'lead', clientiIds: ['client-b'], nomeEvento: 'Battesimo', eventLocation: 'Napoli', rituLocation: 'Chiesa di Aversa', locationCerimonia: 'Duomo', noteInterne: 'Richiamare lunedì' },
  { id: 'missing', status: 'lead', clientiIds: ['missing-client'] },
] as Job[];
const ids = (query: string) => searchJobs(jobs, query, clients).map(job => job.id);

describe('global job and lead search', () => {
  it.each([
    'elena', 'ROSSI', '  ELENA@EXAMPLE.TEST  ',
    '3331234567', '+39 (333) 123-4567', '0815556677',
    '340 987 6543', 'elena@pec.example.test', 'studio aurora', 'elena.foto',
  ])('finds both signed jobs and leads by contact data: %s', query => {
    expect(ids(query)).toEqual(['signed', 'lead']);
  });

  it('keeps the lead recognizable as unsigned among global results', () => {
    const matches = searchJobs(jobs, 'elena', clients);
    expect(getJobListSection(matches[0], undefined)).not.toBe('leads');
    expect(getJobListSection(matches[1], undefined)).toBe('leads');
    expect(matches.map(job => job.jobType)).toEqual(['matrimonio', 'comunione']);
  });

  it.each(['napoli', 'aversa', 'duomo', 'lunedi', 'battesimo'])(
    'searches all locations, event names and notes: %s', query => {
      expect(ids(query)).toEqual(['other']);
    },
  );

  it('does not match numeric fragments inside arbitrary email or text queries', () => {
    expect(ids('missing333@example.test')).toEqual([]);
    expect(ids('+')).toEqual([]);
  });

  it('handles unknown clients and missing fields', () => {
    expect(ids('inesistente')).toEqual([]);
    expect(ids('luca')).toEqual(['other']);
  });

  it('treats whitespace-only queries as empty', () => {
    expect(searchJobs(jobs, '   ', clients)).toBe(jobs);
  });
});
