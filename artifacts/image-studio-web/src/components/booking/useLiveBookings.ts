import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient, type RefetchOptions } from '@tanstack/react-query';
import type { Booking } from '@shared/booking-types';
import { getAllBookings, getBookingsForCampaigns, subscribeBookings, subscribeBookingsForCampaigns } from '@/lib/bookings';

/** Quali prenotazioni ascoltare: tutte, oppure solo quelle di alcune campagne (es. le attive). */
export type BookingsScope = { mode: 'all' } | { mode: 'campaigns'; campaignIds: string[] };
const ALL: BookingsScope = { mode: 'all' };

/**
 * La chiave ['bookings'] resta riservata ai dati COMPLETI (la condividono altri componenti): le liste parziali
 * stanno sotto una chiave propria, così nessuno scambia un elenco parziale per l'elenco intero.
 */
export function bookingsQueryKey(scope: BookingsScope): string[] {
  return scope.mode === 'all' ? ['bookings'] : ['bookings', 'campaigns', [...new Set(scope.campaignIds)].sort().join(',')];
}

/**
 * Preserve the existing query key and explicit refresh API, without repeated full-collection reads.
 * `ready` false = si aspetta un'informazione (le campagne) prima di partire: nessun ascolto, ma la lista risulta "in caricamento".
 */
export function useLiveBookings(userId: string, scope: BookingsScope = ALL, ready = true) {
  const client = useQueryClient();
  const revision = useRef(0), latest = useRef<Booking[] | null>(null);
  const active = !!userId && ready;
  const keyId = bookingsQueryKey(scope).join('|');
  const [loading, setLoading] = useState(active), [streamError, setStreamError] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);
  // L'ultimo scope sempre a portata di mano, senza far dipendere l'effetto dall'identita' dell'array degli id.
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const queryKey = bookingsQueryKey(scope);
  const result = useQuery<Booking[]>({
    queryKey, enabled: false,
    queryFn: async () => {
      const started = revision.current;
      const current = scopeRef.current;
      const rows = current.mode === 'all' ? await getAllBookings() : await getBookingsForCampaigns(current.campaignIds);
      // A manual refresh must not overwrite a newer payment snapshot received while it was loading.
      return revision.current !== started && latest.current ? latest.current : rows;
    },
  });
  useEffect(() => {
    latest.current = null;
    revision.current++;
    setStreamError(null);
    if (!active) { setLoading(!!userId && !ready); return; }
    setLoading(true);
    const current = scopeRef.current, key = bookingsQueryKey(current);
    const failed = (error: Error) => {
      if ((error as any).code === 'permission-denied' || (error as any).code === 'unauthenticated') {
        client.setQueryData(key, []);
      }
      setLoading(false);
      setStreamError('Aggiornamenti delle prenotazioni non disponibili. Riprova con Aggiorna.');
    };
    const onRows = (rows: Booking[], fromCache: boolean) => {
      if (fromCache && !rows.length) return; // Wait for the server before declaring an empty database.
      revision.current++;
      latest.current = rows;
      client.setQueryData(key, rows);
      setLoading(false);
      setStreamError(null);
    };
    try {
      return current.mode === 'all' ? subscribeBookings(onRows, failed) : subscribeBookingsForCampaigns(current.campaignIds, onRows, failed);
    } catch (error) { failed(error as Error); return undefined; }
  }, [userId, ready, active, client, generation, keyId]);
  return { data: userId && ready ? result.data : undefined, isLoading: (loading || (!!userId && !ready)) && !result.data,
    liveError: streamError || (result.isError ? 'Aggiornamento delle prenotazioni non riuscito.' : null),
    refetch: (options?: RefetchOptions): Promise<void> => {
      if (streamError) setGeneration(value => value + 1);
      return result.refetch(options).then(() => undefined);
    } };
}
