import { describe, expect, it } from 'vitest';
import {
  getJobClientIds,
  jobMatchesClientIds,
  jobMatchesGalleryContext,
} from './gallery-association';

describe('gallery association matching', () => {
  it('normalizes new and legacy client references without duplicates', () => {
    expect(getJobClientIds({ clientiIds: ['c1', 'c1'], clienteId: 'c2' })).toEqual(['c1', 'c2']);
    expect(getJobClientIds({ clienteId: 'legacy-client' })).toEqual(['legacy-client']);
  });

  it('matches a Job when any selected client belongs to it', () => {
    expect(jobMatchesClientIds({ clientiIds: ['c1', 'c2'] }, ['c2'])).toBe(true);
    expect(jobMatchesClientIds({ clienteId: 'legacy-client' }, ['legacy-client'])).toBe(true);
    expect(jobMatchesClientIds({ clientiIds: ['c1'] }, ['other'])).toBe(false);
  });

  it('matches a Job through booking or consultation context', () => {
    expect(jobMatchesGalleryContext(
      { bookingId: 'booking-1' },
      { bookingId: 'booking-1' },
    )).toBe(true);
    expect(jobMatchesGalleryContext(
      { consultationId: 'consultation-1' },
      { consultationId: 'consultation-1' },
    )).toBe(true);
  });
});