import { describe, expect, it } from 'vitest';
import { galleryHasJob, galleryMatchesAssociationFilter } from './gallery-associations';

const jobs = [
  { id: 'job-1', galleryIds: ['g-listed'] },
  { id: 'job-2' },
];

describe('filtro gallerie per associazione', () => {
  it('considera collegata una galleria con jobId esistente o elencata in un job', () => {
    expect(galleryHasJob({ id: 'g-1', jobId: 'job-2' }, jobs)).toBe(true);
    expect(galleryHasJob({ id: 'g-listed' }, jobs)).toBe(true);
    expect(galleryHasJob({ id: 'g-orphan', jobId: 'job-cancellato' }, jobs)).toBe(false);
    expect(galleryHasJob({ id: 'g-none' }, jobs)).toBe(false);
  });

  it('separa le gallerie senza cliente da quelle senza job', () => {
    const noClient = { id: 'a', jobId: 'job-1' };
    const noJob = { id: 'b', clientiIds: ['c-1'] };
    const none = { id: 'c', clientiIds: [] };
    const both = { id: 'd', clienteId: 'c-2', jobId: 'job-2' };
    const all = [noClient, noJob, none, both];
    const ids = (filter: Parameters<typeof galleryMatchesAssociationFilter>[2]) =>
      all.filter(g => galleryMatchesAssociationFilter(g, jobs, filter)).map(g => g.id);

    expect(ids('')).toEqual(['a', 'b', 'c', 'd']);
    expect(ids('no-clients')).toEqual(['a', 'c']);
    expect(ids('no-job')).toEqual(['b', 'c']);
    expect(ids('no-clients-no-job')).toEqual(['c']);
  });
});
