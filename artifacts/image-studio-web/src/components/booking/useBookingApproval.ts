import { useEffect, useRef, useState } from 'react';
import { useMutation, type RefetchOptions } from '@tanstack/react-query';
import type { BookingApprovalResult } from '@workspace/api-client-react';
import { approveBooking, markBookingAsViewed } from '@/lib/bookings';

interface Options {
  bookings: { id: string; stato: string; depositPaymentRequest?: unknown }[];
  refresh: (options?: RefetchOptions) => Promise<void>;
  onSuccess: (result: BookingApprovalResult) => void;
  onError: (error: Error) => void;
}

/** Acknowledge an authoritative save immediately, independently of Firestore's
 * read badge and the listener catching up (especially after resuming on mobile).
 */
export function useBookingApproval({ bookings, refresh, onSuccess, onError }: Options) {
  const inFlight = useRef(new Set<string>());
  const accepted = useRef(new Set<string>());
  const [completed, setCompleted] = useState<Record<string, BookingApprovalResult>>({});
  useEffect(() => {
    setCompleted(previous => {
      const finished = bookings.filter(booking => previous[booking.id]
        && (booking.stato !== 'in_attesa' || !!booking.depositPaymentRequest));
      if (!finished.length) return previous;
      const next = { ...previous };
      for (const booking of finished) { delete next[booking.id]; accepted.current.delete(booking.id); }
      return next;
    });
  }, [bookings]);
  const mutation = useMutation({
    mutationFn: (id: string) => approveBooking(id),
    retry: false,
    onSuccess: (result, id) => {
      accepted.current.add(id);
      setCompleted(previous => ({ ...previous, [id]: result }));
      // Marking a read badge is ancillary: it must not delay or veto approval.
      void markBookingAsViewed(id).catch(() => console.warn('Prenotazione approvata; badge di lettura non aggiornato.'));
      // useLiveBookings deliberately disables automatic queries: invalidation alone does not refetch it.
      void Promise.resolve().then(() => refresh({ throwOnError: true }))
        .catch(() => console.warn('Approvazione salvata; aggiornamento lista non riuscito.'));
      onSuccess(result);
    },
    onError: (error: Error) => {
      // A lost HTTP response may follow a successful save: refresh, never auto-submit again.
      void Promise.resolve().then(() => refresh({ throwOnError: true }))
        .catch(() => console.warn('Aggiornamento lista non riuscito dopo un errore di approvazione.'));
      onError(error);
    },
    onSettled: (_result, _error, id) => { inFlight.current.delete(id); },
  });
  return { ...mutation, completed, mutate: (id: string) => {
    // This also protects two taps in the same frame, before isPending re-renders.
    if (inFlight.current.has(id) || accepted.current.has(id)) return;
    inFlight.current.add(id);
    mutation.mutate(id);
  } };
}
