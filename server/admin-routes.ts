/**
 * Admin Routes
 * Endpoints per admin UI - cancellation management, reconciliation, health checks
 */

import express from 'express';
import { db } from './firebase-admin.js';
import { triggerManualRetry } from './workers/cancellation-retry.js';

const router = express.Router();

/**
 * GET /api/admin/pending-cancellations
 * Lista bookings in cancellation_pending per admin monitoring
 */
router.get('/pending-cancellations', async (req, res) => {
  try {
    const pendingSnapshot = await db.collection('bookings')
      .where('stato', '==', 'cancellation_pending')
      .orderBy('cancellationMetadata.initiatedAt', 'desc')
      .limit(100)
      .get();

    const pendingBookings = pendingSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        cliente: data.cliente,
        campagna: data.campagna,
        dataShootingInizio: data.dataShootingInizio,
        cancellationMetadata: data.cancellationMetadata,
        updatedAt: data.updatedAt
      };
    });

    res.json({
      success: true,
      count: pendingBookings.length,
      pendingBookings
    });

  } catch (error: any) {
    console.error('❌ Errore fetching pending cancellations:', error);
    res.status(500).json({
      error: 'Errore durante il recupero delle cancellazioni pending',
      details: error.message
    });
  }
});

/**
 * POST /api/admin/retry-cancellation/:bookingId
 * Manual trigger retry per booking specifico
 */
router.post('/retry-cancellation/:bookingId', async (req, res) => {
  try {
    const { bookingId } = req.params;
    
    const result = await triggerManualRetry(bookingId);
    
    res.json(result);

  } catch (error: any) {
    console.error(`❌ Errore manual retry booking ${req.params.bookingId}:`, error);
    res.status(500).json({
      error: 'Errore durante il retry manuale',
      details: error.message
    });
  }
});

/**
 * GET /api/admin/worker-health
 * Health check del cancellation retry worker
 */
router.get('/worker-health', async (req, res) => {
  try {
    // Query stats sullo stato dei pending cancellations
    const pendingSnapshot = await db.collection('bookings')
      .where('stato', '==', 'cancellation_pending')
      .get();

    const totalPending = pendingSnapshot.size;
    const maxRetriesReached = pendingSnapshot.docs.filter(doc => 
      doc.data().cancellationMetadata?.maxRetriesReached === true
    ).length;

    const recentFailures = pendingSnapshot.docs.filter(doc => {
      const metadata = doc.data().cancellationMetadata;
      if (!metadata?.lastAttemptAt) return false;
      
      const lastAttempt = metadata.lastAttemptAt.toDate();
      const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
      return lastAttempt > fifteenMinutesAgo && metadata.lastErrorCode;
    }).length;

    res.json({
      success: true,
      workerStatus: 'active',
      stats: {
        totalPending,
        maxRetriesReached,
        recentFailures
      },
      alerts: maxRetriesReached > 0 ? [
        `⚠️  ${maxRetriesReached} booking(s) hanno raggiunto max retry attempts - manual intervention richiesta`
      ] : []
    });

  } catch (error: any) {
    console.error('❌ Errore worker health check:', error);
    res.status(500).json({
      error: 'Errore durante health check',
      details: error.message
    });
  }
});

/**
 * POST /api/admin/jobs/reconcile-calendar
 * Backfill googleCalendarEventId per legacy jobs con blocking status
 * Utile dopo migrazioni o per riparazione automatica
 */
router.post('/jobs/reconcile-calendar', async (req, res) => {
  try {
    console.log('🔄 Avvio reconciliation Calendar events per legacy jobs...');
    
    // Stati bloccanti che richiedono Calendar event
    const BLOCKING_STATUSES = ['confermato', 'shooting_fatto', 'selezione_pending', 'produzione'];
    
    // Cerca tutti jobs con blocking status
    const jobsSnapshot = await db.collection('jobs')
      .where('status', 'in', BLOCKING_STATUSES)
      .get();
    
    const allJobs = jobsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    // Filtra solo quelli SENZA googleCalendarEventId
    const jobsWithoutCalendarId = allJobs.filter(job => !job.googleCalendarEventId);
    
    console.log(`📊 Trovati ${allJobs.length} jobs con blocking status, ${jobsWithoutCalendarId.length} senza googleCalendarEventId`);
    
    if (jobsWithoutCalendarId.length === 0) {
      return res.json({
        success: true,
        message: 'Nessun job da riconciliare',
        stats: {
          total: allJobs.length,
          needsReconciliation: 0,
          success: 0,
          failures: 0
        }
      });
    }
    
    // Process reconciliation per ogni job
    const results = {
      success: [] as Array<{ jobId: string; eventId: string; alreadyExisted: boolean }>,
      failures: [] as Array<{ jobId: string; error: string }>
    };
    
    for (const job of jobsWithoutCalendarId) {
      try {
        // Chiama backend endpoint per creare/trovare Calendar event
        const response = await fetch(`http://localhost:5000/api/jobs/${job.id}/calendar-event`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          results.failures.push({
            jobId: job.id,
            error: errorData.error || `HTTP ${response.status}`
          });
          continue;
        }
        
        const result = await response.json();
        results.success.push({
          jobId: job.id,
          eventId: result.eventId,
          alreadyExisted: result.alreadyExists || false
        });
        
      } catch (error: any) {
        results.failures.push({
          jobId: job.id,
          error: error.message || 'Unknown error'
        });
      }
    }
    
    console.log(`✅ Reconciliation completata: ${results.success.length} success, ${results.failures.length} failures`);
    
    res.json({
      success: true,
      message: 'Reconciliation completata',
      stats: {
        total: allJobs.length,
        needsReconciliation: jobsWithoutCalendarId.length,
        success: results.success.length,
        failures: results.failures.length
      },
      details: {
        successJobs: results.success,
        failedJobs: results.failures
      }
    });
    
  } catch (error: any) {
    console.error('❌ Errore durante reconciliation Calendar events:', error);
    res.status(500).json({
      error: 'Errore durante reconciliation',
      details: error.message
    });
  }
});

export default router;
