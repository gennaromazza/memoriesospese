/**
 * useJobFinancials Hook
 * Calcola dati finanziari del job in real-time da payment schedules e costi
 */

import { useQuery } from '@tanstack/react-query';
import { getPaymentScheduleForJob } from '@/lib/payment-schedules';
import type { Job } from '@shared/jobs-types';

interface JobFinancialsData {
  totalePreventivato: number;
  totalePagato: number;
  saldoResiduo: number;
  totaleCosti: number;
  margine: number;
  isLoading: boolean;
}

/**
 * Hook per calcolare i dati finanziari del job in tempo reale
 * Fetcha payment schedules per calcolare totalePagato correttamente
 */
export function useJobFinancials(job: Job | null | undefined): JobFinancialsData {
  // Fetch payment schedule del job
  const { data: paymentSchedule, isLoading: scheduleLoading } = useQuery({
    queryKey: ['paymentSchedule', job?.id],
    queryFn: () => getPaymentScheduleForJob(job!.id),
    enabled: !!job?.id,
    staleTime: 10000, // 10 secondi - refresh frequente per vedere pagamenti aggiornati
  });

  if (!job) {
    return {
      totalePreventivato: 0,
      totalePagato: 0,
      saldoResiduo: 0,
      totaleCosti: 0,
      margine: 0,
      isLoading: false,
    };
  }

  // 1. Totale preventivato (da job snapshot - aggiornato da backend quando viene creato preventivo)
  const totalePreventivato = job.financials?.totalePreventivato || 0;

  // 2. Total pagato REAL-TIME da payment schedule
  // Somma tutti i pagamenti con importoPagato (stato 'pagato' o 'parziale')
  const totalePagato = paymentSchedule?.payments
    .filter(p => p.importoPagato && p.importoPagato > 0)
    .reduce((sum, p) => sum + (p.importoPagato || 0), 0) || 0;

  // 3. Totale costi REAL-TIME da array costi
  const totaleCosti = job.costi?.reduce((sum, c) => sum + c.importo, 0) || 0;

  // 4. Calcoli derivati
  const saldoResiduo = totalePreventivato - totalePagato;
  const margine = totalePreventivato - totaleCosti;

  return {
    totalePreventivato,
    totalePagato,
    saldoResiduo,
    totaleCosti,
    margine,
    isLoading: scheduleLoading,
  };
}
