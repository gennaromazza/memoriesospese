import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient, type RefetchOptions } from '@tanstack/react-query';
import type { Booking } from '@shared/booking-types';
import { getAllBookings, subscribeBookings } from '@/lib/bookings';

/** Preserve the existing query key and explicit refresh API, without repeated full-collection reads. */
export function useLiveBookings(userId: string) {
  const client = useQueryClient();
  const revision = useRef(0), latest = useRef<Booking[] | null>(null);
  const [loading, setLoading] = useState(!!userId), [streamError, setStreamError] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);
  const result = useQuery<Booking[]>({
    queryKey: ['bookings'], enabled: false,
    queryFn: async () => {
      const started = revision.current;
      const rows = await getAllBookings();
      // A manual refresh must not overwrite a newer payment snapshot received while it was loading.
      return revision.current !== started && latest.current ? latest.current : rows;
    },
  });
  useEffect(() => {
    latest.current = null;
    revision.current++;
    setStreamError(null);
    if (!userId) { setLoading(false); return; }
    setLoading(true);
    const failed = (error: Error) => {
      if ((error as any).code === 'permission-denied' || (error as any).code === 'unauthenticated') {
        client.setQueryData(['bookings'], []);
      }
      setLoading(false);
      setStreamError('Aggiornamenti delle prenotazioni non disponibili. Riprova con Aggiorna.');
    };
    try { return subscribeBookings((rows, fromCache) => {
      if (fromCache && !rows.length) return; // Wait for the server before declaring an empty database.
      revision.current++;
      latest.current = rows;
      client.setQueryData(['bookings'], rows);
      setLoading(false);
      setStreamError(null);
    }, failed); } catch (error) { failed(error as Error); return undefined; }
  }, [userId, client, generation]);
  return { data: userId ? result.data : undefined, isLoading: loading && !result.data,
    liveError: streamError || (result.isError ? 'Aggiornamento delle prenotazioni non riuscito.' : null),
    refetch: (options?: RefetchOptions): Promise<void> => {
      if (streamError) setGeneration(value => value + 1);
      return result.refetch(options).then(() => undefined);
    } };
}
