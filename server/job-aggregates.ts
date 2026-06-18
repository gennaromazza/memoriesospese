/**
 * Job Aggregates - Denormalizzazione stato preventivo e conteggio transazioni sul job
 *
 * I documenti 'jobs' mantengono due campi riassuntivi:
 *  - quoteStatus: { hasQuote, isSigned, isEmailSent } (OR logico sui preventivi collegati)
 *  - transactionCount: numero totale transazioni sugli ordini collegati
 *
 * Questi campi vengono ricalcolati sui write-path rilevanti (creazione/firma/invio/
 * eliminazione preventivo, aggiunta/rimozione transazione, link/unlink/eliminazione
 * ordine), leggendo SOLO i documenti del singolo job interessato. Così l'endpoint
 * '/api/jobs/list-aggregates' non deve più scorrere le intere collezioni 'orders' e
 * 'quotes' ad ogni caricamento della pagina "Lista Lavori".
 */

import { db, FieldValue } from './firebase-admin.js';

export interface JobQuoteStatus {
  hasQuote: boolean;
  isSigned: boolean;
  isEmailSent: boolean;
}

/**
 * Stato preventivo aggregato a partire dai documenti quote di un job.
 * Stessa semantica usata storicamente dall'endpoint list-aggregates.
 */
export function computeQuoteStatusFromQuotes(quotes: any[]): JobQuoteStatus {
  const status: JobQuoteStatus = { hasQuote: false, isSigned: false, isEmailSent: false };

  for (const quote of quotes) {
    status.hasQuote = true;

    const quoteIsSigned = !!quote.signature || quote.status === 'firmato';
    const quoteIsEmailSent = !!quote.emailSentAt || !!quote.sentTo ||
      (!!quote.status && quote.status !== 'bozza');

    if (quoteIsSigned) status.isSigned = true;
    if (quoteIsEmailSent) status.isEmailSent = true;
  }

  return status;
}

/**
 * Numero transazioni di un singolo ordine (include fallback legacy 'acconto').
 * Stessa semantica usata storicamente dall'endpoint list-aggregates e dal client.
 */
export function computeOrderTransactionCount(order: any): number {
  if (Array.isArray(order?.transactions) && order.transactions.length > 0) {
    return order.transactions.length;
  }
  if (order?.acconto && order.acconto > 0) {
    return 1;
  }
  return 0;
}

/**
 * Ricalcola e salva quoteStatus sul job leggendo solo i suoi preventivi.
 * Best-effort: non solleva eccezioni (un job appena eliminato non deve far fallire il write-path chiamante).
 */
export async function recomputeJobQuoteStatus(jobId: string | undefined | null): Promise<void> {
  if (!jobId) return;
  try {
    const quotesSnap = await db.collection('quotes').where('jobId', '==', jobId).get();
    const quoteStatus = computeQuoteStatusFromQuotes(quotesSnap.docs.map(d => d.data()));
    await db.collection('jobs').doc(jobId).update({
      quoteStatus,
      updatedAt: FieldValue.serverTimestamp(),
    });
  } catch (error: any) {
    console.warn(`⚠️ recomputeJobQuoteStatus(${jobId}) fallito:`, error?.message || error);
  }
}

/**
 * Ricalcola e salva transactionCount sul job leggendo solo i suoi ordini.
 * Best-effort: non solleva eccezioni.
 */
export async function recomputeJobTransactionCount(jobId: string | undefined | null): Promise<void> {
  if (!jobId) return;
  try {
    const ordersSnap = await db.collection('orders').where('jobId', '==', jobId).get();
    let transactionCount = 0;
    ordersSnap.docs.forEach(d => {
      transactionCount += computeOrderTransactionCount(d.data());
    });
    await db.collection('jobs').doc(jobId).update({
      transactionCount,
      updatedAt: FieldValue.serverTimestamp(),
    });
  } catch (error: any) {
    console.warn(`⚠️ recomputeJobTransactionCount(${jobId}) fallito:`, error?.message || error);
  }
}

/**
 * Ricalcola entrambi gli aggregati per un job (quoteStatus + transactionCount).
 * Usato dall'endpoint generico chiamato dai write-path client.
 */
export async function recomputeJobAggregates(jobId: string | undefined | null): Promise<void> {
  if (!jobId) return;
  await Promise.all([
    recomputeJobQuoteStatus(jobId),
    recomputeJobTransactionCount(jobId),
  ]);
}
