import type { QueryClient } from '@tanstack/react-query';
import { getAllCampaigns } from '@/lib/booking-campaigns';
import { getAllOrdersUnreconciled } from '@/lib/orders';

/** Chiave e durata della cache degli ordini nella schermata Prenotazioni (la usa anche la schermata stessa). */
export const BOOKINGS_SCREEN_ORDERS_KEY = ['orders', 'bookings-screen'] as const;
export const BOOKINGS_SCREEN_ORDERS_STALE_MS = 2 * 60 * 1000;

/**
 * Scalda la cache mentre l'amministratore e' ancora nella dashboard: quando apre "Lista prenotazioni"
 * ordini e campagne sono gia' scaricati e la schermata non resta in attesa. Se la lettura fallisce
 * non succede nulla: la schermata rifa' la richiesta da sola e mostra il suo errore.
 */
export async function prefetchBookingsScreen(client: QueryClient): Promise<void> {
  await Promise.all([
    client.prefetchQuery({
      queryKey: BOOKINGS_SCREEN_ORDERS_KEY,
      queryFn: getAllOrdersUnreconciled,
      staleTime: BOOKINGS_SCREEN_ORDERS_STALE_MS,
    }),
    client.prefetchQuery({ queryKey: ['campaigns'], queryFn: getAllCampaigns, staleTime: BOOKINGS_SCREEN_ORDERS_STALE_MS }),
  ]);
}
