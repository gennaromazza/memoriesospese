import { useEffect, useRef, useState } from 'react';
import { useMutation, type RefetchOptions } from '@tanstack/react-query';
import { markBookingAsViewed, rejectBooking } from '@/lib/bookings';

interface Options {
  bookings: { id: string; stato: string }[];
  refresh: (options?: RefetchOptions) => Promise<void>;
  onSuccess: () => void;
  onError: (error: Error) => void;
}

/** Reject immediately; updating the read badge is ancillary to the server result. */
export function useBookingRejection({ bookings, refresh, onSuccess, onError }: Options) {
  const inFlight = useRef(new Set<string>());
  const accepted = useRef(new Set<string>());
  const [completed, setCompleted] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const updated = bookings.filter(booking => accepted.current.has(booking.id) && booking.stato !== 'in_attesa');
    if (!updated.length) return;
    setCompleted(previous => {
      const next = { ...previous };
      for (const booking of updated) {
        delete next[booking.id];
        accepted.current.delete(booking.id);
      }
      return next;
    });
  }, [bookings]);

  const mutation = useMutation({
    mutationFn: (id: string) => rejectBooking(id),
    retry: false,
    onSuccess: (_result, id) => {
      accepted.current.add(id);
      setCompleted(previous => ({ ...previous, [id]: true }));
      // The rejection is authoritative; the read badge must not delay or veto it.
      void markBookingAsViewed(id).catch(() => console.warn('Prenotazione rifiutata; badge di lettura non aggiornato.'));
      // Live bookings disable automatic queries, so explicitly fetch the updated list.
      void Promise.resolve().then(() => refresh({ throwOnError: true }))
        .catch(() => console.warn('Rifiuto salvato; aggiornamento lista non riuscito.'));
      onSuccess();
    },
    onError: (error: Error) => {
      // Reconcile in case the server saved the change but its response was lost.
      void Promise.resolve().then(() => refresh({ throwOnError: true }))
        .catch(() => console.warn('Aggiornamento lista non riuscito dopo un errore di rifiuto.'));
      onError(error);
    },
    onSettled: (_result, _error, id) => { inFlight.current.delete(id); },
  });

  return {
    ...mutation,
    completed,
    mutate: (id: string) => {
      // Prevent duplicate taps in the same frame, before isPending re-renders.
      if (inFlight.current.has(id) || accepted.current.has(id)) return;
      inFlight.current.add(id);
      mutation.mutate(id);
    },
  };
}
