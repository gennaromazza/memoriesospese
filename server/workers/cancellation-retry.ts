/**
 * Cancellation Retry Worker
 * 
 * In-process worker che draina bookings in stato 'cancellation_pending'
 * e riprova la cancellazione Calendar con exponential backoff.
 * 
 * Features:
 * - Exponential backoff (2^n minuti, max 60min)
 * - Max retry attempts (10)
 * - Idempotent retry logic
 * - Alert logging dopo max attempts
 */

import { db, Timestamp, FieldValue } from '../firebase-admin.js';
import type { Timestamp as TimestampType } from '@google-cloud/firestore';
import { nowRomeDate } from '../utils/timezone.js';

const MAX_RETRY_ATTEMPTS = 10;
const WORKER_INTERVAL_MS = 60 * 1000; // 1 minute
const BATCH_SIZE = 10;

interface CancellationMetadata {
  initiatedAt: TimestampType;
  reason: string;
  googleCalendarEventId: string;
  originalStato: string;
  retryAttempts: number;
  lastAttemptAt: TimestampType;
  nextRetryAt: TimestampType;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
}

async function processPendingCancellation(bookingId: string, metadata: CancellationMetadata) {
  const bookingRef = db.collection('bookings').doc(bookingId);
  
  try {
    // Verificamassimo tentativi raggiunti
    if (metadata.retryAttempts >= MAX_RETRY_ATTEMPTS) {
      console.error(`🚨 ALERT: Booking ${bookingId} ha raggiunto ${MAX_RETRY_ATTEMPTS} tentativi - manual intervention richiesta`);
      await bookingRef.update({
        'cancellationMetadata.maxRetriesReached': true,
        'cancellationMetadata.alertedAt': FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });
      return;
    }

    // Verifica se è il momento di ritentare (rispetta backoff)
    const now = nowRomeDate();
    const nextRetry = metadata.nextRetryAt.toDate();
    if (now < nextRetry) {
      return; // Non ancora il momento
    }

    console.log(`🔄 Retry cancellazione booking ${bookingId} (attempt ${metadata.retryAttempts + 1}/${MAX_RETRY_ATTEMPTS})`);

    // Import deleteEvent dinamico
    const { deleteEvent } = await import('../google-calendar.js');
    const googleCalendarEventId = metadata.googleCalendarEventId;

    // Tenta Calendar delete
    let calendarDeleted = false;
    try {
      await deleteEvent('primary', googleCalendarEventId);
      calendarDeleted = true;
      console.log(`✅ Worker: Evento Calendar cancellato: ${googleCalendarEventId}`);
    } catch (error: any) {
      // 404 = evento già cancellato, continua con finalizzazione
      if (error.code === 404 || error.message?.includes('Not Found')) {
        calendarDeleted = true;
        console.log(`ℹ️  Worker: Evento già cancellato (404) - procedo con finalizzazione`);
      } else {
        // Calendar API failure persistente - update retry metadata
        throw error;
      }
    }

    // Se Calendar delete success, finalizza cancellazione
    if (calendarDeleted) {
      // IMPORTANTE: Refetch per latest workflow state
      const latestBookingDoc = await bookingRef.get();
      if (!latestBookingDoc.exists) {
        console.error(`❌ Worker: Booking ${bookingId} non trovato durante finalizzazione`);
        return;
      }

      const latestData = latestBookingDoc.data();
      const latestWorkflowState = latestData?.statoWorkflow;

      // Import syncBookingWorkflowState
      const { syncBookingWorkflowState } = await import('../../shared/workflow-helpers.js');
      const workflowUpdate = syncBookingWorkflowState('cancellata', latestWorkflowState);

      await bookingRef.update({
        stato: 'cancellata',
        ...workflowUpdate,
        googleCalendarEventId: FieldValue.delete(),
        cancelledAt: FieldValue.serverTimestamp(),
        cancelledReason: 'Evento cancellato da automated retry worker',
        cancellationMetadata: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp()
      });

      console.log(`✅ Worker: Booking ${bookingId} finalizzato → stato='cancellata'`);
    }

  } catch (error: any) {
    // Calendar delete fallito - update retry metadata con backoff
    const retryAttempts = metadata.retryAttempts + 1;
    const backoffMinutes = Math.min(Math.pow(2, retryAttempts), 60);
    const nextRetryAt = new Date(Date.now() + backoffMinutes * 60 * 1000);

    await bookingRef.update({
      'cancellationMetadata.retryAttempts': retryAttempts,
      'cancellationMetadata.lastAttemptAt': FieldValue.serverTimestamp(),
      'cancellationMetadata.nextRetryAt': Timestamp.fromDate(nextRetryAt),
      'cancellationMetadata.lastErrorCode': error.code || 'UNKNOWN',
      'cancellationMetadata.lastErrorMessage': error.message,
      updatedAt: FieldValue.serverTimestamp()
    });

    console.warn(`⚠️  Worker: Retry failed per booking ${bookingId} - attempt ${retryAttempts}, next retry in ${backoffMinutes}min`);
  }
}

async function runCancellationRetryWorker() {
  try {
    const now = Timestamp.now();
    
    // Query bookings in cancellation_pending pronti per retry
    // IMPORTANTE: orderBy required per inequality filter nextRetryAt
    const pendingSnapshot = await db.collection('bookings')
      .where('stato', '==', 'cancellation_pending')
      .where('cancellationMetadata.nextRetryAt', '<=', now)
      .orderBy('cancellationMetadata.nextRetryAt', 'asc')
      .limit(BATCH_SIZE)
      .get();

    if (pendingSnapshot.empty) {
      // No pending cancellations ready for retry
      return;
    }

    console.log(`🔄 Worker: Trovati ${pendingSnapshot.size} bookings pending pronti per retry`);

    // Process in parallelo (ma limitati a BATCH_SIZE)
    const promises = pendingSnapshot.docs.map(doc => {
      const metadata = doc.data().cancellationMetadata as CancellationMetadata;
      return processPendingCancellation(doc.id, metadata);
    });

    await Promise.allSettled(promises);

  } catch (error) {
    console.error('❌ Worker: Errore durante retry cycle:', error);
  }
}

// Export worker loop
export function startCancellationRetryWorker() {
  console.log(`🚀 Cancellation Retry Worker started (interval: ${WORKER_INTERVAL_MS}ms, max attempts: ${MAX_RETRY_ATTEMPTS})`);
  
  // Run immediately on start
  runCancellationRetryWorker();
  
  // Then run periodically
  const intervalId = setInterval(runCancellationRetryWorker, WORKER_INTERVAL_MS);

  // Return cleanup function
  return () => {
    console.log('⏹️  Cancellation Retry Worker stopped');
    clearInterval(intervalId);
  };
}

// Export function per manual trigger (admin endpoint)
export async function triggerManualRetry(bookingId: string) {
  const bookingDoc = await db.collection('bookings').doc(bookingId).get();
  
  if (!bookingDoc.exists) {
    throw new Error('Booking non trovato');
  }

  const data = bookingDoc.data();
  if (data?.stato !== 'cancellation_pending') {
    throw new Error(`Booking non in cancellation_pending (stato attuale: ${data?.stato})`);
  }

  const metadata = data.cancellationMetadata as CancellationMetadata;
  await processPendingCancellation(bookingId, metadata);
  
  return { success: true, message: 'Manual retry completato' };
}
