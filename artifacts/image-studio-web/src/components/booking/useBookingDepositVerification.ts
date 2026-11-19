import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Order } from '@shared/booking-types';
import {
  findOrdersNeedingDepositReconciliation,
  reconcileBookingDepositsForOrders,
  type DepositCheckBooking,
} from '@/lib/orders';

const add = (set: ReadonlySet<string>, ids: string[]) => new Set([...set, ...ids]);
const remove = (set: ReadonlySet<string>, ids: string[]) => new Set([...set].filter((id) => !ids.includes(id)));

/**
 * Verifica degli acconti PayPal in background, senza bloccare la pagina.
 *
 * Solo gli ordini il cui acconto non risulta ancora copiato vengono inviati al server.
 * Finché sono in verifica (e fino a quando gli ordini non sono stati riletti) o se la
 * verifica non riesce, restano in `lockedOrderIds`: la schermata nasconde importi e azioni
 * di quegli ordini per evitare di registrare due volte un acconto già incassato.
 */
export function useBookingDepositVerification({ orders, bookings, ready }: {
  orders: Order[];
  bookings: DepositCheckBooking[];
  ready: boolean;
}) {
  const client = useQueryClient();
  const attempted = useRef(new Set<string>());
  const [inFlight, setInFlight] = useState<ReadonlySet<string>>(new Set());
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set());
  const [tick, setTick] = useState(0);

  const candidates = useMemo(
    () => (ready ? findOrdersNeedingDepositReconciliation(orders, bookings) : []),
    [ready, orders, bookings],
  );

  useEffect(() => {
    const todo = candidates.filter((id) => !attempted.current.has(id));
    if (todo.length === 0) return;
    todo.forEach((id) => attempted.current.add(id));
    setInFlight((current) => add(current, todo));
    void (async () => {
      const { updated, failedIds } = await reconcileBookingDepositsForOrders(todo);
      setFailed((current) => add(remove(current, todo), failedIds));
      // Gli ordini restano bloccati finché la rilettura non e' completata.
      if (updated > 0 || failedIds.length < todo.length) {
        try { await client.invalidateQueries({ queryKey: ['orders'] }); } catch { /* la query mostra il proprio errore */ }
      }
      setInFlight((current) => remove(current, todo));
    })();
  }, [candidates, client, tick]);

  const retry = useCallback(() => {
    failed.forEach((id) => attempted.current.delete(id));
    setFailed(new Set());
    setTick((value) => value + 1);
  }, [failed]);

  const lockedOrderIds = useMemo(
    () => new Set(candidates.filter((id) => !attempted.current.has(id) || inFlight.has(id) || failed.has(id))),
    // attempted e' un ref: inFlight/failed/candidates cambiano a ogni suo aggiornamento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [candidates, inFlight, failed],
  );

  return { lockedOrderIds, failedCount: failed.size, verifyingCount: inFlight.size, retry };
}
