/**
 * useJobFinancials Hook
 * Calcola dati finanziari del job in real-time da payment schedules e costi
 * GESTISCE DUPLICATI: fetcha TUTTI gli schedules del job e aggrega i totali
 */

import { useQuery } from '@tanstack/react-query';
import { getPaymentSchedulesForJob } from '@/lib/payment-schedules';
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
 * Fetcha TUTTI i payment schedules e aggrega i totali per gestire duplicati
 */
export function useJobFinancials(job: Job | null | undefined): JobFinancialsData {
  // Fetch TUTTI i payment schedules del job (gestisce duplicati)
  // NOTA: usa queryKey DIVERSA da PaymentScheduleSection per evitare cache type conflicts
  const { data: paymentSchedules, isLoading: scheduleLoading } = useQuery({
    queryKey: ['paymentSchedules', 'aggregated', job?.id], // Plurale + 'aggregated' per separare da singolo schedule
    queryFn: () => getPaymentSchedulesForJob(job!.id),
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

  // Durante caricamento schedules, restituisci valori da job snapshot come fallback
  if (scheduleLoading) {
    return {
      totalePreventivato: job.financials?.totalePreventivato || 0,
      totalePagato: job.financials?.totalePagato || 0, // Fallback a snapshot
      saldoResiduo: job.financials?.saldoResiduo || 0,
      totaleCosti: job.costi?.reduce((sum, c) => sum + c.importo, 0) || 0,
      margine: (job.financials?.totalePreventivato || 0) - (job.costi?.reduce((sum, c) => sum + c.importo, 0) || 0),
      isLoading: true,
    };
  }

  // 1. Totale preventivato (da job snapshot - aggiornato da backend quando viene creato preventivo)
  const totalePreventivato = job.financials?.totalePreventivato || 0;

  // 2. Total pagato - Prima calcola da payment schedules, poi fallback a job.financials
  // Somma tutti i pagamenti con importoPagato > 0 da tutti gli schedules
  const schedulesTotalePagato = (paymentSchedules || []).reduce((total, schedule) => {
    const scheduleTotalPagato = (schedule.payments || [])
      .filter(p => p.importoPagato && p.importoPagato > 0)
      .reduce((sum, p) => sum + (p.importoPagato || 0), 0);
    return total + scheduleTotalPagato;
  }, 0);
  
  // Se non ci sono payment schedules o il totale calcolato è 0, usa il fallback da job.financials
  // Questo supporta i dati legacy importati che hanno totalePagato nel job ma non payment schedules
  const hasPaymentSchedules = paymentSchedules && paymentSchedules.length > 0;
  const totalePagato = hasPaymentSchedules && schedulesTotalePagato > 0 
    ? schedulesTotalePagato 
    : (job.financials?.totalePagato || 0);

  // 3. Totale costi REAL-TIME da array costi
  const totaleCosti = job.costi?.reduce((sum, c) => sum + c.importo, 0) || 0;

  // 4. Calcoli derivati - Usa saldoResiduo da job.financials se disponibile, altrimenti calcola
  const saldoResiduo = hasPaymentSchedules && schedulesTotalePagato > 0
    ? totalePreventivato - totalePagato
    : (job.financials?.saldoResiduo ?? (totalePreventivato - totalePagato));
  const margine = totalePreventivato - totaleCosti;

  return {
    totalePreventivato,
    totalePagato,
    saldoResiduo,
    totaleCosti,
    margine,
    isLoading: false,
  };
}
